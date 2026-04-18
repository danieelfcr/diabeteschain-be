const {
  AUDIT_ACTIONS_SET,
  AUDIT_OUTCOMES_SET,
  AUDIT_TARGET_TYPES_SET,
} = require('../constants/audit.constants');

/**
 * Extract a stable clinical record identifier from a ledger reference.
 *
 * @param {Object|null|undefined} reference - Ledger reference source.
 * @returns {string|null} Record identifier.
 */
function getRecordIdentifier(reference) {
  if (!reference) {
    return null;
  }

  return reference.recordId || reference.clinicalRecordId || reference.documentId || reference.id || reference._id || null;
}

/**
 * Parse Fabric Gateway responses into JSON when possible.
 *
 * @param {Uint8Array|Buffer|null|undefined} resultBytes - Raw result bytes.
 * @returns {Object|Array|string|null} Parsed result payload.
 */
function parseFabricResult(resultBytes) {
  if (!resultBytes?.length) {
    return null;
  }

  const resultText = Buffer.isBuffer(resultBytes)
    ? resultBytes.toString('utf8')
    : Buffer.from(resultBytes).toString('utf8');

  try {
    return JSON.parse(resultText);
  } catch (error) {
    return resultText;
  }
}

/**
 * Normalize the patient history response returned by the chaincode.
 *
 * @param {Object|Array|string|null} result - Parsed ledger payload.
 * @returns {Array<Object>} Normalized references array.
 */
function normalizePatientRecordIndexes(result) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (Array.isArray(result.references)) {
    return result.references;
  }

  if (Array.isArray(result.records)) {
    return result.records;
  }

  if (Array.isArray(result.data)) {
    return result.data;
  }

  return [];
}

/**
 * Normalize a single clinical record index response.
 *
 * @param {Object|Array|string|null} result - Parsed ledger payload.
 * @returns {Object|string|null} Normalized clinical record index.
 */
function normalizeClinicalRecordIndex(result) {
  if (!result) {
    return null;
  }

  if (Array.isArray(result)) {
    return result[0] || null;
  }

  if (typeof result === 'string') {
    return result;
  }

  if (result.record) {
    return result.record;
  }

  if (result.reference) {
    return result.reference;
  }

  if (result.index) {
    return result.index;
  }

  if (result.data) {
    return Array.isArray(result.data) ? result.data[0] || null : result.data;
  }

  return result;
}

/**
 * Infer an audit target type from the available source fields.
 *
 * @param {Object} event - Raw audit event.
 * @returns {string|null} Supported target type or null when unresolved.
 */
function inferAuditTargetType(event) {
  const directTargetType = typeof event?.targetType === 'string' ? event.targetType.trim() : null;
  const targetTypeMap = {
    permission: 'permission',
    scope: 'scope',
    encounter: 'encounter',
    laborder: 'labOrder',
    labresult: 'labResult',
    prescription: 'prescription',
    dispensation: 'dispensation',
    clinicalrecord: 'clinicalRecord',
  };

  const normalizedDirectTargetType = directTargetType ? targetTypeMap[directTargetType.toLowerCase()] || null : null;
  if (AUDIT_TARGET_TYPES_SET.has(normalizedDirectTargetType)) {
    return normalizedDirectTargetType;
  }

  if (event?.permissionId) {
    return 'permission';
  }

  if (event?.scopeId) {
    return 'scope';
  }

  const recordType = typeof event?.recordType === 'string' ? event.recordType.trim().toUpperCase() : null;
  const recordTypeMap = {
    ENCOUNTER: 'encounter',
    LAB_ORDER: 'labOrder',
    LAB_RESULT: 'labResult',
    MEDICAL_PRESCRIPTION: 'prescription',
    PRESCRIPTION: 'prescription',
    PHARMACY_DISPATCH: 'dispensation',
    DISPENSATION: 'dispensation',
    CLINICAL_RECORD: 'clinicalRecord',
  };

  return recordTypeMap[recordType] || (event?.recordId ? 'clinicalRecord' : null);
}

/**
 * Infer an audit target identifier from the available source fields.
 *
 * @param {Object} event - Raw audit event.
 * @returns {string|null} Target identifier.
 */
function inferAuditTargetId(event) {
  return event?.targetId || event?.scopeId || event?.permissionId || event?.recordId || event?.encounterId || null;
}

/**
 * Normalize one audit event to the simplified public shape.
 *
 * @param {Object|null|undefined} event - Raw audit event.
 * @returns {Object|null} Simplified audit event or null when invalid.
 */
function normalizeAuditEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return null;
  }

  const action = typeof event.action === 'string' ? event.action.trim().toUpperCase() : null;
  const outcomeSource = event.outcome || event.status || null;
  const outcome = typeof outcomeSource === 'string' ? outcomeSource.trim().toUpperCase() : null;
  const targetType = inferAuditTargetType(event);
  const normalizedEvent = {
    auditId: event.auditId || event.id || event.eventId || null,
    docType: 'auditEvent',
    patientId: event.patientId || event.patientPseudoId || null,
    actorId: event.actorId || event.createdBy || event.granteeId || null,
    actorRole: typeof (event.actorRole || event.authorRole || event.granteeRole || null) === 'string'
      ? String(event.actorRole || event.authorRole || event.granteeRole).trim().toLowerCase() || null
      : null,
    action: AUDIT_ACTIONS_SET.has(action) ? action : null,
    targetType: AUDIT_TARGET_TYPES_SET.has(targetType) ? targetType : null,
    targetId: inferAuditTargetId(event),
    outcome: AUDIT_OUTCOMES_SET.has(outcome) ? outcome : null,
    timestamp: event.timestamp || event.createdAt || event.updatedAt || null,
  };

  if (
    !normalizedEvent.auditId ||
    !normalizedEvent.patientId ||
    !normalizedEvent.actorId ||
    !normalizedEvent.actorRole ||
    !normalizedEvent.action ||
    !normalizedEvent.targetType ||
    !normalizedEvent.targetId ||
    !normalizedEvent.outcome ||
    !normalizedEvent.timestamp
  ) {
    return null;
  }

  return normalizedEvent;
}

/**
 * Normalize an audit event collection returned by the chaincode.
 *
 * @param {Object|Array|string|null} result - Parsed ledger payload.
 * @returns {Array<Object>} Simplified audit event array.
 */
function normalizeAuditEvents(result) {
  if (!result) {
    return [];
  }

  let events = [];

  if (Array.isArray(result)) {
    events = result;
  } else if (Array.isArray(result.auditEvents)) {
    events = result.auditEvents;
  } else if (Array.isArray(result.events)) {
    events = result.events;
  } else if (Array.isArray(result.data)) {
    events = result.data;
  } else {
    events = [result];
  }

  return events
    .map((event) => normalizeAuditEvent(event))
    .filter(Boolean);
}

module.exports = {
  getRecordIdentifier,
  parseFabricResult,
  normalizePatientRecordIndexes,
  normalizeClinicalRecordIndex,
  normalizeAuditEvents,
};
