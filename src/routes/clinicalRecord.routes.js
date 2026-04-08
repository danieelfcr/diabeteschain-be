const express = require('express');
const ClinicalRecordRepository = require('../repositories/clinicalRecord.repository');

const router = express.Router();

const validateRequiredFields = (payload) => {
  const requiredFields = [
    '_id',
    'patientPseudoId',
    'scopeId',
    'recordType',
    'payloadMetadata',
    'encryption',
    'integrity',
  ];

  return requiredFields.every((field) => Object.prototype.hasOwnProperty.call(payload, field));
};

router.post('/', async (req, res, next) => {
  try {
    const clinicalRecord = req.body;

    if (!validateRequiredFields(clinicalRecord)) {
      return res.status(400).json({ error: 'Faltan campos obligatorios en el payload' });
    }

    const createdRecord = await ClinicalRecordRepository.create(clinicalRecord);
    return res.status(201).json(createdRecord);
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const filter = {
      patientPseudoId: req.query.patientPseudoId,
      scopeId: req.query.scopeId,
      recordType: req.query.recordType,
    };

    const records = await ClinicalRecordRepository.findAll(filter);
    return res.json(records);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = await ClinicalRecordRepository.findById(id);

    if (!record) {
      return res.status(404).json({ error: 'Clinical record no encontrado' });
    }

    return res.json(record);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
