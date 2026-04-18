const express = require('express');
const ScopeController = require('../controllers/scope.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * Router that exposes the off-chain clinical scope catalog.
 *
 * The catalog is authenticated because it carries the off-chain semantic
 * mapping for otherwise opaque ledger scope identifiers.
 *
 * @type {import('express').Router}
 */
const router = express.Router();
const scopeController = new ScopeController();

/**
 * GET /scopes
 * Return active catalog entries with decrypted labels for the UI.
 */
router.get('/', authMiddleware, scopeController.listScopes.bind(scopeController));

module.exports = router;
