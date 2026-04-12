const ClinicalRecordRepository = require('../../repositories/clinicalRecord.repository');
const FabricClinicalRecordRepository = require('../../repositories/fabricClinicalRecord.repository');
const ProxyReencryptionClient = require('../../clients/proxyReencryption/proxyReencryption.client');

class ClinicalRecordOrchestrationService {
  constructor() {
    this.clinicalRecordRepository = ClinicalRecordRepository;
    this.fabricClinicalRecordRepository = new FabricClinicalRecordRepository();
    this.proxyReencryptionClient = new ProxyReencryptionClient();
  }

  async getPatientHistory(filters, actor) {
    return {
      message: 'Patient history orchestration pending implementation',
      status: 'pending_implementation',
      action: 'get_patient_history',
      actor: this.mapActor(actor),
      filters,
      integrationPoints: [
        'FabricClinicalRecordRepository.getHistoryByPatientPseudoId',
        'ClinicalRecordRepository.findAll',
        'ProxyReencryptionClient.resolveHistoryAccess',
      ],
    };
  }

  async getProfessionalHistory(filters, actor) {
    return {
      message: 'Professional history orchestration pending implementation',
      status: 'pending_implementation',
      action: 'get_professional_history',
      actor: this.mapActor(actor),
      filters,
      integrationPoints: [
        'FabricClinicalRecordRepository.getHistoryByPatientPseudoId',
        'ClinicalRecordRepository.findAll',
        'ProxyReencryptionClient.resolveHistoryAccess',
      ],
    };
  }

  async registerDoctorEvent(payload, actor) {
    return {
      message: 'Doctor event orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_doctor_event',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendDoctorEvent',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  async registerLaboratoryEvent(payload, actor) {
    return {
      message: 'Laboratory event orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_laboratory_event',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendLaboratoryEvent',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  async registerPharmacyDispatch(payload, actor) {
    return {
      message: 'Pharmacy dispatch orchestration pending implementation',
      status: 'pending_implementation',
      action: 'register_pharmacy_dispatch',
      actor: this.mapActor(actor),
      payload,
      integrationPoints: [
        'FabricClinicalRecordRepository.appendPharmacyDispatch',
        'ClinicalRecordRepository.create',
      ],
    };
  }

  mapActor(actor) {
    if (!actor) {
      return null;
    }

    return {
      id: actor.id || null,
      pseudo_id: actor.pseudo_id || null,
      role: actor.role?.name || actor.role || null,
    };
  }
}

module.exports = ClinicalRecordOrchestrationService;
