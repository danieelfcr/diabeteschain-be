const IdentityService = require('../services/identity/identity.service');

/**
 * Controller that exposes identity-related HTTP endpoints.
 * Delegates business logic to the IdentityService.
 */
class IdentityController {
  constructor() {
    this.identityService = new IdentityService();
  }

  /**
   * Register a new identity user and return a normalized response.
   *
   * @param {import('express').Request} req - The express request object.
   * @param {import('express').Response} res - The express response object.
   * @returns {Promise<void>} Sends a JSON response.
   */
  async register(req, res) {
    try {
      const userData = req.body;

      // Validate presence of required registration fields.
      const requiredFields = [
        'username', 'email', 'password', 'cuiHash', 'firstName', 'middleName',
        'firstLastName', 'secondLastName', 'role', 'publicKey',
        'encryptedPrivateKeyByPassword', 'passwordKdfSalt',
        'encryptedPrivateKeyByRecovery', 'recoveryKdfSalt', 'recoveryKeyHash'
      ];

      for (const field of requiredFields) {
        if (!userData[field]) {
          return res.status(400).json({ error: `Missing required field: ${field}` });
        }
      }

      const user = await this.identityService.registerUser(userData);

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          pseudoId: user.pseudoId,
          professionalId: user.professionalId,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          role: user.role.name,
          status: user.status.name,
          createdAt: user.createdAt,
        }
      });
    } catch (error) {
      console.log('Error type:', error.name, 'Message:', error.message);

      // Handle domain-specific conflict conditions.
      if (error.message === 'Email already exists') {
        return res.status(409).json({ error: error.message });
      }
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ error: 'Unique constraint violation: ' + error.errors.map(e => e.path).join(', ') });
      }
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({ error: 'Validation error: ' + error.errors.map(e => e.message).join(', ') });
      }
      if (error.message.includes('Invalid role') || error.message.includes('professionalId is required')) {
        return res.status(400).json({ error: error.message });
      }

      console.error('Error registering user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Authenticate a user and return sanitized user information.
   *
   * @param {import('express').Request} req - The express request object.
   * @param {import('express').Response} res - The express response object.
   * @returns {Promise<void>} Sends a JSON response.
   */
  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validate request payload fields.
      if (!email) {
        return res.status(400).json({ error: 'Missing required field: email' });
      }

      if (!password) {
        return res.status(400).json({ error: 'Missing required field: password' });
      }

      const user = await this.identityService.loginUser({ email, password });

      return res.status(200).json({
        message: 'Login successful',
        user,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      console.error('Error logging in user:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Retrieve the public key of a professional user by internal identifier.
   *
   * @param {import('express').Request} req - The express request object.
   * @param {import('express').Response} res - The express response object.
   * @returns {Promise<void>} Sends a JSON response.
   */
  async getUserPublicKey(req, res) {
    try {
      const { id } = req.params;
      const user = await this.identityService.getProfessionalPublicKeyById(id);

      return res.status(200).json({
        message: 'Public key retrieved successfully',
        user,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      console.error('Error retrieving professional public key:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Retrieve the public key of a patient user by pseudo identifier.
   *
   * @param {import('express').Request} req - The express request object.
   * @param {import('express').Response} res - The express response object.
   * @returns {Promise<void>} Sends a JSON response.
   */
  async getPatientPublicKey(req, res) {
    try {
      const { pseudoId } = req.params;
      const user = await this.identityService.getPatientPublicKeyByPseudoId(pseudoId);

      return res.status(200).json({
        message: 'Public key retrieved successfully',
        user,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      console.error('Error retrieving patient public key:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = IdentityController;
