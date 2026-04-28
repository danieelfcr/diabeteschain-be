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
   * Handle patient scope material preflight requests.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * scope material preflight result.
   */
  async getScopeMaterialPreflight(req, res, next) {
    try {
      const result = await this.orchestrationService.getScopeMaterialPreflight(
        req.validatedBody,
        req.user
      );
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Handle access grant requests.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async grantAccess(req, res, next) {
    try {
      const result = await this.orchestrationService.grantAccess(req.validatedBody, req.user);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Handle access revocation requests.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async revokeAccess(req, res, next) {
    try {
      const result = await this.orchestrationService.revokeAccess(req.validatedBody, req.user);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = PermissionController;
