const { getContract } = require('../config/fabric_gateway');

class FabricPermissionRepository {
  async grantAccess(data) {
    await this.getContractReference();
    return this.buildPendingResponse('grantAccess', data);
  }

  async revokeAccess(data) {
    await this.getContractReference();
    return this.buildPendingResponse('revokeAccess', data);
  }

  async getGrantById(grantId) {
    await this.getContractReference();
    return this.buildPendingResponse('getGrantById', { grantId });
  }

  async getContractReference() {
    return getContract();
  }

  buildPendingResponse(operation, input) {
    return {
      repository: 'FabricPermissionRepository',
      operation,
      status: 'pending_implementation',
      input,
    };
  }
}

module.exports = FabricPermissionRepository;
