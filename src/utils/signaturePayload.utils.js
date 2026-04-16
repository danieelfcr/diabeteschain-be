const {
  normalizeIsoDateString,
  normalizeStringArray,
} = require('./signatureCanonicalization');
const { buildSignatureRecordPayload } = require('./clinicalRecord.utils');

/**
 * Normalize the permission validity period used in signature payloads.
 *
 * @param {Object} input - Raw permission validity period.
 * @param {string} input.validFrom - Permission start datetime.
 * @param {string} input.validTo - Permission end datetime.
 * @returns {{validFrom: string, validTo: string}} Normalized validity period.
 */
function normalizePermissionValidityPeriod({ validFrom, validTo }) {
  return {
    validFrom: normalizeIsoDateString(validFrom, 'validFrom'),
    validTo: normalizeIsoDateString(validTo, 'validTo'),
  };
}

/**
 * Normalize permission arrays that behave as unordered sets.
 *
 * @param {Object} input - Raw permission arrays.
 * @param {string[]} input.allowedActions - Allowed permission actions.
 * @param {string[]} input.allowedScopes - Allowed permission scopes.
 * @returns {{allowedActions: string[], allowedScopes: string[]}} Normalized arrays.
 */
function normalizePermissionSignatureCollections({ allowedActions, allowedScopes }) {
  return {
    // Order is not semantically meaningful for these permission sets, so we
    // sort them before signing to keep signatures stable.
    allowedActions: normalizeStringArray(allowedActions, {
      fieldName: 'allowedActions',
      sortValues: true,
    }),
    allowedScopes: normalizeStringArray(allowedScopes, {
      fieldName: 'allowedScopes',
      sortValues: true,
    }),
  };
}

/**
 * Build the canonical permission grant payload that must be signed.
 *
 * @param {Object} input - Signature payload input.
 * @returns {Object} Explicit signature payload.
 */
function buildGrantAccessSignaturePayload({
  patientPseudoId,
  granteeId,
  allowedActions,
  allowedScopes,
  validFrom,
  validTo,
}) {
  return {
    action: 'GRANT_ACCESS',
    patientPseudoId,
    granteeId,
    allowedActions,
    allowedScopes,
    validFrom,
    validTo,
  };
}

/**
 * Build the canonical access revocation payload that must be signed.
 *
 * @param {Object} input - Signature payload input.
 * @returns {Object} Explicit signature payload.
 */
function buildRevokeAccessSignaturePayload({ patientPseudoId, granteeId }) {
  return {
    action: 'REVOKE_ACCESS',
    patientPseudoId,
    granteeId,
  };
}

/**
 * Build the canonical doctor consultation payload that must be signed.
 *
 * @param {Object} payload - Request payload.
 * @returns {Object} Explicit signature payload.
 */
function buildDoctorConsultationSignaturePayload(payload) {
  return {
    action: 'REGISTER_DOCTOR_CONSULTATION',
    patientPseudoId: payload.patientPseudoId,
    encounter: buildSignatureRecordPayload(payload.encounter, 'ENCOUNTER'),
    labOrder: payload.labOrder
      ? buildSignatureRecordPayload(payload.labOrder, 'LAB_ORDER')
      : null,
    prescription: payload.prescription
      ? buildSignatureRecordPayload(payload.prescription, 'MEDICAL_PRESCRIPTION')
      : null,
  };
}

/**
 * Build the canonical laboratory result payload that must be signed.
 *
 * @param {Object} payload - Request payload.
 * @returns {Object} Explicit signature payload.
 */
function buildLaboratoryResultSignaturePayload(payload) {
  return {
    action: 'REGISTER_LABORATORY_RESULT',
    patientPseudoId: payload.patientPseudoId,
    basedOn: payload.basedOn,
    scopeId: payload.scopeId,
    payloadMetadata: payload.payloadMetadata,
    encryption: payload.encryption,
    integrity: payload.integrity,
  };
}

/**
 * Build the canonical pharmacy dispatch payload that must be signed.
 *
 * @param {Object} payload - Request payload.
 * @returns {Object} Explicit signature payload.
 */
function buildPharmacyDispatchSignaturePayload(payload) {
  return {
    action: 'REGISTER_PHARMACY_DISPATCH',
    patientPseudoId: payload.patientPseudoId,
    basedOn: payload.basedOn,
    scopeId: payload.scopeId,
    payloadMetadata: payload.payloadMetadata,
    encryption: payload.encryption,
    integrity: payload.integrity,
  };
}

module.exports = {
  normalizePermissionValidityPeriod,
  normalizePermissionSignatureCollections,
  buildGrantAccessSignaturePayload,
  buildRevokeAccessSignaturePayload,
  buildDoctorConsultationSignaturePayload,
  buildLaboratoryResultSignaturePayload,
  buildPharmacyDispatchSignaturePayload,
};
