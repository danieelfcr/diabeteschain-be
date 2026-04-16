/**
 * Data transfer object for access revocation requests.
 *
 * This DTO keeps the revoke contract independent from the grant contract so
 * each use case can evolve without sharing unrelated fields.
 */
const { createAppError } = require('../../../utils/app-error');

class RevokeAccessDTO {
  /**
   * Build a DTO from the raw request payload.
   *
   * @param {Object} payload - Request payload received from the client.
   */
  constructor(payload = {}) {
    this.professionalId = payload.professionalId;
    this.signature = payload.signature;
  }

  /**
   * Validate that the payload contains the minimum fields required by the
   * revoke access flow.
   *
   * @throws {Error} When any required field is missing.
   */
  validate() {
    const requiredFields = ['professionalId', 'signature'];

    for (const field of requiredFields) {
      if (!this[field]) {
        throw createAppError(`Missing required field: ${field}`, 400);
      }
    }
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Request payload received from the client.
   * @returns {RevokeAccessDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new RevokeAccessDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = RevokeAccessDTO;
