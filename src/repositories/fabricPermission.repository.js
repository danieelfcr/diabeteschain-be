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
   * Normalize active permission query responses from the ledger.
   *
   * @param {Object|Array|string|null} result - Parsed ledger payload.
   * @returns {Object|string|null} Active permission payload.
   */
  normalizeActivePermission(result) {
    if (!result) {
      return null;
    }

    if (Array.isArray(result)) {
      return result[0] || null;
    }

    if (typeof result === 'string') {
      if (/not found|does not exist|no active/i.test(result)) {
        return null;
      }

      return result;
    }

    if (result.permission) {
      return result.permission;
    }

    if (result.data) {
      return result.data;
    }

    if (result.result) {
      return result.result;
    }

    return result;
  }

  /**
   * Normalize active permission query responses into an array.
   *
   * @param {Object|Array|string|null} result - Parsed ledger payload.
   * @returns {Array<Object>} Active permission list.
   */
  normalizeActivePermissions(result) {
    if (!result) {
      return [];
    }

    if (Array.isArray(result)) {
      return result.filter(Boolean);
    }

    if (typeof result === 'string') {
      if (/not found|does not exist|no active/i.test(result)) {
        return [];
      }

      return [];
    }

    if (Array.isArray(result.permissions)) {
      return result.permissions.filter(Boolean);
    }

    if (Array.isArray(result.data)) {
      return result.data.filter(Boolean);
    }

    if (Array.isArray(result.results)) {
      return result.results.filter(Boolean);
    }

    return [result].filter(Boolean);
  }

  /**
   * Normalize scope material query responses into an array.
   *
   * @param {Object|Array|string|null} result - Parsed ledger payload.
   * @returns {Array<Object>} Scope material list.
   */
  normalizeScopeMaterials(result) {
    if (!result) {
      return [];
    }

    if (Array.isArray(result)) {
      return result.filter(Boolean);
    }

    if (typeof result === 'string') {
      return [];
    }

    if (Array.isArray(result.scopeMaterials)) {
      return result.scopeMaterials.filter(Boolean);
    }

    if (Array.isArray(result.data)) {
      return result.data.filter(Boolean);
    }

    if (Array.isArray(result.results)) {
      return result.results.filter(Boolean);
    }

    return [result].filter(Boolean);
  }

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
    const resultBytes = await contract.evaluateTransaction(
      'GetActivePermissionByPatientAndGrantee',
      JSON.stringify({ patientPseudoId, granteeId })
    );

    return this.normalizeActivePermission(this.parseResult(resultBytes));
  }

  /**
   * Retrieve all active permissions for a patient-professional pair.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @param {string} granteeId - Professional internal identifier.
   * @returns {Promise<Array<Object>>} Active permission list.
   */
  async getActivePermissionsByPatientAndGrantee(patientPseudoId, granteeId) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.evaluateTransaction(
      'GetActivePermissionByPatientAndGrantee',
      JSON.stringify({ patientPseudoId, granteeId })
    );

    return this.normalizeActivePermissions(this.parseResult(resultBytes));
  }

  /**
   * Retrieve delegated scope materials linked to the provided permission ids.
   *
   * @param {string[]} permissionIds - Permission identifiers to resolve.
   * @returns {Promise<Array<Object>>} Scope material entries for the permissions.
   */
  async getScopeMaterialsByPermissionIds(permissionIds = []) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.evaluateTransaction(
      'GetScopeMaterialsByPermissionIds',
      JSON.stringify(permissionIds)
    );

    return this.normalizeScopeMaterials(this.parseResult(resultBytes));
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
