const express = require('express');
const AuditController = require('../controllers/audit.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const authorizeRoles = require('../middlewares/role.middleware');

/**
 * Router that exposes patient-facing audit endpoints.
 *
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * Controller instance responsible for audit HTTP requests.
 *
 * @type {AuditController}
 */
const auditController = new AuditController();

/**
 * GET /audit/me
 * Retrieve audit events for the authenticated patient.
 */
router.get(
  '/me',
  authMiddleware,
  authorizeRoles('PATIENT'),
  auditController.getMyAuditEvents.bind(auditController)
);

module.exports = router;
