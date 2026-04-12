const ClinicalRecordOrchestrationService = require('../services/orchestration/clinicalRecord.orchestration.service');

class ClinicalRecordController {
  constructor() {
    this.orchestrationService = new ClinicalRecordOrchestrationService();
  }

  createServiceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  async getMyHistory(req, res) {
    try {
      const actor = req.user;
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

  async getPatientHistory(req, res) {
    try {
      const { patientPseudoId } = req.params;
      if (!patientPseudoId) {
        throw this.createServiceError('Missing required parameter: patientPseudoId', 400);
      }

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

  async registerDoctorEvent(req, res) {
    try {
      const result = await this.orchestrationService.registerDoctorEvent(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error registering doctor event');
    }
  }

  async registerLaboratoryEvent(req, res) {
    try {
      const result = await this.orchestrationService.registerLaboratoryEvent(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error registering laboratory event');
    }
  }

  async registerPharmacyDispatch(req, res) {
    try {
      const result = await this.orchestrationService.registerPharmacyDispatch(req.body, req.user);
      return res.status(202).json(result);
    } catch (error) {
      return this.handleError(error, res, 'Error registering pharmacy dispatch');
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

module.exports = ClinicalRecordController;
