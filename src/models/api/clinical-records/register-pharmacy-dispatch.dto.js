const {
  ensureRequired,
  validatePayloadMetadata,
  validateEncryption,
  validateIntegrity,
} = require('./clinical-record-event.dto.utils');
const { ensureNonEmptyString } = require('../user/user.dto.utils');

/**
 * DTO for pharmacy dispatch registration.
 */
class RegisterPharmacyDispatchDTO {
  /**
   * Build a DTO instance from the raw request body.
   *
   * @param {Object} payload - Raw request payload.
   */
  constructor(payload = {}) {
    this.patientUsername = payload.patientUsername;
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
    ensureRequired(this.patientUsername, 'patientUsername');
    this.patientUsername = ensureNonEmptyString(this.patientUsername, 'patientUsername');
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
   * @returns {RegisterPharmacyDispatchDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new RegisterPharmacyDispatchDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = RegisterPharmacyDispatchDTO;
