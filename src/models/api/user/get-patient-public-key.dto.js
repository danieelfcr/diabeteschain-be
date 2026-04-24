const { ensureNonEmptyString } = require('./user.dto.utils');

/**
 * DTO for patient public key lookups by username.
 */
class GetPatientPublicKeyDTO {
  /**
   * Build a DTO instance from the raw request params.
   *
   * @param {Object} payload - Raw route params.
   */
  constructor(payload = {}) {
    this.username = payload.username;
  }

  /**
   * Validate and normalize the lookup payload.
   */
  validate() {
    this.username = ensureNonEmptyString(this.username, 'username');
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Raw route params.
   * @returns {GetPatientPublicKeyDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new GetPatientPublicKeyDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = GetPatientPublicKeyDTO;
