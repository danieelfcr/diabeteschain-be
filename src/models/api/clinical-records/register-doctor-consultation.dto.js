const { validateClinicalRecordInput, ensureRequired } = require('./clinical-record-event.dto.utils');
const { ensureNonEmptyString } = require('../user/user.dto.utils');

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
    this.patientUsername = payload.patientUsername;
    this.signature = payload.signature;
    this.encounter = payload.encounter;
    this.labOrder = payload.labOrder;
    this.prescription = payload.prescription;
  }

  /**
   * Validate the minimum contract required by the flow.
   */
  validate() {
    ensureRequired(this.patientUsername, 'patientUsername');
    this.patientUsername = ensureNonEmptyString(this.patientUsername, 'patientUsername');
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
