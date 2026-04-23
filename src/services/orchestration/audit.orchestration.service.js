const FabricClinicalRecordRepository = require('../../repositories/fabricClinicalRecord.repository');
const IdentityRepository = require('../../repositories/identity.repository');
const { createAppError } = require('../../utils/app-error');

/**
 * Service responsible for coordinating patient-facing audit queries.
 */
class AuditOrchestrationService {
  /**
   * Build the orchestration service with its repository dependencies.
   */
  constructor() {
    this.fabricClinicalRecordRepository = new FabricClinicalRecordRepository();
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
      return {
        patient: {
          username: patient.username || patientUsername,
        },
        data: auditEvents,
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
