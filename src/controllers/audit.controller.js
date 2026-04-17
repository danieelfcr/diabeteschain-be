const AuditOrchestrationService = require('../services/orchestration/audit.orchestration.service');

/**
 * Controller responsible for patient-facing audit endpoints.
 */
class AuditController {
  /**
   * Build a controller with its orchestration service dependency.
   */
  constructor() {
    this.orchestrationService = new AuditOrchestrationService();
  }

  /**
   * Handle retrieval of the authenticated patient's audit timeline.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * normalized audit event list.
   */
  async getMyAuditEvents(req, res, next) {
    try {
      const result = await this.orchestrationService.getMyAuditEvents(req.user);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = AuditController;
