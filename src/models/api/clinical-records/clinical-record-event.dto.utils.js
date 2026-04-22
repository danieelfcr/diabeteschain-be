const { createAppError } = require('../../../utils/app-error');

/**
 * Ensure a required scalar field is present.
 *
 * @param {*} value - Value to validate.
 * @param {string} fieldName - Field name used in the error message.
 */
function ensureRequired(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw createAppError(`Missing required field: ${fieldName}`, 400);
  }
}

/**
 * Ensure a field is a plain object.
 *
 * @param {*} value - Value to validate.
 * @param {string} fieldName - Field name used in the error message.
 */
function ensureObject(value, fieldName) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createAppError(`Field ${fieldName} must be an object`, 400);
  }
}

/**
 * Validate the common payload metadata section used by encrypted records.
 *
 * @param {Object} value - Raw payload metadata object.
 * @param {string} fieldName - Field name used in nested error messages.
 * @returns {Object} Normalized payload metadata object.
 */
function validatePayloadMetadata(value, fieldName) {
  ensureObject(value, fieldName);
  ensureRequired(value.fhirResourceType, `${fieldName}.fhirResourceType`);

  return {
    payloadFormat: value.payloadFormat || 'FHIR_JSON',
    fhirResourceType: value.fhirResourceType,
    contentType: value.contentType || 'application/json',
  };
}

/**
 * Validate the common encryption section used by encrypted records.
 *
 * @param {Object} value - Raw encryption metadata object.
 * @param {string} fieldName - Field name used in nested error messages.
 * @returns {Object} Normalized encryption metadata object.
 */
function validateEncryption(value, fieldName) {
  ensureObject(value, fieldName);
  ensureRequired(value.iv, `${fieldName}.iv`);
  ensureRequired(value.authTag, `${fieldName}.authTag`);
  ensureRequired(value.ciphertext, `${fieldName}.ciphertext`);
  if (value.capsule !== undefined && value.capsule !== null && typeof value.capsule !== 'string') {
    throw createAppError(`Field ${fieldName}.capsule must be a string`, 400);
  }

  const normalized = {
    algorithm: value.algorithm || 'AES-256-GCM',
    iv: value.iv,
    authTag: value.authTag,
    ciphertext: value.ciphertext,
  };

  if (value.capsule) {
    normalized.capsule = value.capsule;
  }

  return normalized;
}

/**
 * Validate the integrity section used by encrypted records.
 *
 * @param {Object} value - Raw integrity metadata object.
 * @param {string} fieldName - Field name used in nested error messages.
 * @returns {Object} Normalized integrity metadata object.
 */
function validateIntegrity(value, fieldName) {
  ensureObject(value, fieldName);
  ensureRequired(value.payloadHash, `${fieldName}.payloadHash`);

  return {
    payloadHash: value.payloadHash,
  };
}

/**
 * Validate a reusable encrypted clinical record payload block.
 *
 * @param {Object} value - Raw clinical record block.
 * @param {string} fieldName - Field name used in nested error messages.
 * @returns {Object} Normalized clinical record block.
 */
function validateClinicalRecordInput(value, fieldName) {
  ensureObject(value, fieldName);
  ensureRequired(value.scopeId, `${fieldName}.scopeId`);

  return {
    scopeId: value.scopeId,
    payloadMetadata: validatePayloadMetadata(value.payloadMetadata, `${fieldName}.payloadMetadata`),
    encryption: validateEncryption(value.encryption, `${fieldName}.encryption`),
    integrity: validateIntegrity(value.integrity, `${fieldName}.integrity`),
  };
}

module.exports = {
  ensureRequired,
  validateClinicalRecordInput,
  validatePayloadMetadata,
  validateEncryption,
  validateIntegrity,
};
