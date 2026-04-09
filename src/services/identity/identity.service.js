const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Role, Status } = require('../../models/persistence/user.schema');
const IdentityRepository = require('../../repositories/identity.repository');

/**
 * Service responsible for identity-related business logic.
 * Handles user registration, authentication, and sanitization of user objects.
 */
class IdentityService {
  constructor() {
    this.repository = new IdentityRepository();
  }

  /**
   * Remove sensitive fields from a user object before returning it to the caller.
   *
   * @param {Object} user - The user object returned from persistence.
   * @returns {Object} Sanitized user object without secret data.
   */
  sanitizeUser(user) {
    return {
      id: user.id,
      pseudo_id: user.pseudo_id,
      username: user.username,
      email: user.email,
      role: user.role?.name || null,
      professional_id: user.professional_id,
      status: user.status?.name || null,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  /**
   * Create a structured authentication error with an HTTP status code.
   *
   * @param {string} message - The error message to return.
   * @param {number} statusCode - HTTP status code associated with the error.
   * @returns {Error} Error object with a statusCode property.
   */
  createAuthError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  /**
   * Register a new user in the system.
   * Validates role membership, uniqueness of email, and handles password hashing.
   *
   * @param {Object} userData - The user data submitted for registration.
   * @returns {Promise<Object>} The created user record with associations.
   * @throws {Error} When validation or persistence fails.
   */
  async registerUser(userData) {
    const { role, professional_id, email, password, ...otherFields } = userData;

    // Validate that the provided role is permitted for registration.
    const allowedRoles = ['PATIENT', 'DOCTOR', 'PHARMACIST', 'LABORATORY'];
    if (!allowedRoles.includes(role)) {
      throw new Error('Invalid role. Allowed roles: PATIENT, DOCTOR, PHARMACIST, LABORATORY');
    }

    // Assign a pseudo_id only for patients; other roles must provide a professional identifier.
    let pseudo_id = null;
    if (role === 'PATIENT') {
      pseudo_id = crypto.randomUUID();
    } else {
      if (!professional_id) {
        throw new Error('professional_id is required for non-PATIENT roles');
      }
    }

    // Ensure the email address is not already used by another account.
    const existingUser = await this.repository.findByEmail(email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Hash the password before persisting it.
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Resolve role and status references from catalog tables.
    const roleRecord = await Role.findOne({ where: { name: role } });
    if (!roleRecord) {
      throw new Error('Role not found');
    }
    const role_id = roleRecord.id;

    const statusRecord = await Status.findOne({ where: { name: 'ACTIVE' } });
    if (!statusRecord) {
      throw new Error('Status ACTIVE not found');
    }
    const status_id = statusRecord.id;

    // Compose the payload to persist a new user.
    const newUserData = {
      ...otherFields,
      pseudo_id,
      professional_id: role === 'PATIENT' ? null : professional_id,
      email,
      password_hash,
      role_id,
      status_id,
    };

    // Persist the user record and return the resulting object.
    const user = await this.repository.createUser(newUserData);
    return user;
  }

  /**
   * Authenticate a user with email and password.
   *
   * @param {Object} credentials - The login credentials.
   * @param {string} credentials.email - The user email address.
   * @param {string} credentials.password - The plaintext password.
   * @returns {Promise<Object>} The sanitized authenticated user.
   * @throws {Error} When authentication fails.
   */
  async loginUser(credentials) {
    const { email, password } = credentials;

    const user = await this.repository.findAuthUserByEmail(email);
    if (!user) {
      throw this.createAuthError('Invalid credentials', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw this.createAuthError('Invalid credentials', 401);
    }

    if (user.status?.name !== 'ACTIVE') {
      throw this.createAuthError('User is inactive or blocked', 403);
    }

    return this.sanitizeUser(user);
  }
}

module.exports = IdentityService;
