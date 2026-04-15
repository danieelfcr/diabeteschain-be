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
    allowedScopes: normalizeArray(permission.allowedScopes),
    allowedActions: normalizeArray(permission.allowedActions),
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
      patientId: entry.patientId || entry.scopeMaterial?.patientId || null,
      scopeId: entry.scopeId || entry.scopeMaterial?.scopeId || null,
      scopeMaterial: entry.scopeMaterial
        ? {
            docType: entry.scopeMaterial.docType || null,
            scopeMaterialId: entry.scopeMaterial.scopeMaterialId || entry.scopeMaterial.id || null,
            patientId: entry.scopeMaterial.patientId || null,
            scopeId: entry.scopeMaterial.scopeId || null,
            encKScope: entry.scopeMaterial.enc_k_scope || entry.scopeMaterial.encKScope || null,
            proxyIds: normalizeArray(entry.scopeMaterial.proxyIds),
            version: entry.scopeMaterial.version || null,
            status: entry.scopeMaterial.status || null,
            createdAt: entry.scopeMaterial.createdAt || null,
          }
        : null,
    }))
    .filter((entry) => entry.permissionId && entry.scopeId && entry.scopeMaterial);
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

module.exports = {
  normalizeArray,
  getRecordIdentifier,
  normalizePermission,
  normalizePermissions,
  normalizeScopeMaterials,
  isPermissionActive,
  getEffectiveScopes,
  filterScopeMaterialsByScopes,
  filterReferencesByScopes,
};
