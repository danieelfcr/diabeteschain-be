const crypto = require('crypto');
const { createAppError } = require('./app-error');
const {
  normalizeAccessRecordType,
  normalizeRecordTypeList,
} = require('./clinicalAccessPolicy.utils');

/**
 * Normalize any scalar or array-like value into a clean array.
 *
 * @param {*} value - Value to normalize.
 * @returns {Array} Normalized array.
 */
function normalizeArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

/**
 * Extract a stable clinical record identifier from references or documents.
 *
 * @param {Object|null|undefined} source - Record or reference source.
 * @returns {string|null} Record identifier.
 */
function getRecordIdentifier(source) {
  if (!source) {
    return null;
  }

  return source.recordId || source.clinicalRecordId || source.documentId || source._id || source.id || null;
}

/**
 * Normalize a single permission payload into a predictable shape.
 *
 * @param {Object|string|null|undefined} permission - Raw permission payload.
 * @returns {Object|null} Normalized permission or null.
 */
function normalizePermission(permission) {
  if (!permission || typeof permission === 'string') {
    return null;
  }

  return {
    permissionId: permission.permissionId || permission.id || null,
    granteeRole: permission.granteeRole || null,
    allowedScopes: normalizeArray(permission.allowedScopes),
    allowedActions: normalizeArray(permission.allowedActions),
    allowedReadRecordTypes: normalizeRecordTypeList(permission.allowedReadRecordTypes),
    allowedWriteRecordTypes: normalizeRecordTypeList(permission.allowedWriteRecordTypes),
    validFrom: permission.validFrom || null,
    validTo: permission.validTo || null,
    status: permission.status || permission.permissionStatus || null,
  };
}

/**
 * Normalize one or many permissions into a list.
 *
 * @param {Object|Array|null|undefined} permissions - Raw permission payload.
 * @returns {Array<Object>} Normalized permission list.
 */
function normalizePermissions(permissions) {
  return normalizeArray(permissions)
    .map((permission) => normalizePermission(permission))
    .filter(Boolean);
}

/**
 * Normalize delegated scope material entries returned by the ledger.
 *
 * @param {Array<Object>} scopeMaterials - Raw scope material entries.
 * @returns {Array<Object>} Normalized scope materials.
 */
function normalizeScopeMaterials(scopeMaterials = []) {
  return scopeMaterials
    .map((entry) => ({
      permissionId: entry.permissionId || null,
      patientPseudoId: entry.patientPseudoId || entry.scopeMaterial?.patientPseudoId || entry.patientId || entry.scopeMaterial?.patientId || null,
      scopeId: entry.scopeId || entry.scopeMaterial?.scopeId || null,
      scopeMaterial: entry.scopeMaterial
        ? {
            docType: entry.scopeMaterial.docType || null,
            scopeMaterialId: entry.scopeMaterial.scopeMaterialId || entry.scopeMaterial.id || null,
            patientPseudoId: entry.scopeMaterial.patientPseudoId || entry.scopeMaterial.patientId || null,
            scopeId: entry.scopeMaterial.scopeId || null,
            encryptedScopeKey: entry.scopeMaterial.encryptedScopeKey
              || entry.scopeMaterial.enc_k_scope
              || entry.scopeMaterial.encKScope
              || null,
            encryptedScopeKeyEncoding: entry.scopeMaterial.encryptedScopeKeyEncoding
              || entry.scopeMaterial.metadata?.encryptedScopeKeyEncoding
              || null,
            proxyIds: normalizeArray(entry.scopeMaterial.proxyIds),
            version: entry.scopeMaterial.version || null,
            status: entry.scopeMaterial.status || null,
            createdAt: entry.scopeMaterial.createdAt || null,
            metadata: entry.scopeMaterial.metadata || null,
          }
        : normalizeScopeMaterial(entry),
    }))
    .filter((entry) => entry.scopeId && entry.scopeMaterial);
}

/**
 * Normalize one direct scope material returned by Fabric.
 *
 * @param {Object|null|undefined} material - Raw scope material.
 * @returns {Object|null} Normalized scope material.
 */
function normalizeScopeMaterial(material) {
  if (!material || typeof material !== 'object' || Array.isArray(material)) {
    return null;
  }

  return {
    docType: material.docType || null,
    scopeMaterialId: material.scopeMaterialId || material.id || null,
    patientPseudoId: material.patientPseudoId || material.patientId || null,
    scopeId: material.scopeId || null,
    encryptedScopeKey: material.encryptedScopeKey || material.enc_k_scope || material.encKScope || null,
    encryptedScopeKeyEncoding: material.encryptedScopeKeyEncoding || material.metadata?.encryptedScopeKeyEncoding || null,
    proxyIds: normalizeArray(material.proxyIds),
    version: material.version || null,
    status: material.status || null,
    createdAt: material.createdAt || null,
    metadata: material.metadata || null,
  };
}

/**
 * Determine whether a permission is currently active and valid.
 *
 * @param {Object|null} permission - Normalized permission payload.
 * @returns {boolean} True when the permission is usable.
 */
function isPermissionActive(permission) {
  if (!permission) {
    return false;
  }

  if (permission.status && permission.status.toUpperCase() !== 'ACTIVE') {
    return false;
  }

  const now = new Date();

  if (permission.validFrom) {
    const validFrom = new Date(permission.validFrom);
    if (!Number.isNaN(validFrom.getTime()) && now < validFrom) {
      return false;
    }
  }

  if (permission.validTo) {
    const validTo = new Date(permission.validTo);
    if (!Number.isNaN(validTo.getTime()) && now > validTo) {
      return false;
    }
  }

  return true;
}

/**
 * Collect a unique list of readable scopes from active permissions.
 *
 * @param {Array<Object>} permissions - Normalized permission list.
 * @returns {string[]} Unique scope list.
 */
function getEffectiveScopes(permissions = []) {
  return [...new Set(
    permissions.flatMap((permission) => normalizeArray(permission.allowedScopes))
  )];
}

/**
 * Keep only active scope materials that belong to the effective scopes.
 *
 * @param {Array<Object>} scopeMaterials - Normalized scope materials.
 * @param {string[]} effectiveScopes - Authorized scopes.
 * @returns {Array<Object>} Filtered scope materials.
 */
function filterScopeMaterialsByScopes(scopeMaterials = [], effectiveScopes = []) {
  if (effectiveScopes.length === 0) {
    return [];
  }

  return scopeMaterials.filter((entry) => {
    const materialStatus = entry.scopeMaterial?.status?.toUpperCase() || null;
    return effectiveScopes.includes(entry.scopeId) && (!materialStatus || materialStatus === 'ACTIVE');
  });
}

/**
 * Keep only references that belong to the effective scopes.
 *
 * @param {Array<Object>} references - Ledger references.
 * @param {string[]} effectiveScopes - Authorized scopes.
 * @returns {Array<Object>} Filtered references.
 */
function filterReferencesByScopes(references = [], effectiveScopes = []) {
  if (effectiveScopes.length === 0) {
    return [];
  }

  return references.filter((reference) => {
    const scopeId = reference.scopeId || reference.scope || null;
    return effectiveScopes.includes(scopeId);
  });
}

/**
 * Keep only references that belong to the effective clinical record types.
 *
 * @param {Array<Object>} references - Ledger references.
 * @param {string[]} effectiveRecordTypes - Authorized record types.
 * @returns {Array<Object>} Filtered references.
 */
function filterReferencesByRecordTypes(references = [], effectiveRecordTypes = []) {
  const normalizedRecordTypes = normalizeRecordTypeList(effectiveRecordTypes);
  if (normalizedRecordTypes.length === 0) {
    return [];
  }

  return references.filter((reference) => {
    const recordType = normalizeAccessRecordType(reference.recordType || reference.type || null);
    return normalizedRecordTypes.includes(recordType);
  });
}

/**
 * Normalize a chaincode record type into the persistence enum format.
 *
 * @param {string|null|undefined} value - Record type to normalize.
 * @returns {string|null} Normalized record type.
 */
function normalizeRecordType(value) {
  if (!value) {
    return null;
  }

  return String(value).trim().replace(/[\s-]+/g, '_').toUpperCase();
}

/**
 * Map a professional role into the lower-case value expected by the ledger index.
 *
 * @param {string|null|undefined} role - Healthcare professional role.
 * @returns {string|null} Ledger author role.
 */
function getLedgerAuthorRole(role) {
  const normalizedRole = role ? String(role).trim().toUpperCase() : null;

  if (!normalizedRole) {
    return null;
  }

  const authorRoleMap = {
    DOCTOR: 'doctor',
    LABORATORY: 'laboratory',
    PHARMACIST: 'pharmacist',
  };

  return authorRoleMap[normalizedRole] || normalizedRole.toLowerCase();
}

/**
 * Convert persistence model instances into plain objects.
 *
 * @param {Object} source - Record source.
 * @returns {Object} Plain object representation.
 */
function toPlainObject(source) {
  if (!source) {
    return source;
  }

  if (typeof source.toJSON === 'function') {
    return source.toJSON();
  }

  if (typeof source.toObject === 'function') {
    return source.toObject();
  }

  return source;
}

/**
 * Build the prototype off-chain URI stored in the clinical index.
 *
 * @param {string} recordId - Clinical record identifier.
 * @returns {string} Off-chain URI for the record.
 */
function buildOffchainUri(recordId) {
  return `mongo://clinical-records/${recordId}`;
}

/**
 * Check whether a permission allows a given action.
 *
 * @param {Object|null} permission - Normalized permission.
 * @param {string} action - Action to validate.
 * @returns {boolean} True when the action is allowed.
 */
function permissionAllowsAction(permission, action) {
  if (!permission || !action) {
    return false;
  }

  return (permission.allowedActions || [])
    .map((entry) => String(entry).trim().toLowerCase())
    .includes(String(action).trim().toLowerCase());
}

/**
 * Validate that all requested scopes are included in the permission.
 *
 * @param {Object|null} permission - Normalized permission.
 * @param {string[]} requestedScopes - Scopes requested by the operation.
 */
function validateRequestedScopes(permission, requestedScopes = []) {
  const uniqueScopes = [...new Set(requestedScopes.filter(Boolean))];
  if (uniqueScopes.length === 0) {
    throw createAppError('At least one clinical scope is required', 400);
  }

  const allowedScopes = (permission?.allowedScopes || []).filter(Boolean);
  if (allowedScopes.includes('*')) {
    return;
  }

  const unauthorizedScopes = uniqueScopes.filter((scopeId) => !allowedScopes.includes(scopeId));

  if (unauthorizedScopes.length > 0) {
    throw createAppError(
      `Active permission does not allow requested scopes: ${unauthorizedScopes.join(', ')}`,
      403
    );
  }
}

/**
 * Build the record fragment used for request signature verification.
 *
 * @param {Object|null} recordInput - Clinical record payload block.
 * @param {string} recordType - Record type represented by the block.
 * @returns {Object|null} Structured signature fragment.
 */
function buildSignatureRecordPayload(recordInput, recordType) {
  if (!recordInput) {
    return null;
  }

  const payload = {
    recordType,
    scopeId: recordInput.scopeId,
    payloadMetadata: recordInput.payloadMetadata,
    encryption: recordInput.encryption,
    integrity: recordInput.integrity,
  };

  return payload;
}

/**
 * Build the persistence payload for a clinical record document.
 *
 * @param {Object} options - Record build options.
 * @param {string} options.recordId - Generated record identifier.
 * @param {string} options.patientPseudoId - Patient pseudo identifier.
 * @param {string} options.recordType - Clinical record type.
 * @param {Object} options.recordInput - Encrypted clinical record payload.
 * @param {string|null|undefined} options.encounterId - Encounter identifier for linkage.
 * @param {Object} options.relationships - Relationships payload.
 * @returns {Object} Persistence payload for MongoDB.
 */
function buildClinicalRecordDocument({
  recordId,
  patientPseudoId,
  recordType,
  recordInput,
  encounterId,
  relationships = {},
}) {
  return {
    _id: recordId,
    patientPseudoId,
    scopeId: recordInput.scopeId,
    recordType,
    encounterId: encounterId || null,
    relationships: {
      basedOn: relationships.basedOn || null,
      partOf: relationships.partOf || null,
    },
    payloadMetadata: recordInput.payloadMetadata,
    encryption: recordInput.encryption,
    integrity: recordInput.integrity,
  };
}

/**
 * Build the clinical index payload registered in blockchain.
 *
 * @param {Object} options - Index build options.
 * @param {Object} options.record - Persisted clinical record document.
 * @param {Object} options.context - Validated registration context.
 * @returns {Object} Ledger clinical index payload.
 */
function buildClinicalRecordIndex({ record, context }) {
  const createdAt = record.createdAt ? new Date(record.createdAt).toISOString() : new Date().toISOString();

  return {
    recordId: record._id || record.recordId || null,
    patientPseudoId: record.patientPseudoId || context.patientPseudoId,
    encounterId: record.encounterId || null,
    scopeId: record.scopeId || null,
    recordType: String(record.recordType || '').toLowerCase(),
    offchainUri: 'mongo://clinical-records/' + (record._id || record.recordId || ''),
    hash: record.integrity?.payloadHash || null,
    createdAt,
    createdBy: context.professional.id || context.actor.id || null,
    authorRole: context.authorRole,
    status: 'ACTIVE',
    auditId: crypto.randomUUID(),
    timestamp: createdAt,
  };
}

module.exports = {
  normalizeArray,
  getRecordIdentifier,
  normalizePermission,
  normalizePermissions,
  normalizeScopeMaterials,
  normalizeScopeMaterial,
  isPermissionActive,
  getEffectiveScopes,
  filterScopeMaterialsByScopes,
  filterReferencesByScopes,
  filterReferencesByRecordTypes,
  normalizeRecordType,
  getLedgerAuthorRole,
  toPlainObject,
  buildOffchainUri,
  permissionAllowsAction,
  validateRequestedScopes,
  buildSignatureRecordPayload,
  buildClinicalRecordDocument,
  buildClinicalRecordIndex,
};
