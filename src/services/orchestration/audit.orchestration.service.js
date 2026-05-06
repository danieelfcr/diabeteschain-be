const FabricClinicalRecordRepository = require('../../repositories/fabricClinicalRecord.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const IdentityRepository = require('../../repositories/identity.repository');
const { createAppError } = require('../../utils/app-error');

const HEALTHCARE_PROFESSIONAL_ROLES = ['DOCTOR', 'LABORATORY', 'PHARMACIST'];

/**
 * Service responsible for coordinating patient-facing audit queries.
 */
class AuditOrchestrationService {
  /**
   * Build the orchestration service with its repository dependencies.
   */
  constructor() {
    this.fabricClinicalRecordRepository = new FabricClinicalRecordRepository();
    this.fabricPermissionRepository = new FabricPermissionRepository();
    this.identityRepository = new IdentityRepository();
  }

  /**
   * Resolve a normalized role name from plain objects or persistence models.
   *
   * @param {Object|string|null|undefined} source - User or role source.
   * @returns {string|null} Normalized role name.
   */
  getRoleName(source) {
    if (!source) {
      return null;
    }

    if (typeof source === 'string') {
      return source.trim().toUpperCase() || null;
    }

    const resolvedRole = source?.role?.name || source?.role || source?.name || null;
    return typeof resolvedRole === 'string' ? resolvedRole.trim().toUpperCase() || null : null;
  }

  /**
   * Build a human-readable full name from identity profile fields.
   *
   * @param {Object|null|undefined} user - Identity user record.
   * @returns {string|null} Full name or username fallback.
   */
  getFullName(user) {
    if (!user) {
      return null;
    }

    const fullName = [
      user.firstName,
      user.middleName,
      user.firstLastName,
      user.secondLastName,
    ]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join(' ');

    return fullName || user.username || null;
  }

  /**
   * Convert an identity user into the patient-facing professional shape.
   *
   * @param {Object|null|undefined} user - Identity user record.
   * @returns {Object|null} Sanitized professional identity.
   */
  mapProfessional(user) {
    if (!user) {
      return null;
    }

    const role = this.getRoleName(user);
    if (!HEALTHCARE_PROFESSIONAL_ROLES.includes(role)) {
      return null;
    }

    const professionalProfile = user.professional || null;
    const organization = professionalProfile?.organization || user.organization || null;
    const organizationId = professionalProfile?.organizationId || user.organizationId || organization?.id || null;

    return {
      id: user.id || null,
      professionalId: user.professionalId || professionalProfile?.professionalId || null,
      username: user.username || null,
      fullName: this.getFullName(user),
      role,
      organization: organization || organizationId
        ? {
            id: organization?.id || organizationId,
            name: organization?.name || null,
          }
        : null,
    };
  }

  /**
   * Read a permission from Fabric once per request.
   *
   * @param {string|null|undefined} permissionId - Permission identifier.
   * @param {Map<string, Promise<Object|null>>} permissionCache - Request cache.
   * @returns {Promise<Object|null>} Permission payload or null when unavailable.
   */
  async getPermissionById(permissionId, permissionCache) {
    if (!permissionId) {
      return null;
    }

    if (!permissionCache.has(permissionId)) {
      permissionCache.set(
        permissionId,
        this.fabricPermissionRepository.getGrantById(permissionId).catch(() => null)
      );
    }

    return permissionCache.get(permissionId);
  }

  /**
   * Read a professional identity once per request.
   *
   * @param {string|null|undefined} userId - Internal professional user id.
   * @param {Map<string, Promise<Object|null>>} professionalCache - Request cache.
   * @returns {Promise<Object|null>} Professional user or null when unavailable.
   */
  async getProfessionalById(userId, professionalCache) {
    if (!userId) {
      return null;
    }

    if (!professionalCache.has(userId)) {
      professionalCache.set(
        userId,
        (async () => {
          const userById = await this.identityRepository.findUserById(userId).catch(() => null);
          if (userById) {
            return userById;
          }

          return this.identityRepository.findUserByUsername(userId).catch(() => null);
        })()
      );
    }

    return professionalCache.get(userId);
  }

  /**
   * Resolve the healthcare professional represented by one audit event.
   *
   * @param {Object} event - Normalized audit event.
   * @param {Object} cache - Per-request lookup cache.
   * @returns {Promise<Object|null>} Professional identity user.
   */
  async resolveProfessionalForAuditEvent(event, cache) {
    const actorRole = this.getRoleName(event.actorRole);
    if (HEALTHCARE_PROFESSIONAL_ROLES.includes(actorRole)) {
      return this.getProfessionalById(event.actorId, cache.professionals);
    }

    if (
      ['GRANT_PERMISSION', 'REVOKE_PERMISSION'].includes(event.action)
      && event.targetType === 'permission'
      && event.targetId
    ) {
      if (event.granteeId || event.professionalId) {
        return this.getProfessionalById(event.granteeId || event.professionalId, cache.professionals);
      }

      const permission = await this.getPermissionById(event.targetId, cache.permissions);
      const permissionPayload = permission?.permission || permission?.data || permission || null;
      return this.getProfessionalById(permissionPayload?.granteeId, cache.professionals);
    }

    return null;
  }

  /**
   * Attach patient-facing professional identity details to audit events.
   *
   * @param {Array<Object>} auditEvents - Normalized ledger audit events.
   * @returns {Promise<Array<Object>>} Audit events enriched with professional.
   */
  async enrichAuditEvents(auditEvents) {
    const cache = {
      permissions: new Map(),
      professionals: new Map(),
    };

    return Promise.all(auditEvents.map(async (event) => ({
      ...event,
      professional: this.mapProfessional(
        await this.resolveProfessionalForAuditEvent(event, cache)
      ),
    })));
  }

  /**
   * Retrieve the audit timeline for the authenticated patient.
   *
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<{data: Array<Object>}>} Simplified audit event response.
   */
  async getMyAuditEvents(actor) {
    if (!actor) {
      throw createAppError('Authentication required to retrieve audit events', 401);
    }

    if (this.getRoleName(actor) !== 'PATIENT') {
      throw createAppError('Only users with PATIENT role can retrieve their own audit events', 403);
    }

    const patientUsername = actor.username || null;
    if (!patientUsername) {
      throw createAppError('Authenticated patient username is required', 400);
    }

    const patient = await this.identityRepository.findUserByUsername(patientUsername);
    if (!patient) {
      throw createAppError('Authenticated patient not found in identity repository', 404);
    }
    if (this.getRoleName(patient) !== 'PATIENT') {
      throw createAppError('Authenticated user must have PATIENT role', 403);
    }

    const patientPseudoId = patient.pseudoId || null;
    if (!patientPseudoId) {
      throw createAppError('Authenticated patient pseudoId is required', 400);
    }

    try {
      const auditEvents = await this.fabricClinicalRecordRepository.getAuditEventsByPatientPseudoId(patientPseudoId);
      const enrichedAuditEvents = await this.enrichAuditEvents(auditEvents);

      return {
        patient: {
          username: patient.username || patientUsername,
        },
        data: enrichedAuditEvents,
      };
    } catch (error) {
      if (error?.statusCode) {
        throw error;
      }

      throw createAppError('Failed to retrieve audit events from blockchain', 502);
    }
  }
}

module.exports = AuditOrchestrationService;
