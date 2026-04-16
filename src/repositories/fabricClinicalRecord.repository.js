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
   * Extract a stable clinical record identifier from a ledger reference.
   *
   * @param {Object|null|undefined} reference - Ledger reference source.
   * @returns {string|null} Record identifier.
   */
  getRecordIdentifier(reference) {
    if (!reference) {
      return null;
    }

    return reference.recordId || reference.clinicalRecordId || reference.documentId || reference.id || reference._id || null;
  }

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
   * Normalize a single clinical record index response.
   *
   * @param {Object|Array|string|null} result - Parsed ledger payload.
   * @returns {Object|string|null} Normalized clinical record index.
   */
  normalizeClinicalRecordIndex(result) {
    if (!result) {
      return null;
    }

    if (Array.isArray(result)) {
      return result[0] || null;
    }

    if (typeof result === 'string') {
      return result;
    }

    if (result.record) {
      return result.record;
    }

    if (result.reference) {
      return result.reference;
    }

    if (result.index) {
      return result.index;
    }

    if (result.data) {
      return Array.isArray(result.data) ? result.data[0] || null : result.data;
    }

    return result;
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
   * Retrieve a single clinical record index from the patient's ledger history.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @param {string} recordId - Clinical record identifier.
   * @returns {Promise<Object|null>} Matching index or null when it does not exist.
   */
  async getClinicalRecordIndexByRecordId(patientPseudoId, recordId) {
    const references = await this.getPatientRecordIndexes(patientPseudoId);

    return references.find((reference) => this.getRecordIdentifier(reference) === recordId) || null;
  }

  /**
   * Register a clinical record index in the ledger.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object|string|null>} Registered clinical record index.
   */
  async registerClinicalRecordIndex(data) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.submitTransaction('RegisterClinicalRecordIndex', JSON.stringify(data));

    return this.normalizeClinicalRecordIndex(this.parseResult(resultBytes));
  }

  /**
   * Backwards-compatible alias for doctor-authored clinical event registration.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object|string|null>} Registered clinical record index.
   */
  async appendDoctorEvent(data) {
    return this.registerClinicalRecordIndex(data);
  }

  /**
   * Backwards-compatible alias for laboratory-authored clinical event registration.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object|string|null>} Registered clinical record index.
   */
  async appendLaboratoryEvent(data) {
    return this.registerClinicalRecordIndex(data);
  }

  /**
   * Backwards-compatible alias for pharmacy-authored clinical event registration.
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object|string|null>} Registered clinical record index.
   */
  async appendPharmacyDispatch(data) {
    return this.registerClinicalRecordIndex(data);
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
