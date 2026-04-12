const { getContract } = require('../config/fabric_gateway');

class FabricClinicalRecordRepository {
  async getHistoryByPatientPseudoId(patientPseudoId) {
    await this.getContractReference();
    return this.buildPendingResponse('getHistoryByPatientPseudoId', { patientPseudoId });
  }

  async appendDoctorEvent(data) {
    await this.getContractReference();
    return this.buildPendingResponse('appendDoctorEvent', data);
  }

  async appendLaboratoryEvent(data) {
    await this.getContractReference();
    return this.buildPendingResponse('appendLaboratoryEvent', data);
  }

  async appendPharmacyDispatch(data) {
    await this.getContractReference();
    return this.buildPendingResponse('appendPharmacyDispatch', data);
  }

  async getContractReference() {
    return getContract();
  }

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
