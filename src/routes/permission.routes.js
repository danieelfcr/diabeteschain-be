const express = require('express');
const PermissionController = require('../controllers/permission.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const authorizeRoles = require('../middlewares/role.middleware');
const validateDto = require('../middlewares/validateDto.middleware');
const GrantAccessDTO = require('../models/api/permissions/grant-access.dto');
const RevokeAccessDTO = require('../models/api/permissions/revoke-access.dto');
const ScopeMaterialPreflightDTO = require('../models/api/permissions/scope-material-preflight.dto');

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
 * POST /permissions/scope-materials/preflight
 * Resolve which patient-owned scope materials already exist before granting access.
 */
router.post(
  '/scope-materials/preflight',
  authMiddleware,
  authorizeRoles('PATIENT'),
  validateDto(ScopeMaterialPreflightDTO),
  permissionController.getScopeMaterialPreflight.bind(permissionController)
);

/**
 * POST /permissions/grants
 * Create a new access grant from a patient to a healthcare professional.
 */
router.post(
  '/grants',
  authMiddleware,
  authorizeRoles('PATIENT'),
  validateDto(GrantAccessDTO),
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
  validateDto(RevokeAccessDTO),
  permissionController.revokeAccess.bind(permissionController)
);

module.exports = router;
