const express = require('express');
const IdentityController = require('../controllers/identity.controller');

const router = express.Router();
const identityController = new IdentityController();

/**
 * POST /auth/register
 * Register a new user account in the identity domain.
 */
router.post('/register', identityController.register.bind(identityController));

/**
 * POST /auth/login
 * Authenticate a user with email and password credentials.
 */
router.post('/login', identityController.login.bind(identityController));

/**
 * GET /auth/users/:id/public-key
 * Retrieve the public key of a professional user by internal identifier.
 */
router.get('/users/:id/public-key', identityController.getUserPublicKey.bind(identityController));

/**
 * GET /auth/patients/:pseudoId/public-key
 * Retrieve the public key of a patient user by pseudo identifier.
 */
router.get('/patients/:pseudoId/public-key', identityController.getPatientPublicKey.bind(identityController));

module.exports = router;
