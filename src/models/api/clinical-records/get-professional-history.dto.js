const { createAppError } = require('../../../utils/app-error');
const { ensureNonEmptyString } = require('../user/user.dto.utils');

/**
 * Data transfer object for delegated professional history queries.
 *
 * It keeps the request contract small while normalizing the fields the
 * orchestration layer needs.
 */
class GetProfessionalHistoryDTO {
  /**
   * Build a DTO from the raw request payload.
   *
   * @param {Object} payload - Request payload received from the client.
   */
  constructor(payload = {}) {
    this.patientUsername = payload.patientUsername;
    this.scopeIds = payload.scopeIds || payload.scopes || null;
  }

  /**
   * Validate the minimum fields required by the delegated history flow.
   *
   * @throws {Error} When the required patient identifier is missing.
   */
  validate() {
    if (!this.patientUsername) {
      throw createAppError('Missing required field: patientUsername', 400);
    }

    this.patientUsername = ensureNonEmptyString(this.patientUsername, 'patientUsername');

    if (this.scopeIds !== null && this.scopeIds !== undefined) {
      const rawScopes = Array.isArray(this.scopeIds)
        ? this.scopeIds
        : String(this.scopeIds).split(',');

      this.scopeIds = rawScopes
        .map((scopeId) => String(scopeId || '').trim())
        .filter(Boolean);

      if (this.scopeIds.length === 0) {
        throw createAppError('Field scopeIds must include at least one scope', 400);
      }
    }
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Request payload received from the client.
   * @returns {GetProfessionalHistoryDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new GetProfessionalHistoryDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = GetProfessionalHistoryDTO;
