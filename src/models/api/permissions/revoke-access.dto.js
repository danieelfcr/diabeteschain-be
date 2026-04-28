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
