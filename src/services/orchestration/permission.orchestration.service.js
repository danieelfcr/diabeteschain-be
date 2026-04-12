const IdentityRepository = require('../../repositories/identity.repository');
const FabricPermissionRepository = require('../../repositories/fabricPermission.repository');
const ProxyReencryptionClient = require('../../clients/proxyReencryption/proxyReencryption.client');

class PermissionOrchestrationService {
  constructor() {
    this.identityRepository = new IdentityRepository();
    this.fabricPermissionRepository = new FabricPermissionRepository();
    this.proxyReencryptionClient = new ProxyReencryptionClient();
  }

  async grantAccess(payload, actor) {
    return {
      message: 'Grant access orchestration pending implementation',
      status: 'pending_implementation',
      action: 'grant_access',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'IdentityRepository.findUserByPseudoId',
        'IdentityRepository.findUserById',
        'FabricPermissionRepository.grantAccess',
        'ProxyReencryptionClient.generateAccessTransform',
      ],
    };
  }

  async revokeAccess(payload, actor) {
    return {
      message: 'Revoke access orchestration pending implementation',
      status: 'pending_implementation',
      action: 'revoke_access',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'IdentityRepository.findUserByPseudoId',
        'IdentityRepository.findUserById',
        'FabricPermissionRepository.revokeAccess',
        'ProxyReencryptionClient.revokeAccessTransform',
      ],
    };
  }

  mapActor(actor) {
    if (!actor) {
      return null;
    }

    return {
      id: actor.id || null,
      pseudo_id: actor.pseudo_id || null,
      role: actor.role?.name || actor.role || null,
    };
  }
}

module.exports = PermissionOrchestrationService;
