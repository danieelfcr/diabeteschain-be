const crypto = require('crypto');
const IdentityRepository = require('../../repositories/identity.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const ScopeCatalogService = require('../infrastructure/scopeCatalog.service');
const { validatePermissionDates, validateActionsAndScopes } = require('../../utils/permission.utils');
const {
  buildGrantAccessSignaturePayload,
  buildRevokeAccessSignaturePayload,
} = require('../../utils/signaturePayload.utils');
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
   * Build a deterministic placeholder proxy identifier list for the current
   * branch.
   *
   * The deployed chaincode still requires non-empty proxy identifiers even
   * when PRE orchestration is disabled. These placeholders keep the on-chain
   * contract satisfied without invoking any external PRE flow.
   *
   * @param {number} count - Desired number of placeholder proxy ids.
   * @returns {string[]} Deterministic proxy id list.
   */
  buildPlaceholderProxyIds(count = 3) {
    const normalizedCount = Number.isInteger(count) && count > 0 ? count : 3;

    return Array.from({ length: normalizedCount }, (_, index) => `pre-disabled-proxy-${index + 1}`);
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

    // 1.2 Get patient's public key from IdentityRepository using actor's pseudoId
    const patientPseudoId = actor.pseudoId || null;
    if (!patientPseudoId) {
      throw createAppError('Authenticated patient pseudoId is required', 400);
    }

    const patient = await this.identityRepository.findUserByPseudoId(patientPseudoId);
    if (!patient) {
      throw createAppError('Authenticated patient not found in identity repository', 404);
    }

    // 1.3 Confirm grantee's identity and role from IdentityRepository using payload.granteeId
    const grantee = await this.identityRepository.findUserById(payload.professionalId);
    if (!grantee) {
      throw createAppError('Grantee healthcare professional not found in identity repository', 404);
    }

    // 1.4 Verify that the grantee has a healthcare professional role (DOCTOR, LABORATORY, PHARMACIST)
    const validRoles = ['DOCTOR', 'LABORATORY', 'PHARMACIST'];
    const granteeRole = this.getRoleName(grantee);
    if (!validRoles.includes(granteeRole)) {
      throw createAppError('Grantee must have a healthcare professional role to be granted access', 400);
    }
    
    // 1.5 Validate permission dates and allowed actions/scopes
    const { validFrom, validTo } = validatePermissionDates(payload.validFrom, payload.validTo);
    const { allowedActions, allowedScopes: requestedScopes } = validateActionsAndScopes(
      payload.allowedActions,
      payload.allowedScopes
    );
    const allowedScopes = await this.scopeCatalogService.assertActiveScopeIds(requestedScopes);

    // 2. Verify signed permission with patient's public key
    const signaturePayload = buildGrantAccessSignaturePayload({
      patientPseudoId,
      granteeId: grantee.id,
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

    // 3. PRE is intentionally disabled in this branch so the flow remains
    // focused on backend-to-blockchain validation only.
    const placeholderProxyIds = this.buildPlaceholderProxyIds(
      Array.isArray(payload.kfrags) ? payload.kfrags.length : 0
    );

    const permissionId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const permission = await this.fabricPermissionRepository.grantAccess({
      permissionId,
      patientId: patientPseudoId,
      granteeId: grantee.id,
      granteeRole: granteeRole,
      allowedActions,
      allowedScopes,
      validFrom,
      validTo,
      // Keep the field shape expected by the deployed ledger contract, but
      // without distributing any PRE material in this branch.
      proxyIds: placeholderProxyIds,
      createdBy: actor.id,
      signature: payload.signature,
      auditId,
      createdAt: timestamp,
      timestamp,
    });
  
    return {
      message: 'Access grant orchestration completed successfully',
      status: 'success',
      action: 'grant_access',
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

    // 1.2 Resolve the patient pseudoId from the authenticated actor only.
    const patientPseudoId = actor.pseudoId || null;
    if (!patientPseudoId) {
      throw createAppError('Authenticated patient pseudoId is required', 400);
    }

    // 1.3 Resolve patient and professional identities from trusted sources.
    const patient = await this.identityRepository.findUserByPseudoId(patientPseudoId);
    if (!patient) {
      throw createAppError('Authenticated patient not found in identity repository', 404);
    }

    const grantee = await this.identityRepository.findUserById(payload.professionalId);
    if (!grantee) {
      throw createAppError('Healthcare professional not found in identity repository', 404);
    }

    const validRoles = ['DOCTOR', 'LABORATORY', 'PHARMACIST'];
    const granteeRole = this.getRoleName(grantee);
    if (!validRoles.includes(granteeRole)) {
      throw createAppError('Professional must have a valid healthcare role to revoke access', 400);
    }

    // 2. Verify the signed revoke intent with the patient's public key.
    const signaturePayload = buildRevokeAccessSignaturePayload({
      patientPseudoId,
      granteeId: grantee.id,
    });

    const isSignatureValid = await this.identityRepository.verifySignature({
      publicKey: patient.publicKey,
      payload: signaturePayload,
      signature: payload.signature,
    });

    if (!isSignatureValid) {
      throw createAppError('Invalid signature for access revocation', 400);
    }

    // 3. Confirm that an active permission currently exists before revoking it.
    const activePermission = await this.fabricPermissionRepository.getActivePermissionByPatientAndGrantee(
      patientPseudoId,
      grantee.id
    );

    if (!activePermission) {
      throw createAppError('No active access grant found for this patient and professional', 404);
    }

    // 4. Revoke the active permission in Fabric. PRE is disabled in this
    // branch, so no proxy invalidation is executed here.
    const revocation = await this.fabricPermissionRepository.revokeAccess({
      permissionId: activePermission.id || activePermission.permissionId || null,
      patientId: patientPseudoId,
      granteeId: grantee.id,
      revokedBy: actor.id,
      signature: payload.signature,
      auditId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });

    return {
      message: 'Access revoked successfully',
      status: 'success',
      action: 'revoke_access',
      revocation: {
        patientPseudoId,
        professionalId: grantee.id,
        revokedPermissionId: activePermission.id || activePermission.permissionId || null,
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
      role: actor.role?.name || actor.role || null,
    };
  }
}

module.exports = PermissionOrchestrationService;
