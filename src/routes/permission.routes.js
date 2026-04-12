const express = require('express');
const PermissionController = require('../controllers/permission.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const authorizeRoles = require('../middlewares/role.middleware');

/**
 * Router that exposes access management endpoints for patient-controlled
 * permissions.
 *
 * Each route enforces authentication and patient role restrictions before
 * delegating to the permission controller.
 *
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * Controller instance responsible for permission-related HTTP requests.
 *
 * @type {PermissionController}
 */
const permissionController = new PermissionController();

/**
 * POST /permissions/grants
 * Create a new access grant from a patient to a healthcare professional.
 */
router.post(
  '/grants',
  authMiddleware,
  authorizeRoles('PATIENT'),
  permissionController.grantAccess.bind(permissionController)
);

/**
 * POST /permissions/revocations
 * Revoke an existing access grant controlled by the patient.
 */
router.post(
  '/revocations',
  authMiddleware,
  authorizeRoles('PATIENT'),
  permissionController.revokeAccess.bind(permissionController)
);

module.exports = router;
