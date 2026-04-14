const IdentityRepository = require('../../repositories/identity.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const ProxyReencryptionClient = require('../../clients/proxyReencryption/proxyReencryption.client');
const { validatePermissionDates, validateActionsAndScopes } = require('../../utils/permission.utils');
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
    this.proxyReencryptionClient = new ProxyReencryptionClient();
  }

  /**
   * Resolve a patient's pseudo identifier from either normalized application
   * objects or persistence models that still expose snake_case fields.
   *
   * @param {Object|null|undefined} source - Actor or patient source object.
   * @returns {string|null} Normalized pseudo identifier.
   */
  getPseudoId(source) {
    return source?.pseudoId || source?.pseudo_id || null;
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
      return source;
    }

    return source?.role?.name || source?.role || source?.name || null;
  }

  /**
   * Resolve a normalized public key from camelCase or snake_case models.
   *
   * @param {Object|null|undefined} source - User source object.
   * @returns {string|null} Public key string.
   */
  getPublicKey(source) {
    return source?.publicKey || source?.public_key || null;
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
    const patientPseudoId = this.getPseudoId(actor);
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
    validatePermissionDates(payload.validFrom, payload.validTo);
    validateActionsAndScopes(payload.allowedActions, payload.allowedScopes);

    // 2. Verify signed permission with patient's public key
    const signaturePayload = {
      patientPseudoId: patientPseudoId,
      granteeId: grantee.id,
      allowedActions: payload.allowedActions,
      allowedScopes: payload.allowedScopes,
      validFrom: payload.validFrom,
      validTo: payload.validTo,
    };
    //
    const isSignatureValid = await this.identityRepository.verifySignature({
      publicKey: this.getPublicKey(patient),
      payload: signaturePayload,
      signature: payload.signature,
    });

    if (!isSignatureValid) {
      throw createAppError('Invalid signature for permission grant', 400);
    }

    // 3. Select randomly proxy re-encryption nodes according to kfrags length
    const selectedProxies = await this.proxyReencryptionClient.selectNodes({
      count: payload.kfrags.length
    })

    if (!selectedProxies || selectedProxies.length < payload.kfrags.length) {
      throw createAppError('Failed to select sufficient proxy re-encryption nodes', 500);
    }

    // 4. Distribute kfrags to selected proxy re-encryption nodes
    const kfragDistribution = await this.proxyReencryptionClient.distributeKFrags({
      patientPseudoId: patientPseudoId,
      granteeId: grantee.id,
      allowedScopes: payload.allowedScopes,
      kfrags: payload.kfrags,
      proxies: selectedProxies,
      status: 'PENDING'
    });

    // 5. Create permission record in FabricPermission Repository
    const permission = await this.fabricPermissionRepository.grantAccess({
      patientId: patientPseudoId,
      granteeId: grantee.id,
      granteeRole: granteeRole,
      allowedActions: payload.allowedActions,
      allowedScopes: payload.allowedScopes,
      validFrom: payload.validFrom,
      validTo: payload.validTo,
      proxyIds: selectedProxies.map((p) => p.id),
      createdBy: actor.id,
      signature: payload.signature,
    });

    // 6. Modify kfrags distribution status to 'ACTIVE' after successful ledger transaction
    await this.proxyReencryptionClient.updateKFragDistributionStatus({
      kfragDistributionId: kfragDistribution.id,
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
    const patientPseudoId = this.getPseudoId(actor);
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
    const signaturePayload = {
      patientPseudoId,
      granteeId: grantee.id,
      action: 'REVOKE_ACCESS',
    };

    const isSignatureValid = await this.identityRepository.verifySignature({
      publicKey: this.getPublicKey(patient),
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

    const proxyRevocation = await this.proxyReencryptionClient.revokeAccessTransform({
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
      pseudoId: this.getPseudoId(actor),
      role: actor.role?.name || actor.role || null,
    };
  }
}

module.exports = PermissionOrchestrationService;
