const mongoose = require('mongoose');

const ClinicalRecordSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    patientPseudoId: { type: String, required: true, trim: true },
    scopeId: { type: String, required: true, trim: true },
    recordType: {
      type: String,
      required: true,
      enum: ['LAB_RESULT', 'LAB_ORDER', 'ENCOUNTER', 'MEDICAL_PRESCRIPTION'],
    },
    encounterId: { type: String, default: null, trim: true },
    relationships: {
      basedOn: { type: String, default: null, trim: true },
      partOf: { type: String, default: null, trim: true },
    },
    payloadMetadata: {
      payloadFormat: { type: String, required: true, trim: true, default: 'FHIR_JSON' },
      fhirResourceType: { type: String, required: true, trim: true },
      contentType: { type: String, required: true, trim: true, default: 'application/json' },
    },
    encryption: {
      algorithm: { type: String, required: true, trim: true, default: 'AES-256-GCM' },
      iv: { type: String, required: true, trim: true },
      authTag: { type: String, required: true, trim: true },
      ciphertext: { type: String, required: true, trim: true },
    },
    integrity: {
      payloadHash: { type: String, required: true, trim: true },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ClinicalRecordSchema.method('toJSON', function () {
  const object = this.toObject({ getters: true });
  delete object.__v;
  return object;
});

const ClinicalRecordModel = mongoose.model('ClinicalRecord', ClinicalRecordSchema);

module.exports = ClinicalRecordModel;
