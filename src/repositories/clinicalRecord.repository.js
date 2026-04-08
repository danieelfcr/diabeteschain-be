const ClinicalRecordModel = require('../models/persistence/clinicalRecord.schema');

class ClinicalRecordRepository {
  async create(clinicalRecordData) {
    const clinicalRecord = new ClinicalRecordModel(clinicalRecordData);
    return clinicalRecord.save();
  }

  async findById(recordId) {
    return ClinicalRecordModel.findById(recordId).lean().exec();
  }

  async findAll(filter = {}) {
    const query = {};

    if (filter.patientPseudoId) {
      query.patientPseudoId = filter.patientPseudoId;
    }
    if (filter.scopeId) {
      query.scopeId = filter.scopeId;
    }
    if (filter.recordType) {
      query.recordType = filter.recordType;
    }

    return ClinicalRecordModel.find(query).sort({ createdAt: -1 }).lean().exec();
  }
}

module.exports = new ClinicalRecordRepository();
