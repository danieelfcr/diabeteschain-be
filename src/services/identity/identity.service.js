const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Role, Status } = require('../../models/persistence/user.schema');
const IdentityRepository = require('../../repositories/identity.repository');
const { createAppError } = require('../../utils/app-error');

/**
 * Service responsible for identity-related business logic.
 * Handles user registration, authentication, and sanitization of user objects.
 */
class IdentityService {
  constructor() {
    this.repository = new IdentityRepository();
  }

  /**
   * Regular expression used to validate UUID identifiers.
   *
   * @returns {RegExp} UUID validation expression.
   */
  getUuidRegex() {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
   * Validate that a route identifier exists and follows UUID format.
   *
   * @param {string} identifier - Identifier received from the route parameter.
   * @param {string} fieldName - Parameter name used in error messages.
   * @throws {Error} When the identifier is missing or invalid.
   */
  validateUuidIdentifier(identifier, fieldName) {
    if (!identifier) {
      throw createAppError(`Missing required parameter: ${fieldName}`, 400);
    }

    if (!this.getUuidRegex().test(identifier)) {
      throw createAppError(`Invalid ${fieldName} format`, 400);
    }
  }

  /**
   * Shape the public key payload according to the user role and lookup type.
   *
   * @param {Object} user - User record returned from persistence.
   * @param {'professional'|'patient'} userType - Expected type of user.
   * @returns {Object} Sanitized public key response.
   * @throws {Error} When the user does not match the expected type or has no public key.
   */
  mapPublicKeyResponse(user, userType) {
    if (!user) {
      throw createAppError('User not found', 404);
    }

    const isPatient = user.role?.name === 'PATIENT';

    if (userType === 'patient' && !isPatient) {
      throw createAppError('User not found', 404);
    }

    if (userType === 'professional' && isPatient) {
      throw createAppError('User not found', 404);
    }

    if (!user.public_key) {
      throw createAppError('Public key not found for this user', 404);
    }

    const response = {
      username: user.username,
      role: user.role?.name || null,
      public_key: user.public_key,
    };

    if (isPatient) {
      response.pseudo_id = user.pseudo_id;
      return response;
    }

    response.id = user.id;
    return response;
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
      throw createAppError('Invalid credentials', 401, 'AUTH_ERROR');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw createAppError('Invalid credentials', 401, 'AUTH_ERROR');
    }

    if (user.status?.name !== 'ACTIVE') {
      throw createAppError('User is inactive or blocked', 403, 'AUTH_ERROR');
    }

    return this.sanitizeUser(user);
  }

  /**
   * Retrieve the public key of a professional user by internal identifier.
   *
   * @param {string} id - Internal user identifier.
   * @returns {Promise<Object>} Sanitized public key response.
   * @throws {Error} When validation fails or the user cannot be resolved.
   */
  async getProfessionalPublicKeyById(id) {
    this.validateUuidIdentifier(id, 'id');

    const user = await this.repository.findUserById(id);
    return this.mapPublicKeyResponse(user, 'professional');
  }

  /**
   * Retrieve the public key of a patient user by pseudo identifier.
   *
   * @param {string} pseudoId - Patient pseudo identifier.
   * @returns {Promise<Object>} Sanitized public key response.
   * @throws {Error} When validation fails or the patient cannot be resolved.
   */
  async getPatientPublicKeyByPseudoId(pseudoId) {
    this.validateUuidIdentifier(pseudoId, 'pseudoId');

    const user = await this.repository.findUserByPseudoId(pseudoId);
    return this.mapPublicKeyResponse(user, 'patient');
  }
}

module.exports = IdentityService;
