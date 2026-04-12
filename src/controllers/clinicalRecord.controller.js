const ClinicalRecordOrchestrationService = require('../services/orchestration/clinicalRecord.orchestration.service');

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
   * Handle the patient's own history query.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async getMyHistory(req, res) {
    try {
      const actor = req.user;
      // The authenticated patient's pseudo identifier becomes the primary
      // filter for self-history retrieval.
      const filters = {
        patientPseudoId: actor?.pseudo_id,
        scopeId: req.query.scopeId,
        recordType: req.query.recordType,
      };

      const result = await this.orchestrationService.getPatientHistory(filters, actor);
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error retrieving patient history');
    }
  }

  /**
   * Handle a professional query for a patient's history.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async getPatientHistory(req, res) {
    try {
      const { patientPseudoId } = req.params;
      if (!patientPseudoId) {
        throw this.createServiceError('Missing required parameter: patientPseudoId', 400);
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
      return this.handleError(error, res, 'Error retrieving professional history');
    }
  }

  /**
   * Handle doctor-authored clinical event registration.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async registerDoctorEvent(req, res) {
    try {
      const result = await this.orchestrationService.registerDoctorEvent(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error registering doctor event');
    }
  }

  /**
   * Handle laboratory event registration.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async registerLaboratoryEvent(req, res) {
    try {
      const result = await this.orchestrationService.registerLaboratoryEvent(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error registering laboratory event');
    }
  }

  /**
   * Handle pharmacy dispatch registration.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async registerPharmacyDispatch(req, res) {
    try {
      const result = await this.orchestrationService.registerPharmacyDispatch(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error registering pharmacy dispatch');
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

module.exports = ClinicalRecordController;
