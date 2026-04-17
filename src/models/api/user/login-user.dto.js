const { ensureNonEmptyString } = require('./user.dto.utils');

/**
 * DTO for user login requests.
 */
class LoginUserDTO {
  /**
   * Build a DTO instance from the raw request body.
   *
   * @param {Object} payload - Raw request payload.
   */
  constructor(payload = {}) {
    this.email = payload.email;
    this.password = payload.password;
  }

  /**
   * Validate and normalize the login payload.
   */
  validate() {
    this.email = ensureNonEmptyString(this.email, 'email');
    this.password = ensureNonEmptyString(this.password, 'password', { trim: false });
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Raw request payload.
   * @returns {LoginUserDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new LoginUserDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = LoginUserDTO;
