const { ensureNonEmptyString } = require('./user.dto.utils');

/**
 * DTO for patient public key lookups by pseudo identifier.
 */
class GetPatientPublicKeyDTO {
  /**
   * Build a DTO instance from the raw request params.
   *
   * @param {Object} payload - Raw route params.
   */
  constructor(payload = {}) {
    this.pseudoId = payload.pseudoId;
  }

  /**
   * Validate and normalize the lookup payload.
   */
  validate() {
    this.pseudoId = ensureNonEmptyString(this.pseudoId, 'pseudoId');
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
