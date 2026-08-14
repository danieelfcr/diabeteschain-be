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
   * Remove sensitive fields from a user object before returning it to the caller.
   *
   * @param {Object} user - The user object returned from persistence.
   * @returns {Object} Sanitized user object without secret data.
   */
  sanitizeUser(user) {
    const organization = user.professional?.organization || null;

    return {
      id: user.id,
      pseudoId: user.pseudoId,
      username: user.username,
      email: user.email,
      birthDate: user.birthDate || null,
      role: user.role?.name || null,
      professionalId: user.professionalId,
      organizationId: user.organizationId,
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
          }
        : null,
      status: user.status?.name || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Build the minimal JWT payload needed by protected routes.
   *
   * @param {Object} user - Sanitized authenticated user.
   * @returns {Object} JWT-safe access token payload.
   */
  buildAccessTokenPayload(user) {
    return {
      sub: user.id,
      role: user.role || null,
      pseudoId: user.pseudoId || null,
      professionalId: user.professionalId || null,
      organizationId: user.organizationId || null,
      email: user.email || null,
      username: user.username || null,
    };
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

    if (!user.publicKey) {
      throw createAppError('Public key not found for this user', 404);
    }

    return {
      username: user.username,
      role: user.role?.name || null,
      publicKey: user.publicKey,
    };
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
    const { role, professionalId, organizationId, email, password, ...otherFields } = userData;

    // Validate that the provided role is permitted for registration.
    const allowedRoles = ['PATIENT', 'DOCTOR', 'PHARMACIST', 'LABORATORY'];
    if (!allowedRoles.includes(role)) {
      throw new Error('Invalid role. Allowed roles: PATIENT, DOCTOR, PHARMACIST, LABORATORY');
    }

    // Assign a pseudoId only for patients; other roles must provide professional profile data.
    let profileData = {};
    if (role === 'PATIENT') {
      profileData = {
        patient: {
          pseudoId: crypto.randomUUID(),
        },
      };
    } else {
      if (!professionalId) {
        throw new Error('professionalId is required for non-PATIENT roles');
      }

      if (!organizationId) {
        throw new Error('organizationId is required for non-PATIENT roles');
      }

      const organization = await this.repository.findOrganizationById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      profileData = {
        professional: {
          professionalId,
          organizationId: organization.id,
        },
      };
    }

    // Ensure the email address is not already used by another account.
    const existingUser = await this.repository.findByEmail(email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Hash the password before persisting it.
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Resolve role and status references from catalog tables.
    const roleRecord = await Role.findOne({ where: { name: role } });
    if (!roleRecord) {
      throw new Error('Role not found');
    }
    const roleId = roleRecord.id;

    const statusRecord = await Status.findOne({ where: { name: 'ACTIVE' } });
    if (!statusRecord) {
      throw new Error('Status ACTIVE not found');
    }
    const statusId = statusRecord.id;

    // Compose the payload to persist a new user.
    const newUserData = {
      ...otherFields,
      email,
      passwordHash,
      roleId,
      statusId,
    };

    // Persist the user record and return the resulting object.
    const user = await this.repository.createUser(newUserData, profileData);
    return user;
  }

  /**
   * Retrieve the healthcare organization catalog for registration flows.
   *
   * @returns {Promise<Array<Object>>} Sanitized organization catalog.
   */
  async listOrganizations() {
    const organizations = await this.repository.listOrganizations();
    return organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
    }));
  }

  /**
   * Authenticate a user with an email address or username and password.
   *
   * @param {Object} credentials - The login credentials.
   * @param {string} credentials.identifier - The user email address or username.
   * @param {string} credentials.password - The plaintext password.
   * @returns {Promise<Object>} The sanitized authenticated user.
   * @throws {Error} When authentication fails.
   */
  async loginUser(credentials) {
    const { identifier, password } = credentials;

    const user = await this.repository.findAuthUserByIdentifier(identifier);
    if (!user) {
      throw createAppError('Invalid credentials', 401, 'AUTH_ERROR');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw createAppError('Invalid credentials', 401, 'AUTH_ERROR');
    }

    if (user.status?.name !== 'ACTIVE') {
      throw createAppError('User is inactive or blocked', 403, 'AUTH_ERROR');
    }

    const sanitizedUser = this.sanitizeUser(user);

    return {
      user: sanitizedUser,
      tokenPayload: this.buildAccessTokenPayload(sanitizedUser),
    };
  }

  /**
   * Retrieve the public key of a professional user by username.
   *
   * @param {string} username - Public username.
   * @returns {Promise<Object>} Sanitized public key response.
   * @throws {Error} When validation fails or the user cannot be resolved.
   */
  async getProfessionalPublicKeyByUsername(username) {
    const user = await this.repository.findUserByUsername(username);
    return this.mapPublicKeyResponse(user, 'professional');
  }

  /**
   * Retrieve the public key of a patient user by username.
   *
   * @param {string} username - Public username.
   * @returns {Promise<Object>} Sanitized public key response.
   * @throws {Error} When validation fails or the patient cannot be resolved.
   */
  async getPatientPublicKeyByUsername(username) {
    const user = await this.repository.findUserByUsername(username);
    return this.mapPublicKeyResponse(user, 'patient');
  }
}

module.exports = IdentityService;
