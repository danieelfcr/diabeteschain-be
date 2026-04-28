const crypto = require('crypto');
const IdentityRepository = require('../../repositories/identity.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const FabricClinicalRecordRepository = require('../../repositories/fabricClinicalRecord.repository');
const PreServiceClient = require('../../clients/preServiceClient');
const ScopeCatalogService = require('../infrastructure/scopeCatalog.service');
const { validatePermissionDates, validateActionsAndScopes } = require('../../utils/permission.utils');
const {
  buildGrantAccessSignaturePayload,
  buildRevokeAccessSignaturePayload,
} = require('../../utils/signaturePayload.utils');
const { normalizeScopeMaterial } = require('../../utils/clinicalRecord.utils');
const { createAppError } = require('../../utils/app-error');

/**
 * Service responsible for coordinating permission management use cases.
 */
class PermissionOrchestrationService {
  /**
   * Build the orchestration service with all repository and client
   * dependencies required by the future implementation.
   */
  constructor() {
    this.identityRepository = new IdentityRepository();
    this.fabricPermissionRepository = new FabricPermissionRepository();
    this.fabricClinicalRecordRepository = new FabricClinicalRecordRepository();
    this.preServiceClient = new PreServiceClient();
    this.scopeCatalogService = new ScopeCatalogService();
  }

  /**
   * Resolve a normalized role name from plain objects or Sequelize models.
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
   * Coordinate patient-controlled access grant creation.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async grantAccess(payload, actor) {
    // 1. Validations
    // 1.1 Validate that the actor is authenticated and has the PATIENT role
    if (!actor) {
      throw createAppError('Authentication required to grant access', 401);
    }
    if (this.getRoleName(actor) !== 'PATIENT') {
      throw createAppError('Only users with PATIENT role can grant access', 403);
    }

    // 1.2 Resolve the authenticated patient by username.
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

    // 1.3 Confirm grantee's identity and role from IdentityRepository.
    const grantee = payload.granteeId
      ? await this.identityRepository.findUserById(payload.granteeId)
      : await this.identityRepository.findUserByUsername(payload.professionalUsername);
    if (!grantee) {
      throw createAppError('Grantee healthcare professional not found in identity repository', 404);
    }

    // 1.4 Verify that the grantee has a healthcare professional role (DOCTOR, LABORATORY, PHARMACIST)
    const validRoles = ['DOCTOR', 'LABORATORY', 'PHARMACIST'];
    const granteeRole = this.getRoleName(grantee);
    if (!validRoles.includes(granteeRole)) {
      throw createAppError('Grantee must have a healthcare professional role to be granted access', 400);
    }

    if (payload.granteeRole && this.getRoleName(payload.granteeRole) !== granteeRole) {
      throw createAppError('granteeRole does not match the resolved grantee identity', 400);
    }
    
    // 1.5 Validate permission dates and allowed actions/scopes
    const { validFrom, validTo } = validatePermissionDates(payload.validFrom, payload.validTo);
    const { allowedActions, allowedScopes: requestedScopes } = validateActionsAndScopes(
      payload.allowedActions,
      payload.allowedScopes
    );
    const allowedScopes = await this.scopeCatalogService.assertActiveScopeIds(requestedScopes);
    this.validateTransformKeysForScopes(payload.transformKeys, allowedScopes);

    // ============================================================================================== //

    // 2. Verify signed permission with patient's public key
    const signaturePayload = buildGrantAccessSignaturePayload({
      patientUsername: patient.username,
      professionalUsername: grantee.username || payload.professionalUsername || grantee.id,
      allowedActions,
      allowedScopes,
      validFrom,
      validTo,
    });

    const isSignatureValid = await this.identityRepository.verifySignature({
      publicKey: patient.publicKey,
      payload: signaturePayload,
      signature: payload.signature,
    });

    if (!isSignatureValid) {
      throw createAppError('Invalid signature for permission grant', 400);
    }

    // ============================================================================================== //

    // 3. Ensure patient-owned scope keys exist before granting delegated access.
    const scopeMaterials = await this.ensureScopeMaterialsForGrant({
      patientPseudoId,
      allowedScopes,
      scopeMaterials: payload.scopeMaterials,
    });

    // ============================================================================================== //

    // 4. Create permission record in FabricPermission Repository.
    const permissionResult = await this.fabricPermissionRepository.grantAccess({
      permissionId: payload.permissionId || undefined,
      patientPseudoId,
      granteeId: grantee.id,
      granteeRole: granteeRole,
      allowedActions,
      allowedScopes,
      validFrom,
      validTo,
      createdBy: patientPseudoId,
      signature: payload.signature,
    });

    const permission = permissionResult?.permission || permissionResult;
    const permissionId = permission?.permissionId || permission?.id || null;
    if (!permissionId) {
      throw createAppError('Fabric permission response did not include permissionId', 502);
    }

    // ============================================================================================== //

    // 5. Register one transform key per authorized scope in the PRE service.
    const transformKeysRegistered = await Promise.all(
      payload.transformKeys.map((entry) => this.preServiceClient.registerTransformKey({
        permissionId,
        patientPseudoId,
        granteeId: grantee.id,
        scopeId: entry.scopeId,
        transformKey: entry.transformKey,
        transformKeyEncoding: entry.transformKeyEncoding,
        proxyNodeId: entry.proxyNodeId,
        validFrom,
        validTo,
        metadata: {
          ...(entry.metadata || {}),
          granteeRole,
          createdBy: patientPseudoId,
        },
        status: 'ACTIVE',
      }))
    );

    // ============================================================================================== //
  
    return {
      success: true,
      message: 'Access grant orchestration completed successfully',
      status: 'success',
      action: 'grant_access',
      permissionId,
      permissionTxId: permissionResult?.txId || null,
      transformKeysRegistered,
      scopeMaterials,
      patient: {
        username: patient.username,
      },
      professional: {
        username: grantee.username,
        role: granteeRole,
      },
      permission,
    };
  }

  /**
   * Coordinate access revocation.
   *
   * @param {Object} payload - Request payload submitted by the client.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Placeholder orchestration response.
   */
  async revokeAccess(payload, actor) {
    // 1. Validations
    // 1.1 Validate that the actor is authenticated and is the patient owner.
    if (!actor) {
      throw createAppError('Authentication required to revoke access', 401);
    }
    if (this.getRoleName(actor) !== 'PATIENT') {
      throw createAppError('Only users with PATIENT role can revoke access', 403);
    }

    // 1.2 Resolve the patient identity from the authenticated username.
    const patientUsername = actor.username || null;
    if (!patientUsername) {
      throw createAppError('Authenticated patient username is required', 400);
    }

    // 1.3 Resolve patient and professional identities from trusted sources.
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

    const grantee = payload.granteeId
      ? await this.identityRepository.findUserById(payload.granteeId)
      : await this.identityRepository.findUserByUsername(payload.professionalUsername);
    if (!grantee) {
      throw createAppError('Healthcare professional not found in identity repository', 404);
    }

    const validRoles = ['DOCTOR', 'LABORATORY', 'PHARMACIST'];
    const granteeRole = this.getRoleName(grantee);
    if (!validRoles.includes(granteeRole)) {
      throw createAppError('Professional must have a valid healthcare role to revoke access', 400);
    }

    // ============================================================================================== //

    // 2. Verify the signed revoke intent when the client provides one.
    if (payload.signature) {
      const signaturePayload = buildRevokeAccessSignaturePayload({
        patientUsername: patient.username,
        professionalUsername: grantee.username || payload.professionalUsername || grantee.id,
      });

      const isSignatureValid = await this.identityRepository.verifySignature({
        publicKey: patient.publicKey,
        payload: signaturePayload,
        signature: payload.signature,
      });

      if (!isSignatureValid) {
        throw createAppError('Invalid signature for access revocation', 400);
      }
    }

    // ============================================================================================== //

    // 3. Confirm that an active permission currently exists before revoking it.
    const activePermission = payload.permissionId
      ? await this.fabricPermissionRepository.getGrantById(payload.permissionId)
      : await this.fabricPermissionRepository.getActivePermissionByPatientAndGrantee(
          patientPseudoId,
          grantee.id
        );

    if (!activePermission || !this.isPermissionActive(activePermission)) {
      throw createAppError('No active access grant found for this patient and professional', 404);
    }

    if ((activePermission.patientPseudoId || activePermission.patientId) !== patientPseudoId || activePermission.granteeId !== grantee.id) {
      throw createAppError('Permission does not belong to the authenticated patient and grantee', 403);
    }

    const permissionId = activePermission.id || activePermission.permissionId || payload.permissionId || null;
    const revokedScopes = payload.scopes && payload.scopes.length > 0
      ? payload.scopes
      : (Array.isArray(activePermission.allowedScopes) ? activePermission.allowedScopes : []);

    if (revokedScopes.length === 0) {
      throw createAppError('At least one scope is required to revoke transform keys', 400);
    }

    // ============================================================================================== //

    // 4. Revoke the active permission in Fabric and deactivate transform keys.
    const revocation = await this.fabricPermissionRepository.revokeAccess({
      permissionId,
      patientPseudoId,
      granteeId: grantee.id,
      revokedBy: patientPseudoId,
      signature: payload.signature,
    });

    const transformKeyRevocations = await Promise.all(
      revokedScopes.map((scopeId) => this.preServiceClient.revokeTransformKey({
        permissionId,
        patientPseudoId,
        granteeId: grantee.id,
        scopeId,
      }))
    );

    // ============================================================================================== //

    return {
      success: true,
      message: 'Access revoked successfully',
      status: 'success',
      action: 'revoke_access',
      permissionId,
      revokedScopes,
      transformKeysRevoked: true,
      transformKeyRevocations,
      revocation: {
        patientUsername: patient.username,
        professionalUsername: grantee.username,
        revokedPermissionId: permissionId,
        permission: revocation,
      },
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
   * Resolve which patient-owned scope materials already exist for a future grant.
   *
   * @param {Object} payload - Preflight request payload.
   * @param {string[]} payload.scopeIds - Candidate scopes for the grant.
   * @param {Object} actor - Authenticated user context.
   * @returns {Promise<Object>} Scope material availability per requested scope.
   */
  async getScopeMaterialPreflight(payload, actor) {
    // 1. Validations
    // 1.1 Validate that the actor is authenticated and has the PATIENT role.
    if (!actor) {
      throw createAppError('Authentication required to resolve scope materials', 401);
    }
    if (this.getRoleName(actor) !== 'PATIENT') {
      throw createAppError('Only users with PATIENT role can resolve scope materials', 403);
    }

    // 1.2 Resolve the authenticated patient by username.
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

    // 1.3 Validate that every requested scope exists and is active in the catalog.
    const requestedScopes = await this.scopeCatalogService.assertActiveScopeIds(payload.scopeIds);

    // ============================================================================================== //

    // 2. Retrieve existing patient-owned ScopeMaterial records for the requested scopes.
    const existingScopeMaterials = await this.fabricClinicalRecordRepository
      .getScopeMaterialsByPatientAndScopes(patientPseudoId, requestedScopes);

    const materialByScope = new Map();
    for (const entry of Array.isArray(existingScopeMaterials) ? existingScopeMaterials : []) {
      const material = normalizeScopeMaterial(entry?.scopeMaterial || entry);
      if (material?.scopeId) {
        materialByScope.set(material.scopeId, material);
      }
    }

    // ============================================================================================== //

    // 3. Build a deterministic response so the frontend can generate only missing k_scope values.
    const scopeMaterials = requestedScopes.map((scopeId) => {
      const material = materialByScope.get(scopeId);
      const exists = Boolean(material?.encryptedScopeKey);

      return {
        scopeId,
        exists,
        scopeMaterialId: exists ? material.scopeMaterialId || null : null,
        encryptedScopeKey: exists ? material.encryptedScopeKey : null,
        status: exists ? material.status || 'ACTIVE' : null,
        version: exists ? material.version || null : null,
        createdAt: exists ? material.createdAt || null : null,
        updatedAt: exists ? material.updatedAt || null : null,
        metadata: exists ? material.metadata || {} : {},
      };
    });

    const existingScopes = scopeMaterials
      .filter((material) => material.exists)
      .map((material) => material.scopeId);
    const missingScopes = scopeMaterials
      .filter((material) => !material.exists)
      .map((material) => material.scopeId);

    return {
      success: true,
      message: 'Scope material preflight completed successfully',
      status: 'success',
      action: 'scope_material_preflight',
      patient: {
        username: patient.username,
      },
      requestedScopes,
      existingScopes,
      missingScopes,
      scopeMaterials,
    };
  }

  /**
   * Ensure every granted scope has an active patient-owned ScopeMaterial.
   *
   * Missing scope material must be supplied by the patient as encrypted scope
   * key material during the grant request. This keeps scope-key creation out of
   * healthcare professional write flows.
   *
   * @param {Object} input - Scope material initialization input.
   * @param {string} input.patientPseudoId - Patient pseudo identifier.
   * @param {string[]} input.allowedScopes - Scopes being granted.
   * @param {Array<Object>} input.scopeMaterials - Patient-supplied material.
   * @returns {Promise<Array<Object>>} Scope material status per granted scope.
   */
  async ensureScopeMaterialsForGrant({ patientPseudoId, allowedScopes = [], scopeMaterials = [] }) {
    // 1. Build a lookup table for the patient-supplied scope material.
    const materialByScope = new Map();

    // 1.1 Index each submitted material entry by scopeId for direct access during validation.
    for (const material of Array.isArray(scopeMaterials) ? scopeMaterials : []) {
      if (material?.scopeId) {
        materialByScope.set(material.scopeId, material);
      }
    }

    // ============================================================================================== //

    // 2. Validate that submitted scope material belongs only to the scopes being granted.
    const unexpectedScopes = [...materialByScope.keys()]
      .filter((scopeId) => !allowedScopes.includes(scopeId));

    // 2.1 Reject any material that would initialize or overwrite data outside the permission scope.
    if (unexpectedScopes.length > 0) {
      throw createAppError(
        `scopeMaterials contains scopes outside allowedScopes: ${unexpectedScopes.join(', ')}`,
        400
      );
    }

    // ============================================================================================== //

    // 3. Inspect the ledger to determine which granted scopes already have active material.
    const resultByScope = new Map();
    const scopesWithoutMaterial = [];

    // 3.1 Process every granted scope so the final response can report one status per scope.
    for (const scopeId of allowedScopes) {
      const existingScopeMaterial = normalizeScopeMaterial(
        await this.fabricClinicalRecordRepository.getScopeMaterialByPatientAndScope(
          patientPseudoId,
          scopeId
        )
      );

      // 3.2 Reuse existing patient-owned material when an encrypted scope key is already present.
      if (existingScopeMaterial?.encryptedScopeKey) {
        resultByScope.set(scopeId, {
          scopeId,
          scopeMaterialId: existingScopeMaterial.scopeMaterialId,
          created: false,
          status: existingScopeMaterial.status || 'ACTIVE',
        });
        continue;
      }

      // 3.3 Collect every missing scope so the validation error can report all required keys at once.
      if (!materialByScope.get(scopeId)?.encryptedScopeKey) {
        scopesWithoutMaterial.push(scopeId);
      }
    }

    // ============================================================================================== //

    // 4. Require encrypted key material for every granted scope that has not been initialized yet.
    if (scopesWithoutMaterial.length > 0) {
      throw createAppError(
        `scopeMaterials.encryptedScopeKey is required for scopes without ScopeMaterial: ${scopesWithoutMaterial.join(', ')}`,
        400
      );
    }

    // ============================================================================================== //

    // 5. Create missing ScopeMaterial records from the patient-supplied encrypted scope keys.
    for (const scopeId of allowedScopes) {
      // 5.1 Skip scopes already resolved from existing ledger material.
      if (resultByScope.has(scopeId)) {
        continue;
      }

      // 5.2 Persist the patient-provided encrypted key with grant-origin metadata.
      const requestMaterial = materialByScope.get(scopeId);
      const now = new Date().toISOString();
      const created = await this.fabricClinicalRecordRepository.createScopeMaterial({
        scopeMaterialId: `smat-${crypto.randomUUID()}`,
        patientPseudoId,
        scopeId,
        encryptedScopeKey: requestMaterial.encryptedScopeKey,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        version: 1,
        metadata: {
          ...(requestMaterial.metadata || {}),
          scheme: requestMaterial.metadata?.scheme || 'RECRYPT',
          source: requestMaterial.metadata?.source || 'PATIENT_GRANT',
          recryptMetadata: requestMaterial.recryptMetadata || requestMaterial.metadata?.recryptMetadata || {},
          createdBy: patientPseudoId,
        },
      });

      // 5.3 Normalize the repository response and capture the creation status for the caller.
      const createdScopeMaterial = normalizeScopeMaterial(created?.scopeMaterial || created);

      resultByScope.set(scopeId, {
        scopeId,
        scopeMaterialId: createdScopeMaterial?.scopeMaterialId || null,
        created: true,
        status: createdScopeMaterial?.status || 'ACTIVE',
        txId: created?.txId || null,
      });
    }

    // ============================================================================================== //

    // 6. Return scope material statuses in the same order as the granted scopes.
    return allowedScopes.map((scopeId) => resultByScope.get(scopeId));
  }

  /**
   * Validate that one transform key exists for each granted scope.
   *
   * @param {Array<Object>} transformKeys - Transform key entries.
   * @param {string[]} allowedScopes - Granted scopes.
   */
  validateTransformKeysForScopes(transformKeys = [], allowedScopes = []) {
    if (!Array.isArray(transformKeys) || transformKeys.length === 0) {
      throw createAppError('A transformKey is required for each allowed scope', 400);
    }

    const keyScopes = new Set(transformKeys.map((entry) => entry.scopeId).filter(Boolean));
    const missingScopes = allowedScopes.filter((scopeId) => !keyScopes.has(scopeId));

    if (missingScopes.length > 0) {
      throw createAppError('A transformKey is required for each allowed scope', 400);
    }
  }

  /**
   * Determine whether a permission can still be used.
   *
   * @param {Object} permission - Permission payload.
   * @returns {boolean} True when active and within its validity period.
   */
  isPermissionActive(permission = {}) {
    if ((permission.status || '').toUpperCase() !== 'ACTIVE') {
      return false;
    }

    const now = new Date();
    const validFrom = permission.validFrom ? new Date(permission.validFrom) : null;
    const validTo = permission.validTo ? new Date(permission.validTo) : null;

    if (validFrom && !Number.isNaN(validFrom.getTime()) && now < validFrom) {
      return false;
    }

    if (validTo && !Number.isNaN(validTo.getTime()) && now > validTo) {
      return false;
    }

    return true;
  }
}

module.exports = PermissionOrchestrationService;
