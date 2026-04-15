const ClinicalRecordRepository = require('../../repositories/clinicalRecord.repository');
const FabricClinicalRecordRepository = require('../../repositories/fabricClinicalRecord.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const IdentityRepository = require('../../repositories/identity.repository');
const ProxyReencryptionClient = require('../../clients/proxyReencryption/proxyReencryption.client');
const { mapClinicalRecord } = require('../../mappers/clinicalRecord.mapper');
const { createAppError } = require('../../utils/app-error');
const {
  getRecordIdentifier,
  normalizePermissions,
  normalizeScopeMaterials,
  isPermissionActive,
  getEffectiveScopes,
  filterScopeMaterialsByScopes,
  filterReferencesByScopes,
} = require('../../utils/clinicalRecord.utils');

/**
 * Service responsible for coordinating clinical record use cases.
 */
class ClinicalRecordOrchestrationService {
  /**
   * Build the orchestration service with all repository and client
   * dependencies required by the future implementation.
   */
  constructor() {
    this.clinicalRecordRepository = ClinicalRecordRepository;
    this.fabricClinicalRecordRepository = new FabricClinicalRecordRepository();
    this.fabricPermissionRepository = new FabricPermissionRepository();
    this.identityRepository = new IdentityRepository();
    this.proxyReencryptionClient = new ProxyReencryptionClient();
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
      return source;
    }

    return source?.role?.name || source?.role || source?.name || null;
  }

  /**
   * Coordinate retrieval of the authenticated patient's history.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async getPatientHistory(payload, actor) {
    // 1. Validations
    // 1.1 Validate that the actor is authenticated and has the PATIENT role
    if (!actor) {
      throw createAppError('Authentication required to retrieve patient history', 401);
    }
    if (this.getRoleName(actor) !== 'PATIENT') {
      throw createAppError('Only users with PATIENT role can retrieve their own history', 403);
    }

    // 1.2 Resolve the patient pseudoId only from the authenticated actor
    const patientPseudoId = actor.pseudoId || null;
    if (!patientPseudoId) {
      throw createAppError('Authenticated patient pseudoId is required', 400);
    }

    // 1.3 Resolve the patient identity from a trusted source
    const patient = await this.identityRepository.findUserByPseudoId(patientPseudoId);
    if (!patient) {
      throw createAppError('Authenticated patient not found in identity repository', 404);
    }

    // 2. Retrieve clinical references/indexes from the ledger for the patient
    const references = await this.fabricClinicalRecordRepository.getPatientRecordIndexes(patientPseudoId);

    // 3. Retrieve encrypted off-chain clinical records for the patient
    const records = references.length
      ? await this.clinicalRecordRepository.getClinicalRecordsByReferences(references, patientPseudoId)
      : await this.clinicalRecordRepository.getPatientClinicalDocuments(patientPseudoId);

    const referenceMap = new Map(
      references
        .map((reference) => [getRecordIdentifier(reference), reference])
        .filter(([recordId]) => Boolean(recordId))
    );

    return {
      message: 'Patient history retrieved successfully',
      status: 'success',
      action: 'get_patient_history',
      patient: {
        pseudoId: patient.pseudoId || patientPseudoId,
        username: patient.username || null,
      },
      totalRecords: records.length,
      records: records.map((record) => mapClinicalRecord(record, referenceMap.get(getRecordIdentifier(record)) || null)),
    };
  }

  /**
   * Coordinate retrieval of a patient's history by an authorized
   * healthcare professional.
   *
   * @param {Object} payload - Normalized request payload.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async getProfessionalHistory(payload, actor) {
    // 1. Validations
    // 1.1 Validate that the actor is authenticated and has a healthcare professional role
    if (!actor) {
      throw createAppError('Authentication required to retrieve professional history', 401);
    }

    const validRoles = ['DOCTOR', 'LABORATORY', 'PHARMACIST'];
    const actorRole = this.getRoleName(actor)?.toUpperCase() || null;
    if (!validRoles.includes(actorRole)) {
      throw createAppError('Only healthcare professionals can retrieve delegated history', 403);
    }

    // 1.2 Resolve the authenticated professional only from the trusted actor context
    const professionalId = actor.id || null;
    if (!professionalId) {
      throw createAppError('Authenticated professional id is required', 400);
    }

    // 1.3 Validate the target patient identifier from the request payload
    const patientPseudoId = payload?.patientPseudoId || null;
    if (!patientPseudoId) {
      throw createAppError('Missing required field: patientPseudoId', 400);
    }

    // 1.4 Resolve patient and professional identities from trusted repositories
    const patient = await this.identityRepository.findUserByPseudoId(patientPseudoId);
    if (!patient) {
      throw createAppError('Patient not found in identity repository', 404);
    }

    const professional = await this.identityRepository.findUserById(professionalId);
    if (!professional) {
      throw createAppError('Authenticated professional not found in identity repository', 404);
    }

    const professionalRole = this.getRoleName(professional)?.toUpperCase() || null;
    if (!validRoles.includes(professionalRole)) {
      throw createAppError('Authenticated user must have a valid healthcare professional role', 403);
    }

    // 2. Resolve the active delegated permissions for the patient-professional pair
    const permissions = await this.fabricPermissionRepository.getActivePermissionsByPatientAndGrantee(
      patientPseudoId,
      professional.id
    );

    const normalizedPermissions = normalizePermissions(permissions);
    if (normalizedPermissions.length === 0) {
      throw createAppError('No active access grant found for this patient and professional', 404);
    }

    // 3. Validate the permission semantics required for delegated history access
    const readablePermissions = normalizedPermissions.filter(
      (permission) => isPermissionActive(permission) && permission.allowedActions.includes('read')
    );

    if (readablePermissions.length === 0) {
      throw createAppError('The active permissions do not allow delegated read access', 403);
    }

    const permissionIds = readablePermissions
      .map((permission) => permission.permissionId)
      .filter(Boolean);

    if (permissionIds.length === 0) {
      throw createAppError('Active delegated permissions are missing permission identifiers', 500);
    }

    const effectiveScopes = getEffectiveScopes(readablePermissions);

    if (effectiveScopes.length === 0) {
      throw createAppError('The active permission does not grant any readable scopes', 403);
    }

    // 4. Retrieve the delegated scope materials required for the authorized permissions
    const scopeMaterials = await this.fabricPermissionRepository.getScopeMaterialsByPermissionIds(permissionIds);
    const normalizedScopeMaterials = normalizeScopeMaterials(scopeMaterials);
    const activeScopeMaterials = filterScopeMaterialsByScopes(normalizedScopeMaterials, effectiveScopes);

    if (activeScopeMaterials.length === 0) {
      throw createAppError('No active delegated scope material found for the granted permissions', 403);
    }

    const materialScopes = [...new Set(activeScopeMaterials.map((entry) => entry.scopeId))];

    // 5. Retrieve ledger references and keep only the scopes authorized by the active permission
    const references = await this.fabricClinicalRecordRepository.getPatientRecordIndexes(patientPseudoId);

    const scopedReferences = filterReferencesByScopes(references, materialScopes);

    // 6. Retrieve encrypted off-chain records linked to the authorized references
    const records = scopedReferences.length
      ? await this.clinicalRecordRepository.getClinicalRecordsByReferences(scopedReferences, patientPseudoId)
      : [];

    const referenceMap = new Map(
      scopedReferences
        .map((reference) => [getRecordIdentifier(reference), reference])
        .filter(([recordId]) => Boolean(recordId))
    );

    const mappedRecords = records.map((record) =>
      mapClinicalRecord(record, referenceMap.get(getRecordIdentifier(record)) || null)
    );

    // 7. Resolve the delegated cryptographic material required by the frontend
    const delegatedAccessMaterial = await this.proxyReencryptionClient.getDelegatedAccessMaterial({
      patientPseudoId,
      granteeId: professional.id,
      granteeRole: professionalRole,
      permissionIds,
      effectiveScopes: materialScopes,
      scopeMaterials: activeScopeMaterials,
      references: scopedReferences,
      records: mappedRecords,
    });

    return {
      message: 'Professional history retrieved successfully',
      status: 'success',
      action: 'get_professional_history',
      patient: {
        pseudoId: patient.pseudoId || patientPseudoId,
        username: patient.username || null,
      },
      professional: {
        id: professional.id || professionalId,
        role: professionalRole,
        username: professional.username || null,
      },
      permission: readablePermissions.length === 1
        ? {
            permissionId: readablePermissions[0].permissionId,
            allowedScopes: readablePermissions[0].allowedScopes,
            allowedActions: readablePermissions[0].allowedActions,
            validFrom: readablePermissions[0].validFrom,
            validTo: readablePermissions[0].validTo,
          }
        : null,
      permissions: readablePermissions.map((permission) => ({
        permissionId: permission.permissionId,
        allowedScopes: permission.allowedScopes,
        allowedActions: permission.allowedActions,
        validFrom: permission.validFrom,
        validTo: permission.validTo,
      })),
      effectiveScopes: materialScopes,
      totalRecords: mappedRecords.length,
      records: mappedRecords,
      delegatedAccessMaterial: {
        scopeMaterials: activeScopeMaterials,
        ...delegatedAccessMaterial,
      },
    };
  }

  /**
   * Coordinate doctor clinical event registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async registerDoctorEvent(payload, actor) {
    return {
      message: 'Doctor event orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_doctor_event',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendDoctorEvent',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  /**
   * Coordinate laboratory event registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async registerLaboratoryEvent(payload, actor) {
    return {
      message: 'Laboratory event orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_laboratory_event',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendLaboratoryEvent',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  /**
   * Coordinate pharmacy dispatch registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async registerPharmacyDispatch(payload, actor) {
    return {
      message: 'Pharmacy dispatch orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_pharmacy_dispatch',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendPharmacyDispatch',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  /**
   * Normalize the authenticated user context for orchestration responses.
   *
   * @param {Object|null|undefined} actor - Authenticated user context.
   * @returns {Object|null} Sanitized actor representation.
   */
  mapActor(actor) {
    if (!actor) {
      return null;
    }

    return {
      id: actor.id || null,
      pseudoId: actor.pseudoId || null,
      role: actor.role?.name || actor.role || null,
    };
  }
}

module.exports = ClinicalRecordOrchestrationService;
