const { createAppError } = require('../../../utils/app-error');

/**
 * Data transfer object for patient scope material preflight requests.
 *
 * The request allows the frontend to determine which granted scopes already
 * have patient-owned cryptographic material before creating an access grant.
 */
class ScopeMaterialPreflightDTO {
  /**
   * Build a DTO from the raw request payload.
   *
   * @param {Object} payload - Request payload received from the client.
   */
  constructor(payload = {}) {
    this.scopeIds = payload.scopeIds || payload.allowedScopes || payload.scopes;
  }

  /**
   * Validate and normalize the requested clinical scopes.
   *
   * @throws {Error} When scopeIds is missing or invalid.
   */
  validate() {
    if (!Array.isArray(this.scopeIds) || this.scopeIds.length === 0) {
      throw createAppError('Field scopeIds must be a non-empty array', 400);
    }

    this.scopeIds = [...new Set(
      this.scopeIds
        .map((scopeId, index) => {
          if (typeof scopeId !== 'string') {
            throw createAppError(`Field scopeIds[${index}] must be a string`, 400);
          }

          return scopeId.trim();
        })
        .filter(Boolean)
    )];

    if (this.scopeIds.length === 0) {
      throw createAppError('Field scopeIds must include at least one scope', 400);
    }
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Request payload received from the client.
   * @returns {ScopeMaterialPreflightDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new ScopeMaterialPreflightDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = ScopeMaterialPreflightDTO;
