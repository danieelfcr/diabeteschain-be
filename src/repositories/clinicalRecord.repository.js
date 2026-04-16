const ClinicalRecordModel = require('../models/persistence/clinicalRecord.schema');

class ClinicalRecordRepository {
  /**
   * Extract record identifiers from ledger references.
   *
   * @param {Array<Object>} references - Reference items resolved from the ledger.
   * @returns {string[]} Extracted record identifiers.
   */
  extractReferenceIds(references = []) {
    return references
      .map((reference) => reference.recordId || reference.clinicalRecordId || reference.documentId || reference.id || reference._id || null)
      .filter(Boolean);
  }

  async create(clinicalRecordData) {
    const clinicalRecord = new ClinicalRecordModel(clinicalRecordData);
    return clinicalRecord.save();
  }

  async findById(recordId) {
    return ClinicalRecordModel.findById(recordId).lean().exec();
  }

  async deleteById(recordId) {
    return ClinicalRecordModel.findByIdAndDelete(recordId).exec();
  }

  async findAll(filter = {}) {
    const query = {};

    if (filter.patientPseudoId) {
      query.patientPseudoId = filter.patientPseudoId;
    }

    return ClinicalRecordModel.find(query).sort({ createdAt: -1 }).lean().exec();
  }

  /**
   * Retrieve encrypted clinical documents directly by the patient owner.
   *
   * @param {string} patientPseudoId - Authenticated patient pseudo identifier.
   * @returns {Promise<Array<Object>>} Matching encrypted clinical documents.
   */
  async getPatientClinicalDocuments(patientPseudoId) {
    return this.findAll({ patientPseudoId });
  }

  /**
   * Retrieve encrypted clinical records using a set of ledger references.
   *
   * @param {Array<Object>} references - Ledger references for the requested records.
   * @param {string} patientPseudoId - Authenticated patient pseudo identifier.
   * @returns {Promise<Array<Object>>} Matching encrypted clinical documents.
   */
  async getClinicalRecordsByReferences(references = [], patientPseudoId) {
    const query = { patientPseudoId };

    const recordIds = this.extractReferenceIds(references);
    if (references.length > 0 && recordIds.length === 0) {
      return [];
    }

    if (recordIds.length) {
      query._id = { $in: recordIds };
    }

    return ClinicalRecordModel.find(query).sort({ createdAt: -1 }).lean().exec();
  }
}

module.exports = new ClinicalRecordRepository();
