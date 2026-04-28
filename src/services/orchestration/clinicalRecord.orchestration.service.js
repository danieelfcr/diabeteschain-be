const crypto = require('crypto');
const ClinicalRecordRepository = require('../../repositories/clinicalRecord.repository');
const FabricClinicalRecordRepository = require('../../repositories/fabricClinicalRecord.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const IdentityRepository = require('../../repositories/identity.repository');
const PreServiceClient = require('../../clients/preServiceClient');
const ScopeCatalogService = require('../infrastructure/scopeCatalog.service');
const { mapClinicalRecord } = require('../../mappers/clinicalRecord.mapper');
const { createAppError } = require('../../utils/app-error');
const {
  getRecordIdentifier,
  normalizePermission,
  normalizePermissions,
  normalizeScopeMaterial,
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
    this.preServiceClient = new PreServiceClient();
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
   * @param {string} options.patientUsername - Target patient username.
   * @param {Object} options.signaturePayload - Structured signature payload.
   * @param {string} options.signature - Detached signature provided by the client.
   * @param {string[]} options.requestedScopes - Requested clinical scopes.
   * @param {string} options.invalidSignatureMessage - Error message for invalid signature.
   * @returns {Promise<Object>} Validated registration context.
   */
  async resolveClinicalRegistrationContext({
    actor,
    requiredRole,
    patientUsername,
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

    const professionalUsername = actor.username || null;
    if (!professionalUsername) {
      throw createAppError('Authenticated professional username is required', 400);
    }

    if (!patientUsername) {
      throw createAppError('Missing required field: patientUsername', 400);
    }

    if (!signature) {
      throw createAppError('Missing required field: signature', 400);
    }

    // ============================================================================================== //

    // 2. Validate that the requested clinical scopes exist off-chain.
    await this.scopeCatalogService.assertActiveScopeIds(requestedScopes);

    // ============================================================================================== //

    // 3. Resolve patient and professional identities from trusted sources.
    const patient = await this.identityRepository.findUserByUsername(patientUsername);
    if (!patient) {
      throw createAppError('Patient not found in identity repository', 404);
    }
    if (this.getRoleName(patient) !== 'PATIENT') {
      throw createAppError('Target user must have PATIENT role', 400);
    }

    const patientPseudoId = patient.pseudoId || null;
    if (!patientPseudoId) {
      throw createAppError('Target patient pseudoId is required', 400);
    }

    const professional = await this.identityRepository.findUserByUsername(professionalUsername);
    if (!professional) {
      throw createAppError('Authenticated professional not found in identity repository', 404);
    }

    const professionalRole = this.getRoleName(professional)?.toUpperCase() || null;
    if (professionalRole !== requiredRole) {
      throw createAppError(`Authenticated user must have ${requiredRole} role`, 403);
    }

    // ============================================================================================== //

    // 4. Verify the signature before persisting anything.
    await this.verifyRequestSignature({
      publicKey: professional.publicKey,
      payload: signaturePayload,
      signature,
      errorMessage: invalidSignatureMessage,
    });

    // ============================================================================================== //

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

    // ============================================================================================== //

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
    // 1. Validate that the request references a base record.
    if (!recordId) {
      throw createAppError('Missing required field: basedOn', 400);
    }

    // ============================================================================================== //

    // 2. Retrieve and validate the off-chain base record.
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

    // ============================================================================================== //

    // 3. Retrieve the matching blockchain index, including audit context when available.
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

    // ============================================================================================== //

    // 4. Validate that the blockchain index matches the expected type and remains active.
    const referenceRecordType = normalizeRecordType(baseReference.recordType);
    if (referenceRecordType && referenceRecordType !== expectedRecordType) {
      throw createAppError(`${label} blockchain index does not match the expected record type`, 400);
    }

    const referenceStatus = baseReference.status?.toUpperCase() || null;
    if (referenceStatus && referenceStatus !== 'ACTIVE') {
      throw createAppError(`${label} is not active`, 400);
    }

    // ============================================================================================== //

    return {
      record: baseRecord,
      reference: baseReference,
    };
  }

  /**
   * Resolve existing patient-owned scope material for clinical writes.
   *
   * Scope material creation is intentionally handled by the patient grant flow,
   * so healthcare professional event registration only reuses active material.
   *
   * @param {Object} input - Scope material resolution input.
   * @param {string} input.patientPseudoId - Patient pseudo identifier.
   * @param {string} input.scopeId - Clinical scope identifier.
   * @returns {Promise<Object>} Scope material resolution result.
   */
  async resolveScopeMaterialForRecord({ patientPseudoId, scopeId }) {
    const existingScopeMaterial = normalizeScopeMaterial(
      await this.fabricClinicalRecordRepository.getScopeMaterialByPatientAndScope(patientPseudoId, scopeId)
    );

    if (existingScopeMaterial) {
      return {
        scopeMaterial: existingScopeMaterial,
        scopeMaterialCreated: false,
        scopeMaterialTxId: null,
      };
    }

    throw createAppError(
      'ScopeMaterial must be initialized by the patient before registering clinical records for this scope',
      409
    );
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

    const scopeMaterialResolution = await this.resolveScopeMaterialForRecord({
      patientPseudoId: context.patientPseudoId,
      scopeId: recordInput.scopeId,
    });

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
    // ============================================================================================== //
    try {
      // 2. Persist the encrypted record in MongoDB.
      savedRecord = await this.clinicalRecordRepository.create(clinicalRecordData);
      const savedRecordObject = toPlainObject(savedRecord);

      // ============================================================================================== //

      // 3. Register the matching clinical index in blockchain.
      const clinicalRecordIndex = buildClinicalRecordIndex({
        record: savedRecordObject,
        context,
      });

      const registeredIndex = await this.fabricClinicalRecordRepository.registerClinicalRecordIndex(
        clinicalRecordIndex
      );

      // ============================================================================================== //

      return {
        record: {
          ...mapClinicalRecord(
            savedRecordObject,
            registeredIndex && typeof registeredIndex === 'object' ? registeredIndex : clinicalRecordIndex
          ),
          scopeMaterialCreated: scopeMaterialResolution.scopeMaterialCreated,
          scopeMaterialId: scopeMaterialResolution.scopeMaterial?.scopeMaterialId || null,
        },
        index: registeredIndex && typeof registeredIndex === 'object' ? registeredIndex : clinicalRecordIndex,
        scopeMaterial: scopeMaterialResolution.scopeMaterial,
        scopeMaterialCreated: scopeMaterialResolution.scopeMaterialCreated,
        scopeMaterialTxId: scopeMaterialResolution.scopeMaterialTxId,
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

    // 1.2 Resolve the patient identity from the authenticated username.
    const patientUsername = actor.username || null;
    if (!patientUsername) {
      throw createAppError('Authenticated patient username is required', 400);
    }

    // 1.3 Resolve the patient identity from a trusted source
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

    // ============================================================================================== //

    // 2. Retrieve clinical references/indexes from the ledger for the patient
    const references = await this.fabricClinicalRecordRepository.getPatientRecordIndexes(patientPseudoId);

    // ============================================================================================== //

    // 3. Retrieve encrypted off-chain clinical records for the patient
    const records = references.length
      ? await this.clinicalRecordRepository.getClinicalRecordsByReferences(references, patientPseudoId)
      : await this.clinicalRecordRepository.getPatientClinicalDocuments(patientPseudoId);

    const referenceMap = new Map(
      references
        .map((reference) => [getRecordIdentifier(reference), reference])
        .filter(([recordId]) => Boolean(recordId))
    );

    const historyScopes = [...new Set(
      [
        ...references.map((reference) => reference.scopeId || reference.scope || null),
        ...records.map((record) => record.scopeId || null),
      ].filter(Boolean)
    )];
    const scopeMaterials = historyScopes.length
      ? await this.fabricClinicalRecordRepository.getScopeMaterialsByPatientAndScopes(patientPseudoId, historyScopes)
      : [];
    
    // ============================================================================================== //

    return {
      message: 'Patient history retrieved successfully',
      status: 'success',
      action: 'get_patient_history',
      patient: {
        username: patient.username || patientUsername,
      },
      totalRecords: records.length,
      scopeMaterials: scopeMaterials.map((scopeMaterial) => this.mapScopeMaterialForResponse(scopeMaterial)),
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
    // 1. Validate the request actor and required identities.
    // 1.1 Validate that the actor is authenticated and has a healthcare professional role.
    if (!actor) {
      throw createAppError('Authentication required to retrieve professional history', 401);
    }

    const validRoles = ['DOCTOR', 'LABORATORY', 'PHARMACIST'];
    const actorRole = this.getRoleName(actor);
    if (!validRoles.includes(actorRole)) {
      throw createAppError('Only healthcare professionals can retrieve delegated history', 403);
    }

    // 1.2 Resolve the authenticated professional only from the trusted actor username.
    const professionalUsername = actor.username || null;
    if (!professionalUsername) {
      throw createAppError('Authenticated professional username is required', 400);
    }

    // 1.3 Validate the target patient username from the request payload.
    const patientUsername = payload?.patientUsername || null;
    if (!patientUsername) {
      throw createAppError('Missing required field: patientUsername', 400);
    }

    // 1.4 Resolve patient and professional identities from trusted repositories.
    const patient = await this.identityRepository.findUserByUsername(patientUsername);
    if (!patient) {
      throw createAppError('Patient not found in identity repository', 404);
    }
    if (this.getRoleName(patient) !== 'PATIENT') {
      throw createAppError('Target user must have PATIENT role', 400);
    }

    const patientPseudoId = patient.pseudoId || null;
    if (!patientPseudoId) {
      throw createAppError('Target patient pseudoId is required', 400);
    }

    const professional = await this.identityRepository.findUserByUsername(professionalUsername);
    if (!professional) {
      throw createAppError('Authenticated professional not found in identity repository', 404);
    }

    const professionalRole = this.getRoleName(professional);
    if (!validRoles.includes(professionalRole)) {
      throw createAppError('Authenticated user must have a valid healthcare professional role', 403);
    }

    // ============================================================================================== //

    // 2. Resolve the active delegated permissions for the patient-professional pair.
    const permissions = await this.fabricPermissionRepository.getActivePermissionsByPatientAndGrantee(
      patientPseudoId,
      professional.id
    );

    const normalizedPermissions = normalizePermissions(permissions);
    if (normalizedPermissions.length === 0) {
      throw createAppError('No active access grant found for this patient and professional', 404);
    }

    // ============================================================================================== //

    // 3. Validate the permission semantics required for delegated history access.
    const readablePermissions = normalizedPermissions.filter(
      (permission) => isPermissionActive(permission) && permissionAllowsAction(permission, 'read')
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

    // ============================================================================================== //

    // 4. Resolve the effective readable scopes against the active scope catalog.
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

    // ============================================================================================== //

    // 5. Retrieve ledger references using the professional audit context.
    const references = await this.fabricClinicalRecordRepository.getPatientRecordIndexesWithAudit({
      patientPseudoId,
      professionalId: professional.id,
      professionalRole,
    });

    // ============================================================================================== //

    // 6. Resolve requested scopes and keep only authorized ledger references.
    const requestedScopesInput = payload?.scopeIds || payload?.scopes || catalogEffectiveScopes;
    const requestedScopes = Array.isArray(requestedScopesInput) && requestedScopesInput.includes('*')
      ? catalogEffectiveScopes
      : requestedScopesInput;
    const authorizedRequestedScopes = validateRequestedScopes(
      { allowedScopes: catalogEffectiveScopes },
      requestedScopes
    ) || requestedScopes;
    const scopedReferences = filterReferencesByScopes(references, authorizedRequestedScopes);

    // ============================================================================================== //

    // 7. Retrieve encrypted off-chain records linked to the authorized references.
    const records = scopedReferences.length
      ? await this.clinicalRecordRepository.getClinicalRecordsByReferences(scopedReferences, patientPseudoId)
      : [];

    // ============================================================================================== //

    // 8. Build a ledger reference map and attach reference metadata to each record.
    const referenceMap = new Map(
      scopedReferences
        .map((reference) => [getRecordIdentifier(reference), reference])
        .filter(([recordId]) => Boolean(recordId))
    );

    const mappedRecords = records.map((record) =>
      mapClinicalRecord(record, referenceMap.get(getRecordIdentifier(record)) || null)
    );

    // ============================================================================================== //

    // 9. Resolve the distinct scopes represented by the authorized history.
    const materialScopes = [...new Set(
      [
        ...scopedReferences.map((reference) => reference.scopeId || reference.scope || null),
        ...mappedRecords.map((record) => record.scopeId || null),
      ].filter(Boolean)
    )];

    // ============================================================================================== //

    // 10. Retrieve active ScopeMaterial entries for the authorized scopes.
    const scopeMaterials = materialScopes.length
      ? await this.fabricClinicalRecordRepository.getScopeMaterialsByPatientAndScopes(patientPseudoId, materialScopes)
      : [];
    const scopeMaterialByScope = this.buildScopeMaterialMap(scopeMaterials);

    // ============================================================================================== //

    // 11. Transform each scope key for the professional and group records by scope.
    const scopes = await Promise.all(materialScopes.map(async (scopeId) => {
      const scopeMaterial = scopeMaterialByScope.get(scopeId);
      if (!scopeMaterial?.encryptedScopeKey) {
        throw createAppError(`No active ScopeMaterial found for scope ${scopeId}`, 403);
      }

      const permissionForScope = this.findReadablePermissionForScope(readablePermissions, scopeId);
      if (!permissionForScope?.permissionId) {
        throw createAppError(`No active permission found for scope ${scopeId}`, 403);
      }

      const transformedMaterial = await this.preServiceClient.transformScopeKey({
        permissionId: permissionForScope.permissionId,
        patientPseudoId,
        granteeId: professional.id,
        scopeId,
        encryptedScopeKey: scopeMaterial.encryptedScopeKey,
      });

      return {
        scopeId,
        transformedScopeKey: transformedMaterial.transformedScopeKey,
        metadata: transformedMaterial.metadata,
        scopeMaterialId: scopeMaterial.scopeMaterialId,
        records: mappedRecords.filter((record) => record.scopeId === scopeId),
      };
    }));

    // ============================================================================================== //

    // 12. Build the delegated history response.
    return {
      success: true,
      message: 'Professional history retrieved successfully',
      status: 'success',
      action: 'get_professional_history',
      patientPseudoId,
      granteeId: professional.id,
      patient: {
        username: patient.username || patientUsername,
      },
      professional: {
        role: professionalRole,
        username: professional.username || professionalUsername,
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
      scopes,
      records: mappedRecords,
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

    // ============================================================================================== //

    // 2. Resolve the shared validated context once for the whole request.
    const context = await this.resolveClinicalRegistrationContext({
      actor,
      requiredRole: 'DOCTOR',
      patientUsername: payload.patientUsername,
      signaturePayload,
      signature: payload.signature,
      requestedScopes,
      invalidSignatureMessage: 'Invalid signature for doctor consultation registration',
    });

    // ============================================================================================== //

    // 3. Register the root encounter record.
    const encounterRegistration = await this.registerClinicalRecordEvent({
      context,
      recordType: 'ENCOUNTER',
      recordInput: payload.encounter,
    });

    const encounterId = encounterRegistration.record.recordId;

    // ============================================================================================== //

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

    // ============================================================================================== //

    return {
      message: 'Doctor consultation records registered successfully',
      status: 'success',
      action: 'register_doctor_consultation',
      patientUsername: context.patient.username,
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

    // ============================================================================================== //

    // 2. Resolve the validated shared context.
    const context = await this.resolveClinicalRegistrationContext({
      actor,
      requiredRole: 'LABORATORY',
      patientUsername: payload.patientUsername,
      signaturePayload,
      signature: payload.signature,
      requestedScopes: [payload.scopeId],
      invalidSignatureMessage: 'Invalid signature for laboratory result registration',
    });

    // ============================================================================================== //

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

    // ============================================================================================== //

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

    // ============================================================================================== //

    return {
      message: 'Laboratory result registered successfully',
      status: 'success',
      action: 'register_laboratory_result',
      patientUsername: context.patient.username,
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

    // ============================================================================================== //

    // 2. Resolve the validated shared context.
    const context = await this.resolveClinicalRegistrationContext({
      actor,
      requiredRole: 'PHARMACIST',
      patientUsername: payload.patientUsername,
      signaturePayload,
      signature: payload.signature,
      requestedScopes: [payload.scopeId],
      invalidSignatureMessage: 'Invalid signature for pharmacy dispatch registration',
    });

    // ============================================================================================== //

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

    // ============================================================================================== //

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

    // ============================================================================================== //

    return {
      message: 'Pharmacy dispatch registered successfully',
      status: 'success',
      action: 'register_pharmacy_dispatch',
      patientUsername: context.patient.username,
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
      username: actor.username || null,
      role: actor.role?.name || actor.role || null,
    };
  }

  /**
   * Build a lookup of active scope material by scopeId.
   *
   * @param {Array<Object>} scopeMaterials - Scope material entries.
   * @returns {Map<string, Object>} Scope material keyed by scopeId.
   */
  buildScopeMaterialMap(scopeMaterials = []) {
    const materialByScope = new Map();

    for (const entry of Array.isArray(scopeMaterials) ? scopeMaterials : []) {
      const material = normalizeScopeMaterial(entry.scopeMaterial || entry);
      if (!material?.scopeId) {
        continue;
      }

      const status = material.status ? String(material.status).toUpperCase() : 'ACTIVE';
      if (status === 'ACTIVE') {
        materialByScope.set(material.scopeId, material);
      }
    }

    return materialByScope;
  }

  /**
   * Find a readable permission that authorizes one scope.
   *
   * @param {Array<Object>} permissions - Active readable permissions.
   * @param {string} scopeId - Scope identifier.
   * @returns {Object|null} Matching permission.
   */
  findReadablePermissionForScope(permissions = [], scopeId) {
    return permissions.find((permission) => {
      const allowedScopes = permission.allowedScopes || [];
      return allowedScopes.includes('*') || allowedScopes.includes(scopeId);
    }) || null;
  }

  /**
   * Map scope material to the public API shape.
   *
   * @param {Object} material - Scope material.
   * @returns {Object|null} Public scope material.
   */
  mapScopeMaterialForResponse(material) {
    const normalized = normalizeScopeMaterial(material);
    if (!normalized) {
      return null;
    }

    return {
      scopeMaterialId: normalized.scopeMaterialId,
      patientPseudoId: normalized.patientPseudoId,
      scopeId: normalized.scopeId,
      encryptedScopeKey: normalized.encryptedScopeKey,
      status: normalized.status,
      version: normalized.version,
      createdAt: normalized.createdAt,
      metadata: normalized.metadata,
    };
  }
}

module.exports = ClinicalRecordOrchestrationService;
