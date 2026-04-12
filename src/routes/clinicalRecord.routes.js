const express = require('express');
const ClinicalRecordController = require('../controllers/clinicalRecord.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const authorizeRoles = require('../middlewares/role.middleware');

const router = express.Router();
const clinicalRecordController = new ClinicalRecordController();

router.get(
  '/history/me',
  authMiddleware,
  authorizeRoles('PATIENT'),
  clinicalRecordController.getMyHistory.bind(clinicalRecordController)
);

router.get(
  '/history/:patientPseudoId',
  authMiddleware,
  authorizeRoles('DOCTOR', 'LABORATORY', 'PHARMACIST'),
  clinicalRecordController.getPatientHistory.bind(clinicalRecordController)
);

router.post(
  '/events/doctor',
  authMiddleware,
  authorizeRoles('DOCTOR'),
  clinicalRecordController.registerDoctorEvent.bind(clinicalRecordController)
);

router.post(
  '/events/laboratory',
  authMiddleware,
  authorizeRoles('LABORATORY'),
  clinicalRecordController.registerLaboratoryEvent.bind(clinicalRecordController)
);

router.post(
  '/events/pharmacy',
  authMiddleware,
  authorizeRoles('PHARMACIST'),
  clinicalRecordController.registerPharmacyDispatch.bind(clinicalRecordController)
);

module.exports = router;
