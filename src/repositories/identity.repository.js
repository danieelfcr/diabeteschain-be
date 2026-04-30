const crypto = require('crypto');
const {
  sequelize,
  User,
  Role,
  Status,
  Organization,
  Patient,
  Professional,
} = require('../models/persistence/user.schema');
const { serializeCanonicalPayload } = require('../utils/signatureCanonicalization');

const userProfileIncludes = [
  { model: Role, as: 'role' },
  { model: Status, as: 'status' },
  { model: Patient, as: 'patient' },
  {
    model: Professional,
    as: 'professional',
    include: [{ model: Organization, as: 'organization' }],
  },
];

/**
 * Repository class for identity-related persistence operations.
 * Encapsulates database access for user creation and retrieval.
 */
class IdentityRepository {
  /**
   * Create a new user record and its role-specific identity profile.
   *
   * @param {Object} userData - The user payload to persist.
   * @param {Object} profileData - Patient or professional profile payload.
   * @param {Object} [profileData.patient] - Patient profile data.
   * @param {Object} [profileData.professional] - Professional profile data.
   * @returns {Promise<Object>} The created user with role and status associations.
   * @throws {Error} When database creation fails.
   */
  async createUser(userData, profileData = {}) {
    try {
      return await sequelize.transaction(async (transaction) => {
        const user = await User.create(userData, { transaction });

        if (profileData.patient) {
          await Patient.create(
            {
              userId: user.id,
              pseudoId: profileData.patient.pseudoId,
            },
            { transaction }
          );
        }

        if (profileData.professional) {
          await Professional.create(
            {
              userId: user.id,
              professionalId: profileData.professional.professionalId,
              organizationId: profileData.professional.organizationId,
            },
            { transaction }
          );
        }

        return await User.findByPk(user.id, {
          include: userProfileIncludes,
          transaction,
        });
      });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retrieve all available healthcare organizations.
   *
   * @returns {Promise<Array<Object>>} Organization catalog records.
   */
  async listOrganizations() {
    try {
      return await Organization.findAll({
        order: [['name', 'ASC']],
      });
    } catch (error) {
      throw new Error(`Error listing organizations: ${error.message}`);
    }
  }

  /**
   * Find an organization by its stable identifier.
   *
   * @param {string} organizationId - Organization identifier.
   * @returns {Promise<Object|null>} Matching organization or null.
   */
  async findOrganizationById(organizationId) {
    try {
      return await Organization.findByPk(organizationId);
    } catch (error) {
      throw new Error(`Error finding organization by id: ${error.message}`);
    }
  }

  /**
   * Find a user by email address for existence checks and uniqueness validation.
   *
   * @param {string} email - The email address to search for.
   * @returns {Promise<Object|null>} The matching user or null when not found.
   * @throws {Error} When query execution fails.
   */
  async findByEmail(email) {
    try {
      return await this.findAuthUserByEmail(email);
    } catch (error) {
      throw new Error(`Error finding user by email: ${error.message}`);
    }
  }

  /**
   * Find an authenticated user by email, including role and status associations.
   *
   * @param {string} email - The email address used for authentication.
   * @returns {Promise<Object|null>} The user record with associations, or null if none exists.
   * @throws {Error} When query execution fails.
   */
  async findAuthUserByEmail(email) {
    try {
      const user = await User.findOne({
        where: { email },
        include: userProfileIncludes,
      });
      return user;
    } catch (error) {
      throw new Error(`Error finding auth user by email: ${error.message}`);
    }
  }

  /**
   * Find a user by internal identifier including role metadata.
   *
   * @param {string} id - Internal user identifier.
   * @returns {Promise<Object|null>} Matching user or null when it does not exist.
   * @throws {Error} When query execution fails.
   */
  async findUserById(id) {
    try {
      return await User.findByPk(id, {
        include: userProfileIncludes,
      });
    } catch (error) {
      throw new Error(`Error finding user by id: ${error.message}`);
    }
  }

  /**
   * Find a patient by pseudo identifier including role metadata.
   *
   * @param {string} pseudoId - Patient pseudo identifier.
   * @returns {Promise<Object|null>} Matching patient or null when it does not exist.
   * @throws {Error} When query execution fails.
   */
  async findUserByPseudoId(pseudoId) {
    try {
      return await User.findOne({
        include: [
          { model: Role, as: 'role' },
          { model: Status, as: 'status' },
          {
            model: Patient,
            as: 'patient',
            where: { pseudoId },
            required: true,
          },
          {
            model: Professional,
            as: 'professional',
            include: [{ model: Organization, as: 'organization' }],
          },
        ],
      });
    } catch (error) {
      throw new Error(`Error finding user by pseudo id: ${error.message}`);
    }
  }

  /**
   * Find a user by username including role metadata.
   *
   * @param {string} username - Public username used by API clients.
   * @returns {Promise<Object|null>} Matching user or null when it does not exist.
   * @throws {Error} When query execution fails.
   */
  async findUserByUsername(username) {
    try {
      return await User.findOne({
        where: { username },
        include: userProfileIncludes,
      });
    } catch (error) {
      throw new Error(`Error finding user by username: ${error.message}`);
    }
  }

  /**
   * Verify a detached signature against the canonical representation of a
   * structured payload using the provided public key.
   *
   * @param {Object} input - Signature verification input.
   * @param {string} input.publicKey - PEM encoded public key.
   * @param {Object} input.payload - Structured payload signed by the client.
   * @param {string} input.signature - Base64 encoded detached signature.
   * @returns {boolean} True when the signature is valid.
   */
  verifySignature({ publicKey, payload, signature }) {
    if (!publicKey || !payload || !signature) {
      return false;
    }

    const verifier = crypto.createVerify('SHA256');
    verifier.update(serializeCanonicalPayload(payload), 'utf8');
    verifier.end();

    return verifier.verify(publicKey, signature, 'base64');
  }
}

module.exports = IdentityRepository;
