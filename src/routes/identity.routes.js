const express = require('express');
const IdentityController = require('../controllers/identity.controller');
const validateDto = require('../middlewares/validateDto.middleware');
const RegisterUserDTO = require('../models/api/user/register-user.dto');
const LoginUserDTO = require('../models/api/user/login-user.dto');

const router = express.Router();
const identityController = new IdentityController();

/**
 * POST /auth/register
 * Register a new user account in the identity domain.
 */
router.post(
  '/register',
  validateDto(RegisterUserDTO),
  identityController.register.bind(identityController)
);

/**
 * POST /auth/login
 * Authenticate a user with email and password credentials.
 */
router.post(
  '/login',
  validateDto(LoginUserDTO),
  identityController.login.bind(identityController)
);

/**
 * GET /auth/organizations
 * Retrieve the healthcare organization catalog used during professional registration.
 */
router.get('/organizations', identityController.getOrganizations.bind(identityController));

/**
 * GET /auth/users/:username/public-key
 * Retrieve the public key of a professional user by username.
 *
 * Public by design in this prototype because clients need to fetch public keys
 * before encrypted exchanges and signatures can be validated. The endpoint only
 * exposes already-public key material and no private credentials.
 */
router.get('/users/:username/public-key', identityController.getUserPublicKey.bind(identityController));

/**
 * GET /auth/patients/:username/public-key
 * Retrieve the public key of a patient user by username.
 *
 * Public by design for the same bootstrap reason as the professional key
 * lookup: it enables the current cryptographic exchange flow without requiring
 * a prior authenticated channel.
 */
router.get('/patients/:username/public-key', identityController.getPatientPublicKey.bind(identityController));

module.exports = router;
