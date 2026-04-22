const IdentityRepository = require('../../repositories/identity.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const ProxyReencryptionClient = require('../../clients/proxyReencryption/proxyReencryption.client');
const ScopeCatalogService = require('../infrastructure/scopeCatalog.service');
const ProxyNodeService = require('../infrastructure/proxyNode.service');
const { validatePermissionDates, validateActionsAndScopes } = require('../../utils/permission.utils');
const {
  buildGrantAccessSignaturePayload,
  buildRevokeAccessSignaturePayload,
} = require('../../utils/signaturePayload.utils');
const { createAppError } = require('../../utils/app-error');

const PRE_SHARES = Number(process.env.PRE_SHARES || 5);
const PRE_THRESHOLD = Number(process.env.PRE_THRESHOLD || 3);

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
    this.proxyReencryptionClient = new ProxyReencryptionClient();
    this.scopeCatalogService = new ScopeCatalogService();
    this.proxyNodeService = new ProxyNodeService();
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

    // 3. Validate threshold PRE material and select real proxy nodes from infrastructure.
    this.validateGrantKFragDistribution(payload.kfrags);
    const selectedProxies = await this.proxyNodeService.selectRandomProxyNodes(PRE_SHARES);

    // 4. Distribute kfrags to selected proxy re-encryption nodes
    const kfragDistribution = await this.proxyReencryptionClient.distributeKFrags({
      patientPseudoId: patientPseudoId,
      granteeId: grantee.id,
      allowedScopes,
      kfrags: payload.kfrags,
      proxies: selectedProxies,
      threshold: PRE_THRESHOLD,
      shares: PRE_SHARES,
      status: 'PENDING'
    });

    // 5. Create permission record in FabricPermission Repository
    const permission = await this.fabricPermissionRepository.grantAccess({
      patientId: patientPseudoId,
      granteeId: grantee.id,
      granteeRole: granteeRole,
      allowedActions,
      allowedScopes,
      enc_k_scope: payload.enc_k_scope,
      enc_k_scope_by_scope: payload.enc_k_scope_by_scope,
      capsuleByScope: payload.capsuleByScope,
      validFrom,
      validTo,
      proxyIds: selectedProxies.map((p) => p.id),
      createdBy: actor.id,
      signature: payload.signature,
    });

    // 6. Modify kfrags distribution status to 'ACTIVE' after successful ledger transaction
    await this.proxyReencryptionClient.updateKFragDistributionStatus({
      kfragDistributionId: kfragDistribution.id,
      permissionId: permission.id || permission.permissionId || null,
      proxies: selectedProxies,
      status: 'ACTIVE',
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

    // 4. Revoke the active permission in Fabric and invalidate proxy distribution.
    const revocation = await this.fabricPermissionRepository.revokeAccess({
      permissionId: activePermission.id || activePermission.permissionId || null,
      patientId: patientPseudoId,
      granteeId: grantee.id,
      revokedBy: actor.id,
      signature: payload.signature,
    });

    const activeProxyIds = this.extractProxyIdsFromPermission(activePermission);
    const proxyNodes = await this.proxyNodeService.getProxyNodesByIds(activeProxyIds);

    const proxyRevocation = await this.proxyReencryptionClient.revokeAccessTransform({
      proxies: proxyNodes,
      patientPseudoId,
      granteeId: grantee.id,
      permissionId: activePermission.id || activePermission.permissionId || null,
      status: 'REVOKED',
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
        proxyDistribution: proxyRevocation,
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

  /**
   * Validate that the incoming grant payload matches the prototype threshold
   * PRE parameters.
   *
   * @param {string[]} kfrags - Serialized kfrags generated by the client side.
   */
  validateGrantKFragDistribution(kfrags) {
    if (!Number.isInteger(PRE_SHARES) || PRE_SHARES <= 0) {
      throw createAppError('PRE shares must be a positive integer', 500, 'pre_configuration_error');
    }

    if (!Number.isInteger(PRE_THRESHOLD) || PRE_THRESHOLD <= 0) {
      throw createAppError('PRE threshold must be a positive integer', 500, 'pre_configuration_error');
    }

    if (PRE_THRESHOLD > PRE_SHARES) {
      throw createAppError('PRE threshold must be less than or equal to shares', 500, 'pre_configuration_error');
    }

    if (!Array.isArray(kfrags)) {
      throw createAppError('kfrags must be an array', 400, 'pre_validation_error');
    }

    if (kfrags.length !== PRE_SHARES) {
      throw createAppError(
        `Expected exactly ${PRE_SHARES} kfrags for threshold PRE distribution, received ${kfrags.length}`,
        400,
        'pre_validation_error'
      );
    }
  }

  /**
   * Extract persisted proxy node identifiers from a Fabric permission payload.
   *
   * @param {Object} permission - Normalized or raw Fabric permission.
   * @returns {string[]} Unique proxy node identifiers.
   */
  extractProxyIdsFromPermission(permission = {}) {
    const directProxyIds = Array.isArray(permission.proxyIds) ? permission.proxyIds : [];
    const scopeMaterialProxyIds = Array.isArray(permission.scopeMaterials)
      ? permission.scopeMaterials.flatMap((entry) =>
          Array.isArray(entry?.scopeMaterial?.proxyIds) ? entry.scopeMaterial.proxyIds : []
        )
      : [];
    const proxyIds = [...new Set([...directProxyIds, ...scopeMaterialProxyIds].filter(Boolean))];

    if (proxyIds.length === 0) {
      throw createAppError('Active permission is missing PRE proxy node identifiers', 500, 'pre_proxy_ids_missing');
    }

    return proxyIds;
  }
}

module.exports = PermissionOrchestrationService;
