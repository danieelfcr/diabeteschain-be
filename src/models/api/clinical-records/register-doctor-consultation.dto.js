const { validateClinicalRecordInput, ensureRequired } = require('./clinical-record-event.dto.utils');

/**
 * DTO for the doctor consultation registration flow.
 */
class RegisterDoctorConsultationDTO {
  /**
   * Build a DTO instance from the raw request body.
   *
   * @param {Object} payload - Raw request payload.
   */
  constructor(payload = {}) {
    this.patientPseudoId = payload.patientPseudoId;
    this.signature = payload.signature;
    this.encounter = payload.encounter;
    this.labOrder = payload.labOrder;
    this.prescription = payload.prescription;
  }

  /**
   * Validate the minimum contract required by the flow.
   */
  validate() {
    ensureRequired(this.patientPseudoId, 'patientPseudoId');
    ensureRequired(this.signature, 'signature');

    this.encounter = validateClinicalRecordInput(this.encounter, 'encounter');
    this.labOrder = this.labOrder ? validateClinicalRecordInput(this.labOrder, 'labOrder') : null;
    this.prescription = this.prescription
      ? validateClinicalRecordInput(this.prescription, 'prescription')
      : null;
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Raw request payload.
   * @returns {RegisterDoctorConsultationDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new RegisterDoctorConsultationDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = RegisterDoctorConsultationDTO;
