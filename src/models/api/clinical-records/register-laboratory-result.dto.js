const {
  ensureRequired,
  validatePayloadMetadata,
  validateEncryption,
  validateIntegrity,
} = require('./clinical-record-event.dto.utils');

/**
 * DTO for laboratory result registration.
 */
class RegisterLaboratoryResultDTO {
  /**
   * Build a DTO instance from the raw request body.
   *
   * @param {Object} payload - Raw request payload.
   */
  constructor(payload = {}) {
    this.patientPseudoId = payload.patientPseudoId;
    this.scopeId = payload.scopeId;
    this.basedOn = payload.basedOn;
    this.signature = payload.signature;
    this.payloadMetadata = payload.payloadMetadata;
    this.encryption = payload.encryption;
    this.integrity = payload.integrity;
  }

  /**
   * Validate the minimum contract required by the flow.
   */
  validate() {
    ensureRequired(this.patientPseudoId, 'patientPseudoId');
    ensureRequired(this.scopeId, 'scopeId');
    ensureRequired(this.basedOn, 'basedOn');
    ensureRequired(this.signature, 'signature');

    this.payloadMetadata = validatePayloadMetadata(this.payloadMetadata, 'payloadMetadata');
    this.encryption = validateEncryption(this.encryption, 'encryption');
    this.integrity = validateIntegrity(this.integrity, 'integrity');
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Raw request payload.
   * @returns {RegisterLaboratoryResultDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new RegisterLaboratoryResultDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = RegisterLaboratoryResultDTO;
