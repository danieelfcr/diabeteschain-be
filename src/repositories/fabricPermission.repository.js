const { getContract } = require('../config/fabric_gateway');

/**
 * Repository that encapsulates all ledger interactions related to patient
 * permission management.
 *
 * The current implementation exists to establish the repository boundary and
 * keep Fabric Gateway access out of controllers and orchestration consumers.
 */
class FabricPermissionRepository {
  /**
   * Parse Fabric Gateway responses into JSON when possible.
   *
   * @param {Uint8Array|Buffer|null|undefined} resultBytes - Raw result bytes.
   * @returns {Object|string|null} Parsed result payload.
   */
  parseResult(resultBytes) {
    if (!resultBytes?.length) {
      return null;
    }

    const resultText = resultBytes.toString();

    try {
      return JSON.parse(resultText);
    } catch (error) {
      return resultText;
    }
  }

  /**
   * Submit a grant access transaction to the ledger.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async grantAccess(data) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.submitTransaction('CreatePermission', JSON.stringify(data));

    return this.parseResult(resultBytes);
  }

  /**
   * Submit a revoke access transaction to the ledger.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async revokeAccess(data) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.submitTransaction('RevokePermission', JSON.stringify(data));

    return this.parseResult(resultBytes);
  }

  /**
   * Retrieve a previously created permission from the ledger.
   *
   * @param {string} permissionId - Permission grant identifier.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async getGrantById(permissionId) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.submitTransaction('GetPermissionById', JSON.stringify({ permissionId }));

    return this.parseResult(resultBytes);
  }

  /**
   * Retrieve the current active permission for a patient-professional pair.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @param {string} granteeId - Professional internal identifier.
   * @returns {Promise<Object|string|null>} Active permission or null when absent.
   */
  async getActivePermissionByPatientAndGrantee(patientPseudoId, granteeId) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.submitTransaction(
      'GetActivePermissionByPatientAndGrantee',
      JSON.stringify({ patientPseudoId, granteeId })
    );

    return this.parseResult(resultBytes);
  }

  /**
   * Resolve the active Fabric contract through the shared gateway
   * configuration.
   *
   * @returns {Promise<import('@hyperledger/fabric-gateway').Contract>} Fabric
   * contract instance.
   */
  async getContractReference() {
    return getContract();
  }

  /**
   * Create a normalized placeholder response for repository scaffolding.
   *
   * @param {string} operation - Repository operation name.
   * @param {Object} input - Input payload associated with the operation.
   * @returns {Object} Placeholder repository response.
   */
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
