/**
 * Data transfer object for access revocation requests.
 *
 * This DTO keeps the revoke contract independent from the grant contract so
 * each use case can evolve without sharing unrelated fields.
 */
const { createAppError } = require('../../../utils/app-error');
const { ensureNonEmptyString } = require('../user/user.dto.utils');

class RevokeAccessDTO {
  /**
   * Build a DTO from the raw request payload.
   *
   * @param {Object} payload - Request payload received from the client.
   */
  constructor(payload = {}) {
    this.permissionId = payload.permissionId;
    this.professionalUsername = payload.professionalUsername;
    this.granteeId = payload.granteeId;
    this.scopes = payload.scopes;
    this.signature = payload.signature;
  }

  /**
   * Validate that the payload contains the minimum fields required by the
   * revoke access flow.
   *
   * @throws {Error} When any required field is missing.
   */
  validate() {
    if (!this.professionalUsername && !this.granteeId) {
      throw createAppError('Missing required field: granteeId or professionalUsername', 400);
    }

    if (this.permissionId) {
      this.permissionId = ensureNonEmptyString(this.permissionId, 'permissionId');
    }

    if (this.professionalUsername) {
      this.professionalUsername = ensureNonEmptyString(
        this.professionalUsername,
        'professionalUsername'
      );
    }

    if (this.granteeId) {
      this.granteeId = ensureNonEmptyString(this.granteeId, 'granteeId');
    }

    if (this.signature) {
      this.signature = ensureNonEmptyString(this.signature, 'signature');
    }

    if (this.scopes !== undefined && this.scopes !== null) {
      if (!Array.isArray(this.scopes)) {
        throw createAppError('Field scopes must be an array', 400);
      }

      this.scopes = this.scopes
        .map((scopeId) => String(scopeId || '').trim())
        .filter(Boolean);

      if (this.scopes.length === 0) {
        throw createAppError('Field scopes must include at least one scope', 400);
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
