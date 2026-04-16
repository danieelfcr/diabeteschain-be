const express = require('express');
const ClinicalRecordController = require('../controllers/clinicalRecord.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const validateDto = require('../middlewares/validateDto.middleware');
const authorizeRoles = require('../middlewares/role.middleware');
const RegisterDoctorConsultationDTO = require('../models/api/clinical-records/register-doctor-consultation.dto');
const RegisterLaboratoryResultDTO = require('../models/api/clinical-records/register-laboratory-result.dto');
const RegisterPharmacyDispatchDTO = require('../models/api/clinical-records/register-pharmacy-dispatch.dto');

/**
 * Router that exposes clinical record endpoints for history retrieval and
 * clinical event registration.
 *
 * The route layer is intentionally kept thin. It applies authentication and
 * role guards, then delegates request handling to the controller.
 *
 * @type {import('express').Router}
 */
const router = express.Router();

/**
 * Controller instance that encapsulates HTTP handling for the clinical record
 * module.
 *
 * @type {ClinicalRecordController}
 */
const clinicalRecordController = new ClinicalRecordController();

/**
 * GET /clinical-records/history/me
 * Retrieve the authenticated patient's own history.
 */
router.get(
  '/history/me',
  authMiddleware,
  //authorizeRoles('PATIENT'),
  clinicalRecordController.getMyHistory.bind(clinicalRecordController)
);

/**
 * GET /clinical-records/history/:patientPseudoId
 * Retrieve a patient's history as an authorized healthcare professional.
 */
router.get(
  '/history/:patientPseudoId',
  authMiddleware,
  //authorizeRoles('DOCTOR', 'LABORATORY', 'PHARMACIST'),
  clinicalRecordController.getProfessionalHistory.bind(clinicalRecordController)
);

/**
 * POST /clinical-records/events/doctor
 * Register a clinical event authored by a doctor.
 */
router.post(
  '/events/doctor',
  authMiddleware,
  validateDto(RegisterDoctorConsultationDTO),
  //authorizeRoles('DOCTOR'),
  clinicalRecordController.registerDoctorConsultation.bind(clinicalRecordController)
);

/**
 * POST /clinical-records/events/laboratory
 * Register a laboratory event.
 */
router.post(
  '/events/laboratory',
  authMiddleware,
  validateDto(RegisterLaboratoryResultDTO),
  //authorizeRoles('LABORATORY'),
  clinicalRecordController.registerLaboratoryResult.bind(clinicalRecordController)
);

/**
 * POST /clinical-records/events/pharmacy
 * Register a pharmacy dispatch event.
 */
router.post(
  '/events/pharmacy',
  authMiddleware,
  validateDto(RegisterPharmacyDispatchDTO),
  //authorizeRoles('PHARMACIST'),
  clinicalRecordController.registerPharmacyDispatch.bind(clinicalRecordController)
);

module.exports = router;
