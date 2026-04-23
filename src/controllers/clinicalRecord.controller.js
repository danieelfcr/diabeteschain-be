const ClinicalRecordOrchestrationService = require('../services/orchestration/clinicalRecord.orchestration.service');
const GetProfessionalHistoryDTO = require('../models/api/clinical-records/get-professional-history.dto');
const RegisterDoctorConsultationDTO = require('../models/api/clinical-records/register-doctor-consultation.dto');
const RegisterLaboratoryResultDTO = require('../models/api/clinical-records/register-laboratory-result.dto');
const RegisterPharmacyDispatchDTO = require('../models/api/clinical-records/register-pharmacy-dispatch.dto');

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
      const result = await this.orchestrationService.getPatientHistory({}, req.user);
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
  async getProfessionalHistory(req, res, next) {
    try {
      const payload = req.validatedBody || GetProfessionalHistoryDTO.from({
        patientUsername: req.params.patientUsername,
      });

      const result = await this.orchestrationService.getProfessionalHistory(payload, req.user);
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
  async registerDoctorConsultation(req, res, next) {
    try {
      const payload = req.validatedBody || RegisterDoctorConsultationDTO.from(req.body);
      const result = await this.orchestrationService.registerDoctorConsultation(payload, req.user);
      return res.status(201).json(result);
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
  async registerLaboratoryResult(req, res, next) {
    try {
      const payload = req.validatedBody || RegisterLaboratoryResultDTO.from(req.body);
      const result = await this.orchestrationService.registerLaboratoryResult(payload, req.user);
      return res.status(201).json(result);
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
      const payload = req.validatedBody || RegisterPharmacyDispatchDTO.from(req.body);
      const result = await this.orchestrationService.registerPharmacyDispatch(payload, req.user);
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Backwards-compatible alias for the existing doctor route handler.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async registerDoctorEvent(req, res, next) {
    return this.registerDoctorConsultation(req, res, next);
  }

  /**
   * Backwards-compatible alias for the existing laboratory route handler.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON response with the
   * orchestration result.
   */
  async registerLaboratoryEvent(req, res, next) {
    return this.registerLaboratoryResult(req, res, next);
  }
}

module.exports = ClinicalRecordController;
