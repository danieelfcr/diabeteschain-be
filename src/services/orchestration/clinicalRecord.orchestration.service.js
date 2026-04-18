const crypto = require('crypto');
const ClinicalRecordRepository = require('../../repositories/clinicalRecord.repository');
const FabricClinicalRecordRepository = require('../../repositories/fabricClinicalRecord.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const IdentityRepository = require('../../repositories/identity.repository');
const ScopeCatalogService = require('../infrastructure/scopeCatalog.service');
const { mapClinicalRecord } = require('../../mappers/clinicalRecord.mapper');
const { createAppError } = require('../../utils/app-error');
const {
  getRecordIdentifier,
  normalizePermission,
  normalizePermissions,
  isPermissionActive,
  getEffectiveScopes,
  filterReferencesByScopes,
  normalizeRecordType,
  getLedgerAuthorRole,
  toPlainObject,
  permissionAllowsAction,
  validateRequestedScopes,
  buildClinicalRecordDocument,
  buildClinicalRecordIndex,
} = require('../../utils/clinicalRecord.utils');
const {
  buildDoctorConsultationSignaturePayload,
  buildLaboratoryResultSignaturePayload,
  buildPharmacyDispatchSignaturePayload,
} = require('../../utils/signaturePayload.utils');

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
    this.scopeCatalogService = new ScopeCatalogService();
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
   * Verify a detached request signature with the actor public key.
   *
   * @param {Object} input - Signature verification input.
   * @param {string} input.publicKey - Actor public key.
   * @param {Object} input.payload - Structured payload signed by the client.
   * @param {string} input.signature - Base64 detached signature.
   * @param {string} input.errorMessage - Error message used on failure.
   */
  async verifyRequestSignature({ publicKey, payload, signature, errorMessage }) {
    if (!publicKey) {
      throw createAppError('Authenticated actor public key is required', 400);
    }

    let isSignatureValid = false;

    try {
      isSignatureValid = await this.identityRepository.verifySignature({
        publicKey,
        payload,
        signature,
      });
    } catch (error) {
      isSignatureValid = false;
    }

    if (!isSignatureValid) {
      throw createAppError(errorMessage, 400);
    }
  }

  /**
   * Resolve and validate the shared context required to register clinical events.
   *
   * @param {Object} options - Context resolution options.
   * @param {Object} options.actor - Authenticated actor.
   * @param {string} options.requiredRole - Expected healthcare professional role.
   * @param {string} options.patientPseudoId - Target patient pseudo identifier.
   * @param {Object} options.signaturePayload - Structured signature payload.
   * @param {string} options.signature - Detached signature provided by the client.
   * @param {string[]} options.requestedScopes - Requested clinical scopes.
   * @param {string} options.invalidSignatureMessage - Error message for invalid signature.
   * @returns {Promise<Object>} Validated registration context.
   */
  async resolveClinicalRegistrationContext({
    actor,
    requiredRole,
    patientPseudoId,
    signaturePayload,
    signature,
    requestedScopes,
    invalidSignatureMessage,
  }) {
    // 1. Validate the authenticated actor and role.
    if (!actor) {
      throw createAppError('Authentication required to register clinical events', 401);
    }

    const actorRole = this.getRoleName(actor);
    if (actorRole !== requiredRole) {
      throw createAppError(`Only users with ${requiredRole} role can register this clinical event`, 403);
    }

    const professionalId = actor.id || null;
    if (!professionalId) {
      throw createAppError('Authenticated professional id is required', 400);
    }

    if (!patientPseudoId) {
      throw createAppError('Missing required field: patientPseudoId', 400);
    }

    if (!signature) {
      throw createAppError('Missing required field: signature', 400);
    }

    // 2. Validate that the requested clinical scopes exist off-chain.
    await this.scopeCatalogService.assertActiveScopeIds(requestedScopes);

    // 3. Resolve patient and professional identities from trusted sources.
    const patient = await this.identityRepository.findUserByPseudoId(patientPseudoId);
    if (!patient) {
      throw createAppError('Patient not found in identity repository', 404);
    }

    const professional = await this.identityRepository.findUserById(professionalId);
    if (!professional) {
      throw createAppError('Authenticated professional not found in identity repository', 404);
    }

    const professionalRole = this.getRoleName(professional)?.toUpperCase() || null;
    if (professionalRole !== requiredRole) {
      throw createAppError(`Authenticated user must have ${requiredRole} role`, 403);
    }

    // 4. Verify the signature before persisting anything.
    await this.verifyRequestSignature({
      publicKey: professional.publicKey,
      payload: signaturePayload,
      signature,
      errorMessage: invalidSignatureMessage,
    });

    // 5. Re-check the active write permission in blockchain.
    const permission = normalizePermission(
      await this.fabricPermissionRepository.getActivePermissionByPatientAndGrantee(
        patientPseudoId,
        professional.id
      )
    );

    if (!permission || !isPermissionActive(permission)) {
      throw createAppError('No active write access grant found for this patient and professional', 404);
    }

    if (!permissionAllowsAction(permission, 'write')) {
      throw createAppError('The active permission does not allow write access', 403);
    }

    validateRequestedScopes(permission, requestedScopes);

    return {
      actor,
      patient,
      professional,
      professionalRole,
      authorRole: getLedgerAuthorRole(professionalRole),
      patientPseudoId,
      permission,
    };
  }

  /**
   * Resolve and validate the record that a new event is based on.
   *
   * @param {Object} options - Base record lookup options.
   * @param {string} options.patientPseudoId - Target patient pseudo identifier.
   * @param {string} options.recordId - Record identifier referenced by basedOn.
   * @param {string} options.expectedRecordType - Expected base record type.
   * @param {string} options.label - Human-readable record label for errors.
   * @param {string|null} [options.professionalId=null] - Professional identifier used for audited lookups.
   * @param {string|null} [options.professionalRole=null] - Professional role used for audited lookups.
   * @returns {Promise<{record: Object, reference: Object}>} Base record and ledger reference.
   */
  async resolveBaseClinicalRecord({
    patientPseudoId,
    recordId,
    expectedRecordType,
    label,
    professionalId = null,
    professionalRole = null,
  }) {
    if (!recordId) {
      throw createAppError('Missing required field: basedOn', 400);
    }

    const baseRecord = await this.clinicalRecordRepository.findById(recordId);
    if (!baseRecord) {
      throw createAppError(`${label} not found`, 404);
    }

    if (baseRecord.patientPseudoId !== patientPseudoId) {
      throw createAppError(`${label} does not belong to the provided patient`, 400);
    }

    if (normalizeRecordType(baseRecord.recordType) !== expectedRecordType) {
      throw createAppError(`${label} must be a ${expectedRecordType}`, 400);
    }

    const baseReference = await this.fabricClinicalRecordRepository.getClinicalRecordIndexByRecordId(
      patientPseudoId,
      recordId,
      professionalId && professionalRole
        ? {
            professionalId,
            professionalRole,
          }
        : null
    );

    if (!baseReference) {
      throw createAppError(`${label} clinical index not found in blockchain`, 404);
    }

    const referenceRecordType = normalizeRecordType(baseReference.recordType);
    if (referenceRecordType && referenceRecordType !== expectedRecordType) {
      throw createAppError(`${label} blockchain index does not match the expected record type`, 400);
    }

    const referenceStatus = baseReference.status?.toUpperCase() || null;
    if (referenceStatus && referenceStatus !== 'ACTIVE') {
      throw createAppError(`${label} is not active`, 400);
    }

    return {
      record: baseRecord,
      reference: baseReference,
    };
  }

  /**
   * Persist one clinical record and register its blockchain index.
   *
   * @param {Object} options - Registration options.
   * @returns {Promise<{record: Object, index: Object}>} Registered record response.
   */
  async registerClinicalRecordEvent(options) {
    const context = options.context || await this.resolveClinicalRegistrationContext({
      actor: options.actor,
      requiredRole: options.requiredRole,
      patientPseudoId: options.patientPseudoId,
      signaturePayload: options.signaturePayload,
      signature: options.signature,
      requestedScopes: options.requestedScopes,
      invalidSignatureMessage: options.invalidSignatureMessage,
    });

    const recordInput = options.recordInput || null;
    if (!recordInput) {
      throw createAppError('Clinical record payload is required', 400);
    }

    // 1. Validate the target scope against the active permission.
    validateRequestedScopes(context.permission, [recordInput.scopeId]);

    const recordId = options.recordId || crypto.randomUUID();
    const encounterId = options.encounterId !== undefined
      ? options.encounterId
      : options.recordType === 'ENCOUNTER'
        ? recordId
        : null;

    const clinicalRecordData = buildClinicalRecordDocument({
      recordId,
      patientPseudoId: context.patientPseudoId,
      recordType: options.recordType,
      recordInput,
      encounterId,
      relationships: options.relationships,
    });

    let savedRecord = null;

    try {
      // 2. Persist the encrypted record in MongoDB.
      savedRecord = await this.clinicalRecordRepository.create(clinicalRecordData);
      const savedRecordObject = toPlainObject(savedRecord);

      // 3. Register the matching clinical index in blockchain.
      const clinicalRecordIndex = buildClinicalRecordIndex({
        record: savedRecordObject,
        context,
      });

      const registeredIndex = await this.fabricClinicalRecordRepository.registerClinicalRecordIndex(
        clinicalRecordIndex
      );

      return {
        record: mapClinicalRecord(
          savedRecordObject,
          registeredIndex && typeof registeredIndex === 'object' ? registeredIndex : clinicalRecordIndex
        ),
        index: registeredIndex && typeof registeredIndex === 'object' ? registeredIndex : clinicalRecordIndex,
      };
    } catch (error) {
      if (savedRecord?._id) {
        await this.clinicalRecordRepository.deleteById(recordId).catch(() => null);
      }

      throw error;
    }
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
    const actorRole = this.getRoleName(actor);
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

    const professionalRole = this.getRoleName(professional);
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
      (permission) => isPermissionActive(permission) && permissionAllowsAction(permission, 'read')
    );

    if (readablePermissions.length === 0) {
      throw createAppError('The active permissions do not allow delegated read access', 403);
    }

    const effectiveScopes = getEffectiveScopes(readablePermissions);

    if (effectiveScopes.length === 0) {
      throw createAppError('The active permission does not grant any readable scopes', 403);
    }

    const activeCatalogScopeIds = new Set(await this.scopeCatalogService.listActiveScopeIds());
    const catalogEffectiveScopes = effectiveScopes.includes('*')
      ? [...activeCatalogScopeIds]
      : effectiveScopes.filter((scopeId) => activeCatalogScopeIds.has(scopeId));

    if (catalogEffectiveScopes.length === 0) {
      throw createAppError('The active permissions do not reference any active clinical scope', 403);
    }

    // 4. PRE is intentionally disabled in this branch, so delegated scope
    // material is not required to retrieve records. The permission scopes are
    // used directly for the backend-to-blockchain validation flow.
    const references = await this.fabricClinicalRecordRepository.getPatientRecordIndexesWithAudit({
      patientPseudoId,
      professionalId: professional.id,
      professionalRole,
    });

    const scopedReferences = filterReferencesByScopes(references, catalogEffectiveScopes);

    // 5. Retrieve encrypted off-chain records linked to the authorized references
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
      effectiveScopes: catalogEffectiveScopes,
      totalRecords: mappedRecords.length,
      records: mappedRecords,
      delegatedAccessMaterial: {
        enabled: false,
        retrievalMode: 'direct_backend_blockchain',
        effectiveScopes: catalogEffectiveScopes,
        scopeMaterials: [],
      },
    };
  }

  /**
   * Coordinate doctor consultation registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Orchestration response.
   */
  async registerDoctorConsultation(payload, actor) {
    // 1. Build the explicit signature payload for the full consultation request.
    const signaturePayload = buildDoctorConsultationSignaturePayload(payload);

    const requestedScopes = [
      payload.encounter?.scopeId,
      payload.labOrder?.scopeId,
      payload.prescription?.scopeId,
    ].filter(Boolean);

    // 2. Resolve the shared validated context once for the whole request.
    const context = await this.resolveClinicalRegistrationContext({
      actor,
      requiredRole: 'DOCTOR',
      patientPseudoId: payload.patientPseudoId,
      signaturePayload,
      signature: payload.signature,
      requestedScopes,
      invalidSignatureMessage: 'Invalid signature for doctor consultation registration',
    });

    // 3. Register the root encounter record.
    const encounterRegistration = await this.registerClinicalRecordEvent({
      context,
      recordType: 'ENCOUNTER',
      recordInput: payload.encounter,
    });

    const encounterId = encounterRegistration.record.recordId;

    // 4. Register optional child records linked to the encounter.
    const labOrderRegistration = payload.labOrder
      ? await this.registerClinicalRecordEvent({
          context,
          recordType: 'LAB_ORDER',
          recordInput: payload.labOrder,
          encounterId,
          relationships: {
            partOf: encounterId,
          },
        })
      : null;

    const prescriptionRegistration = payload.prescription
      ? await this.registerClinicalRecordEvent({
          context,
          recordType: 'MEDICAL_PRESCRIPTION',
          recordInput: payload.prescription,
          encounterId,
          relationships: {
            partOf: encounterId,
          },
        })
      : null;

    return {
      message: 'Doctor consultation records registered successfully',
      status: 'success',
      action: 'register_doctor_consultation',
      patientPseudoId: context.patientPseudoId,
      encounter: encounterRegistration.record,
      labOrder: labOrderRegistration ? labOrderRegistration.record : null,
      prescription: prescriptionRegistration ? prescriptionRegistration.record : null,
    };
  }

  /**
   * Coordinate laboratory result registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Orchestration response.
   */
  async registerLaboratoryResult(payload, actor) {
    // 1. Build the explicit signature payload for the lab result request.
    const signaturePayload = buildLaboratoryResultSignaturePayload(payload);

    // 2. Resolve the validated shared context.
    const context = await this.resolveClinicalRegistrationContext({
      actor,
      requiredRole: 'LABORATORY',
      patientPseudoId: payload.patientPseudoId,
      signaturePayload,
      signature: payload.signature,
      requestedScopes: [payload.scopeId],
      invalidSignatureMessage: 'Invalid signature for laboratory result registration',
    });

    // 3. Resolve the base laboratory order referenced by basedOn.
    const baseRecordContext = await this.resolveBaseClinicalRecord({
      patientPseudoId: context.patientPseudoId,
      recordId: payload.basedOn,
      expectedRecordType: 'LAB_ORDER',
      label: 'Laboratory order',
      professionalId: context.professional.id,
      professionalRole: context.professionalRole,
    });

    const encounterId = baseRecordContext.record.encounterId || null;

    // 4. Register the laboratory result linked to the previous order.
    const registration = await this.registerClinicalRecordEvent({
      context,
      recordType: 'LAB_RESULT',
      recordInput: {
        scopeId: payload.scopeId,
        payloadMetadata: payload.payloadMetadata,
        encryption: payload.encryption,
        integrity: payload.integrity,
      },
      encounterId,
      relationships: {
        basedOn: baseRecordContext.record._id || payload.basedOn,
        partOf: encounterId || null,
      },
    });

    return {
      message: 'Laboratory result registered successfully',
      status: 'success',
      action: 'register_laboratory_result',
      record: registration.record,
    };
  }

  /**
   * Coordinate pharmacy dispatch registration.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Orchestration response.
   */
  async registerPharmacyDispatch(payload, actor) {
    // 1. Build the explicit signature payload for the pharmacy request.
    const signaturePayload = buildPharmacyDispatchSignaturePayload(payload);

    // 2. Resolve the validated shared context.
    const context = await this.resolveClinicalRegistrationContext({
      actor,
      requiredRole: 'PHARMACIST',
      patientPseudoId: payload.patientPseudoId,
      signaturePayload,
      signature: payload.signature,
      requestedScopes: [payload.scopeId],
      invalidSignatureMessage: 'Invalid signature for pharmacy dispatch registration',
    });

    // 3. Resolve the base prescription referenced by basedOn.
    const baseRecordContext = await this.resolveBaseClinicalRecord({
      patientPseudoId: context.patientPseudoId,
      recordId: payload.basedOn,
      expectedRecordType: 'MEDICAL_PRESCRIPTION',
      label: 'Medical prescription',
      professionalId: context.professional.id,
      professionalRole: context.professionalRole,
    });

    const encounterId = baseRecordContext.record.encounterId || null;

    // 4. Register the pharmacy dispatch linked to the prescription.
    const registration = await this.registerClinicalRecordEvent({
      context,
      recordType: 'PHARMACY_DISPATCH',
      recordInput: {
        scopeId: payload.scopeId,
        payloadMetadata: payload.payloadMetadata,
        encryption: payload.encryption,
        integrity: payload.integrity,
      },
      encounterId,
      relationships: {
        basedOn: baseRecordContext.record._id || payload.basedOn,
        partOf: encounterId || null,
      },
    });

    return {
      message: 'Pharmacy dispatch registered successfully',
      status: 'success',
      action: 'register_pharmacy_dispatch',
      record: registration.record,
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
