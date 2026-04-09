const express = require('express');
const IdentityController = require('../controllers/identity.controller');

const router = express.Router();
const identityController = new IdentityController();

/**
 * POST /auth/register
 * Register a new user account in the identity domain.
 */
router.post('/register', (req, res) => identityController.register(req, res));

/**
 * POST /auth/login
 * Authenticate a user with email and password credentials.
 */
router.post('/login', (req, res) => identityController.login(req, res));

module.exports = router;
