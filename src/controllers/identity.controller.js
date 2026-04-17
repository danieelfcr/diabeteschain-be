const IdentityService = require('../services/identity/identity.service');
const securityConfig = require('../config/security');
const { signAccessToken } = require('../utils/jwt');
const RegisterUserDTO = require('../models/api/user/register-user.dto');
const LoginUserDTO = require('../models/api/user/login-user.dto');
const GetUserPublicKeyDTO = require('../models/api/user/get-user-public-key.dto');
const GetPatientPublicKeyDTO = require('../models/api/user/get-patient-public-key.dto');

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
  async register(req, res, next) {
    try {
      const payload = req.validatedBody || RegisterUserDTO.from(req.body);
      const user = await this.identityService.registerUser(payload);

      return res.status(201).json({
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
      if (error.message === 'Email already exists') {
        error.statusCode = 409;
      }

      if (error.name === 'SequelizeUniqueConstraintError') {
        error.statusCode = 409;
        error.message = 'Unique constraint violation: ' + error.errors.map(e => e.path).join(', ');
      }

      if (error.name === 'SequelizeValidationError') {
        error.statusCode = 400;
        error.message = 'Validation error: ' + error.errors.map(e => e.message).join(', ');
      }

      if (
        error.message.includes('Invalid role')
        || error.message.includes('professionalId is required')
      ) {
        error.statusCode = 400;
      }

      return next(error);
    }
  }

  /**
   * Authenticate a user and return sanitized user information.
   *
   * @param {import('express').Request} req - The express request object.
   * @param {import('express').Response} res - The express response object.
   * @returns {Promise<void>} Sends a JSON response.
   */
  async login(req, res, next) {
    try {
      const payload = req.validatedBody || LoginUserDTO.from(req.body);
      const { user, tokenPayload } = await this.identityService.loginUser(payload);
      const accessToken = signAccessToken(tokenPayload);

      return res.status(200).json({
        message: 'Login successful',
        tokenType: 'Bearer',
        accessToken,
        expiresIn: securityConfig.jwt.accessExpiresIn,
        user,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Retrieve the public key of a professional user by internal identifier.
   *
   * @param {import('express').Request} req - The express request object.
   * @param {import('express').Response} res - The express response object.
   * @returns {Promise<void>} Sends a JSON response.
   */
  async getUserPublicKey(req, res, next) {
    try {
      const payload = GetUserPublicKeyDTO.from(req.params);
      const user = await this.identityService.getProfessionalPublicKeyById(payload.id);

      return res.status(200).json({
        message: 'Public key retrieved successfully',
        user,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Retrieve the public key of a patient user by pseudo identifier.
   *
   * @param {import('express').Request} req - The express request object.
   * @param {import('express').Response} res - The express response object.
   * @returns {Promise<void>} Sends a JSON response.
   */
  async getPatientPublicKey(req, res, next) {
    try {
      const payload = GetPatientPublicKeyDTO.from(req.params);
      const user = await this.identityService.getPatientPublicKeyByPseudoId(payload.pseudoId);

      return res.status(200).json({
        message: 'Public key retrieved successfully',
        user,
      });
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = IdentityController;
