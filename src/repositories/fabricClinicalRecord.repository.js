const { getContract } = require('../config/fabric_gateway');

/**
 * Repository that encapsulates all ledger interactions related to clinical
 * records and clinical event transactions.
 *
 * The current methods expose the repository contract and ensure Fabric access
 * stays isolated in this layer, even while the concrete chaincode mapping is
 * still pending.
 */
class FabricClinicalRecordRepository {
  /**
   * Parse Fabric Gateway responses into JSON when possible.
   *
   * @param {Uint8Array|Buffer|null|undefined} resultBytes - Raw result bytes.
   * @returns {Object|Array|string|null} Parsed result payload.
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
   * Normalize the patient history response returned by the chaincode.
   *
   * Expected reference shape:
   * {
   *   docType,
   *   recordId,
   *   patientId,
   *   encounterId,
   *   scopeId,
   *   recordType,
   *   offchainUri,
   *   hash,
   *   createdBy,
   *   authorRole,
   *   status,
   *   createdAt,
   *   updatedAt
   * }
   *
   * @param {Object|Array|string|null} result - Parsed ledger payload.
   * @returns {Array<Object>} Normalized references array.
   */
  normalizePatientRecordIndexes(result) {
    if (!result) {
      return [];
    }

    if (Array.isArray(result)) {
      return result;
    }

    if (Array.isArray(result.references)) {
      return result.references;
    }

    if (Array.isArray(result.records)) {
      return result.records;
    }

    if (Array.isArray(result.data)) {
      return result.data;
    }

    return [];
  }

  /**
   * Retrieve a patient's history from the ledger.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @returns {Promise<Object|Array|string|null>} Ledger references or metadata.
   */
  async getPatientRecordIndexes(patientPseudoId) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.evaluateTransaction(
      'GetHistoryByPatientPseudoId',
      JSON.stringify({ patientPseudoId })
    );

    return this.normalizePatientRecordIndexes(this.parseResult(resultBytes));
  }

  /**
   * Backwards-compatible alias for patient history lookups on the ledger.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @returns {Promise<Object|Array|string|null>} Ledger references or metadata.
   */
  async getHistoryByPatientPseudoId(patientPseudoId) {
    return this.getPatientRecordIndexes(patientPseudoId);
  }

  /**
   * Submit a doctor-authored clinical event to the ledger.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async appendDoctorEvent(data) {
    await this.getContractReference();
    return this.buildPendingResponse('appendDoctorEvent', data);
  }

  /**
   * Submit a laboratory event to the ledger.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async appendLaboratoryEvent(data) {
    await this.getContractReference();
    return this.buildPendingResponse('appendLaboratoryEvent', data);
  }

  /**
   * Submit a pharmacy dispatch event to the ledger.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object>} Placeholder repository response.
   */
  async appendPharmacyDispatch(data) {
    await this.getContractReference();
    return this.buildPendingResponse('appendPharmacyDispatch', data);
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
      repository: 'FabricClinicalRecordRepository',
      operation,
      status: 'pending_implementation',
      input,
    };
  }
}

module.exports = FabricClinicalRecordRepository;
