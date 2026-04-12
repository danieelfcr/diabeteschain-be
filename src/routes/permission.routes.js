const express = require('express');
const PermissionController = require('../controllers/permission.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const authorizeRoles = require('../middlewares/role.middleware');

const router = express.Router();
const permissionController = new PermissionController();

router.post(
  '/grants',
  authMiddleware,
  authorizeRoles('PATIENT'),
  permissionController.grantAccess.bind(permissionController)
);

router.post(
  '/revocations',
  authMiddleware,
  authorizeRoles('PATIENT'),
  permissionController.revokeAccess.bind(permissionController)
);

module.exports = router;
