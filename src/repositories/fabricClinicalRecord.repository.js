const { getContract } = require('../config/fabric_gateway');
const {
  getRecordIdentifier,
  parseFabricResult,
  normalizePatientRecordIndexes,
  normalizeClinicalRecordIndex,
  normalizeAuditEvents,
} = require('../utils/fabricClinicalRecord.utils');

/**
 * Repository that encapsulates all ledger interactions related to clinical
 * records and audit events.
 */
class FabricClinicalRecordRepository {
  /**
   * Evaluate a transaction against the configured chaincode contract.
   *
   * @param {string} functionName - Chaincode transaction name.
   * @param {Object} payload - Serialized payload sent to chaincode.
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
   * @param {Object} payload - Serialized payload sent to chaincode.
   * @returns {Promise<Object|Array|string|null>} Parsed transaction result.
   */
  async submitTransaction(functionName, payload) {
    const contract = await this.getContractReference();
    const resultBytes = await contract.submitTransaction(functionName, JSON.stringify(payload));
    return parseFabricResult(resultBytes);
  }

  /**
   * Retrieve a patient's own history from the ledger without emitting an audit
   * event.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @returns {Promise<Array<Object>>} Ledger references or metadata.
   */
  async getPatientRecordIndexes(patientPseudoId) {
    const result = await this.evaluateTransaction('GetHistoryByPatientPseudoId', { patientPseudoId });
    return normalizePatientRecordIndexes(result);
  }

  /**
   * Retrieve a patient's history for a healthcare professional using the
   * audit-aware chaincode operation.
   *
   * Expected chaincode function name: GetHistoryByPatientPseudoIdWithAudit
   *
   * @param {Object} input - Professional query context.
   * @param {string} input.patientPseudoId - Target patient pseudo identifier.
   * @param {string} input.actorId - Authenticated professional identifier.
   * @param {string} input.actorRole - Authenticated professional role.
   * @returns {Promise<Array<Object>>} Ledger references or metadata.
   */
  async getPatientRecordIndexesWithAudit({ patientPseudoId, actorId, actorRole }) {
    const result = await this.evaluateTransaction(
      'GetHistoryByPatientPseudoIdWithAudit',
      {
        patientPseudoId,
        actorId,
        actorRole,
      }
    );

    return normalizePatientRecordIndexes(result);
  }

  /**
   * Backwards-compatible alias for patient history lookups on the ledger.
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @returns {Promise<Array<Object>>} Ledger references or metadata.
   */
  async getHistoryByPatientPseudoId(patientPseudoId) {
    return this.getPatientRecordIndexes(patientPseudoId);
  }

  /**
   * Retrieve audit events for one patient from the ledger.
   *
   * Expected chaincode function name:
   * - GetAuditEventsByPatientPseudoId
   *
   * @param {string} patientPseudoId - Patient pseudo identifier.
   * @returns {Promise<Array<Object>>} Simplified audit events.
   */
  async getAuditEventsByPatientPseudoId(patientPseudoId) {
    const result = await this.evaluateTransaction('GetAuditEventsByPatientPseudoId', { patientPseudoId });
    return normalizeAuditEvents(result);
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

    return references.find((reference) => getRecordIdentifier(reference) === recordId) || null;
  }

  /**
   * Register a clinical record index in the ledger using the audit-aware
   * chaincode operation.
   *
   * Expected chaincode function name: RegisterClinicalRecordWithAudit
   *
   * @param {Object} data - Domain payload for the Fabric transaction.
   * @returns {Promise<Object|string|null>} Registered clinical record index.
   */
  async registerClinicalRecordIndex(data) {
    const result = await this.submitTransaction('RegisterClinicalRecordWithAudit', data);

    return normalizeClinicalRecordIndex(result);
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
}

module.exports = FabricClinicalRecordRepository;
