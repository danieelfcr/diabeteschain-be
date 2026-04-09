const express = require('express');
const IdentityController = require('../controllers/identity.controller');

const router = express.Router();
const identityController = new IdentityController();

// POST /auth/register
router.post('/register', (req, res) => identityController.register(req, res));

module.exports = router;
