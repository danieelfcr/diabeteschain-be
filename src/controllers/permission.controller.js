const PermissionOrchestrationService = require('../services/orchestration/permission.orchestration.service');

/**
 * Controller responsible for patient permission management endpoints.
 *
 * The controller performs request-level validation and delegates access grant
 * and revocation workflows to the orchestration service layer.
 */
class PermissionController {
  /**
   * Build a controller with its orchestration service dependency.
   */
  constructor() {
    this.orchestrationService = new PermissionOrchestrationService();
  }

  /**
   * Create a typed application error that includes an HTTP status code.
   *
   * @param {string} message - Error message intended for the response.
   * @param {number} statusCode - HTTP status code associated with the error.
   * @returns {Error} Error instance extended with a statusCode property.
   */
  createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  /**
   * Handle access grant requests.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async grantAccess(req, res) {
    try {
      this.validateAccessPayload(req.body);
      const result = await this.orchestrationService.grantAccess(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error granting access');
    }
  }

  /**
   * Handle access revocation requests.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async revokeAccess(req, res) {
    try {
      this.validateAccessPayload(req.body);
      const result = await this.orchestrationService.revokeAccess(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error revoking access');
    }
  }

  /**
   * Validate the minimal payload required by the permission use cases.
   *
   * @param {Object} payload - Request payload received from the client.
   * @throws {Error} When any required field is missing.
   */
  validateAccessPayload(payload) {
    const requiredFields = ['patientPseudoId', 'professionalId'];

    for (const field of requiredFields) {
      if (!payload?.[field]) {
        throw this.createServiceError(`Missing required field: ${field}`, 400);
      }
    }
  }

  /**
   * Translate controller and service errors into consistent HTTP responses.
   *
   * @param {Error} error - Error raised by the request handling flow.
   * @param {import('express').Response} res - Express response object.
   * @param {string} logMessage - Contextual message for server logs.
   * @returns {import('express').Response} Error response.
   */
  handleError(error, res, logMessage) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error(logMessage, error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = PermissionController;
