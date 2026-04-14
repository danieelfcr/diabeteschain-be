const ClinicalRecordOrchestrationService = require('../services/orchestration/clinicalRecord.orchestration.service');
const { createAppError } = require('../utils/app-error');

/**
 * Controller responsible for clinical record HTTP endpoints.
 *
 * The controller validates request-level concerns, delegates business
 * orchestration to the service layer, and shapes HTTP responses without
 * embedding Fabric, Mongo, or external service details.
 */
class ClinicalRecordController {
  /**
   * Build a controller with its orchestration service dependency.
   */
  constructor() {
    this.orchestrationService = new ClinicalRecordOrchestrationService();
  }

  /**
   * Handle the patient's own history query.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async getMyHistory(req, res, next) {
    try {
      const actor = req.user;
      // The authenticated patient's pseudo identifier becomes the primary
      // filter for self-history retrieval.
      const filters = {
        patientPseudoId: actor?.pseudoId,
        scopeId: req.query.scopeId,
        recordType: req.query.recordType,
      };

      const result = await this.orchestrationService.getPatientHistory(filters, actor);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Handle a professional query for a patient's history.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async getPatientHistory(req, res, next) {
    try {
      const { patientPseudoId } = req.params;
      if (!patientPseudoId) {
        throw createAppError('Missing required parameter: patientPseudoId', 400);
      }

      // Route and query data are normalized before they are passed to the
      // orchestration layer.
      const filters = {
        patientPseudoId,
        scopeId: req.query.scopeId,
        recordType: req.query.recordType,
      };

      const result = await this.orchestrationService.getProfessionalHistory(filters, req.user);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Handle doctor-authored clinical event registration.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async registerDoctorEvent(req, res, next) {
    try {
      const result = await this.orchestrationService.registerDoctorEvent(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Handle laboratory event registration.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async registerLaboratoryEvent(req, res, next) {
    try {
      const result = await this.orchestrationService.registerLaboratoryEvent(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Handle pharmacy dispatch registration.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async registerPharmacyDispatch(req, res, next) {
    try {
      const result = await this.orchestrationService.registerPharmacyDispatch(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = ClinicalRecordController;
