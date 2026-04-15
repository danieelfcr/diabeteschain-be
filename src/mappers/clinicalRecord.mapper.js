/**
 * Normalize ledger reference metadata for frontend consumption.
 *
 * @param {Object|null|undefined} reference - Ledger reference payload.
 * @returns {Object|null} Sanitized reference metadata.
 */
function mapReferenceMetadata(reference) {
  if (!reference) {
    return null;
  }

  return {
    docType: reference.docType || null,
    recordId: reference.recordId || null,
    patientId: reference.patientId || null,
    encounterId: reference.encounterId || null,
    scopeId: reference.scopeId || null,
    recordType: reference.recordType || null,
    offchainUri: reference.offchainUri || null,
    hash: reference.hash || null,
    createdBy: reference.createdBy || null,
    authorRole: reference.authorRole || null,
    status: reference.status || null,
    createdAt: reference.createdAt || null,
    updatedAt: reference.updatedAt || null,
  };
}

/**
 * Normalize clinical record documents for the API response.
 *
 * @param {Object} record - Off-chain clinical record document.
 * @param {Object|null} reference - Matching ledger reference when available.
 * @returns {Object} Normalized API record item.
 */
function mapClinicalRecord(record, reference = null) {
  return {
    recordId: record.recordId || null,
    patientId: record.patientPseudoId || null,
    scopeId: record.scopeId || null,
    scope: record.scopeId || null,
    recordType: record.recordType || null,
    encounterId: record.encounterId || null,
    relationships: record.relationships || null,
    payloadMetadata: record.payloadMetadata || null,
    encryption: record.encryption || null,
    integrity: record.integrity || null,
    source: {
      reference: mapReferenceMetadata(reference),
    },
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null,
  };
}

module.exports = {
  mapReferenceMetadata,
  mapClinicalRecord,
};
