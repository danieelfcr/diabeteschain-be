const { ensureNonEmptyString } = require('./user.dto.utils');

/**
 * DTO for professional public key lookups by internal id.
 */
class GetUserPublicKeyDTO {
  /**
   * Build a DTO instance from the raw request params.
   *
   * @param {Object} payload - Raw route params.
   */
  constructor(payload = {}) {
    this.id = payload.id;
  }

  /**
   * Validate and normalize the lookup payload.
   */
  validate() {
    this.id = ensureNonEmptyString(this.id, 'id');
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Raw route params.
   * @returns {GetUserPublicKeyDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new GetUserPublicKeyDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = GetUserPublicKeyDTO;
