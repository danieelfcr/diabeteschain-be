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
 *
 * Public by design in this prototype because clients need to fetch public keys
 * before encrypted exchanges and signatures can be validated. The endpoint only
 * exposes already-public key material and no private credentials.
 */
router.get('/users/:id/public-key', identityController.getUserPublicKey.bind(identityController));

/**
 * GET /auth/patients/:pseudoId/public-key
 * Retrieve the public key of a patient user by pseudo identifier.
 *
 * Public by design for the same bootstrap reason as the professional key
 * lookup: it enables the current cryptographic exchange flow without requiring
 * a prior authenticated channel.
 */
router.get('/patients/:pseudoId/public-key', identityController.getPatientPublicKey.bind(identityController));

module.exports = router;
