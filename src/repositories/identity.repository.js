const { User, Role, Status } = require('../models/persistence/user.schema');

/**
 * Repository class for identity-related persistence operations.
 * Encapsulates database access for user creation and retrieval.
 */
class IdentityRepository {
  /**
   * Create a new user record in the database and return it with related role and status.
   *
   * @param {Object} userData - The user payload to persist.
   * @returns {Promise<Object>} The created user with role and status associations.
   * @throws {Error} When database creation fails.
   */
  async createUser(userData) {
    try {
      const user = await User.create(userData);

      // Retrieve the newly created record with associated role and status metadata.
      const createdUser = await User.findByPk(user.id, {
        include: [
          { model: Role, as: 'role' },
          { model: Status, as: 'status' }
        ]
      });

      return createdUser;
    } catch (error) {
      throw error;
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
        include: [
          { model: Role, as: 'role' },
          { model: Status, as: 'status' }
        ]
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
        include: [{ model: Role, as: 'role' }],
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
        where: { pseudo_id: pseudoId },
        include: [{ model: Role, as: 'role' }],
      });
    } catch (error) {
      throw new Error(`Error finding user by pseudo id: ${error.message}`);
    }
  }
}

module.exports = IdentityRepository;
