const { ensureNonEmptyString } = require('./user.dto.utils');

/**
 * DTO for the identity user registration flow.
 */
class RegisterUserDTO {
  /**
   * Build a DTO instance from the raw request body.
   *
   * @param {Object} payload - Raw request payload.
   */
  constructor(payload = {}) {
    this.username = payload.username;
    this.email = payload.email;
    this.password = payload.password;
    this.cuiHash = payload.cuiHash;
    this.firstName = payload.firstName;
    this.middleName = payload.middleName;
    this.firstLastName = payload.firstLastName;
    this.secondLastName = payload.secondLastName;
    this.role = payload.role;
    this.professionalId = payload.professionalId;
    this.publicKey = payload.publicKey;
    this.encryptedPrivateKeyByPassword = payload.encryptedPrivateKeyByPassword;
    this.passwordKdfSalt = payload.passwordKdfSalt;
    this.encryptedPrivateKeyByRecovery = payload.encryptedPrivateKeyByRecovery;
    this.recoveryKdfSalt = payload.recoveryKdfSalt;
    this.recoveryKeyHash = payload.recoveryKeyHash;
  }

  /**
   * Validate and normalize the minimum registration contract.
   */
  validate() {
    this.username = ensureNonEmptyString(this.username, 'username');
    this.email = ensureNonEmptyString(this.email, 'email');
    this.password = ensureNonEmptyString(this.password, 'password', { trim: false });
    this.cuiHash = ensureNonEmptyString(this.cuiHash, 'cuiHash', { trim: false });
    this.firstName = ensureNonEmptyString(this.firstName, 'firstName');
    this.middleName = ensureNonEmptyString(this.middleName, 'middleName');
    this.firstLastName = ensureNonEmptyString(this.firstLastName, 'firstLastName');
    this.secondLastName = ensureNonEmptyString(this.secondLastName, 'secondLastName');
    this.role = ensureNonEmptyString(this.role, 'role');
    this.publicKey = ensureNonEmptyString(this.publicKey, 'publicKey', { trim: false });
    this.encryptedPrivateKeyByPassword = ensureNonEmptyString(
      this.encryptedPrivateKeyByPassword,
      'encryptedPrivateKeyByPassword',
      { trim: false }
    );
    this.passwordKdfSalt = ensureNonEmptyString(this.passwordKdfSalt, 'passwordKdfSalt', { trim: false });
    this.encryptedPrivateKeyByRecovery = ensureNonEmptyString(
      this.encryptedPrivateKeyByRecovery,
      'encryptedPrivateKeyByRecovery',
      { trim: false }
    );
    this.recoveryKdfSalt = ensureNonEmptyString(this.recoveryKdfSalt, 'recoveryKdfSalt', { trim: false });
    this.recoveryKeyHash = ensureNonEmptyString(this.recoveryKeyHash, 'recoveryKeyHash', { trim: false });

    if (this.professionalId !== undefined && this.professionalId !== null) {
      this.professionalId = ensureNonEmptyString(this.professionalId, 'professionalId');
    }
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Raw request payload.
   * @returns {RegisterUserDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new RegisterUserDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = RegisterUserDTO;
