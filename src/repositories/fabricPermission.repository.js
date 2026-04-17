const { getContract } = require('../config/fabric_gateway');
const {
  parseFabricResult,
  normalizeActivePermission,
  normalizeActivePermissions,
  normalizeScopeMaterials,
} = require('../utils/fabricPermission.utils');

/**
 * Repository that encapsulates all ledger interactions related to patient
 * permission management.
 *
 * The current implementation exists to establish the repository boundary and
 * keep Fabric Gateway access out of controllers and orchestration consumers.
 */
class FabricPermissionRepository {
  /**
   * Evaluate a transaction against the configured chaincode contract.
   *
   * @param {string} functionName - Chaincode transaction name.
   * @param {Object|Array} payload - Serialized payload sent to chaincode.
   * @returns {Promise<Object|Array|string|null>} Parsed transaction result.
   */
  async evaluateTransaction(functionName, payload) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.evaluateTransaction(functionName, JSON.stringify(payload));
    return parseFabricResult(resultBytes);
  }

  /**
   * Submit a transaction against the configured chaincode contract.
   *
   * @param {string} functionName - Chaincode transaction name.
   * @param {Object|Array} payload - Serialized payload sent to chaincode.
   * @returns {Promise<Object|Array|string|null>} Parsed transaction result.
   */
  async submitTransaction(functionName, payload) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.submitTransaction(functionName, JSON.stringify(payload));
    return parseFabricResult(resultBytes);
  }

  /**
   * Submit a grant access transaction to the ledger.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async grantAccess(data) {
    return this.submitTransaction('CreatePermission', data);
  }

  /**
   * Submit a revoke access transaction to the ledger.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async revokeAccess(data) {
    return this.submitTransaction('RevokePermission', data);
  }

  /**
   * Retrieve a previously created permission from the ledger.
   *
   * @param {string} permissionId - Permission grant identifier.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async getGrantById(permissionId) {
    return this.submitTransaction('GetPermissionById', { permissionId });
  }

  /**
   * Retrieve the current active permission for a patient-professional pair.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @param {string} granteeId - Professional internal identifier.
   * @returns {Promise<Object|string|null>} Active permission or null when absent.
   */
  async getActivePermissionByPatientAndGrantee(patientPseudoId, granteeId) {
    const result = await this.evaluateTransaction(
      'GetActivePermissionByPatientAndGrantee',
      { patientPseudoId, granteeId }
    );

    return normalizeActivePermission(result);
  }

  /**
   * Retrieve all active permissions for a patient-professional pair.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @param {string} granteeId - Professional internal identifier.
   * @returns {Promise<Array<Object>>} Active permission list.
   */
  async getActivePermissionsByPatientAndGrantee(patientPseudoId, granteeId) {
    const result = await this.evaluateTransaction(
      'GetActivePermissionByPatientAndGrantee',
      { patientPseudoId, granteeId }
    );

    return normalizeActivePermissions(result);
  }

  /**
   * Retrieve delegated scope materials linked to the provided permission ids.
   *
   * @param {string[]} permissionIds - Permission identifiers to resolve.
   * @returns {Promise<Array<Object>>} Scope material entries for the permissions.
   */
  async getScopeMaterialsByPermissionIds(permissionIds = []) {
    const result = await this.evaluateTransaction('GetScopeMaterialsByPermissionIds', permissionIds);
    return normalizeScopeMaterials(result);
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

}

module.exports = FabricPermissionRepository;
