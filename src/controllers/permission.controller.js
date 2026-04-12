const PermissionOrchestrationService = require('../services/orchestration/permission.orchestration.service');

class PermissionController {
  constructor() {
    this.orchestrationService = new PermissionOrchestrationService();
  }

  createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  async grantAccess(req, res) {
    try {
      this.validateAccessPayload(req.body);
      const result = await this.orchestrationService.grantAccess(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error granting access');
    }
  }

  async revokeAccess(req, res) {
    try {
      this.validateAccessPayload(req.body);
      const result = await this.orchestrationService.revokeAccess(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error revoking access');
    }
  }

  validateAccessPayload(payload) {
    const requiredFields = ['patientPseudoId', 'professionalId'];

    for (const field of requiredFields) {
      if (!payload?.[field]) {
        throw this.createServiceError(`Missing required field: ${field}`, 400);
      }
    }
  }

  handleError(error, res, logMessage) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(logMessage, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = PermissionController;
