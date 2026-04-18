/**
 * Data transfer object for access grant requests.
 *
 * It centralizes payload validation and normalization for the grant access
 * use case before the request reaches the controller/service layer.
 */
const { createAppError } = require('../../../utils/app-error');

class GrantAccessDTO {
  /**
   * Build a DTO from the raw request payload.
   *
   * @param {Object} payload - Request payload received from the client.
   */
  constructor(payload = {}) {
    this.professionalId = payload.professionalId;
    this.allowedScopes = payload.allowedScopes;
    this.allowedActions = payload.allowedActions;
    this.validFrom = payload.validFrom;
    this.validTo = payload.validTo;
    this.signature = payload.signature;
    this.kfrags = Array.isArray(payload.kfrags) ? payload.kfrags : [];
  }

  /**
   * Validate that the payload contains the minimum fields required by the
   * grant access flow.
   *
   * @throws {Error} When any required field is missing.
   */
  validate() {
    const requiredFields = [
      'professionalId',
      'allowedScopes',
      'allowedActions',
      'validFrom',
      'validTo',
      'signature',
    ];

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
   * @returns {GrantAccessDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new GrantAccessDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = GrantAccessDTO;
