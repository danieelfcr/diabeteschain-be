const { createAppError } = require('../../../utils/app-error');
const { ensureNonEmptyString } = require('../user/user.dto.utils');

function normalizeOptionalString(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return ensureNonEmptyString(value, fieldName);
}

function normalizeOptionalObject(value, fieldName) {
  if (value === undefined || value === null) {
    return {};
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createAppError(`Field ${fieldName} must be an object`, 400);
  }

  return value;
}

function normalizeTransformKeys(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw createAppError('Missing required field: transformKeys', 400);
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw createAppError(`Field transformKeys[${index}] must be an object`, 400);
    }

    return {
      scopeId: ensureNonEmptyString(entry.scopeId, `transformKeys[${index}].scopeId`),
      transformKey: ensureNonEmptyString(entry.transformKey, `transformKeys[${index}].transformKey`),
      proxyNodeId: normalizeOptionalString(entry.proxyNodeId, `transformKeys[${index}].proxyNodeId`),
      transformKeyEncoding: entry.transformKeyEncoding || 'base64',
      metadata: normalizeOptionalObject(entry.metadata, `transformKeys[${index}].metadata`),
    };
  });
}

function normalizeScopeMaterials(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createAppError('Field scopeMaterials must be an array', 400);
  }

  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw createAppError(`Field scopeMaterials[${index}] must be an object`, 400);
    }

    return {
      scopeId: ensureNonEmptyString(entry.scopeId, `scopeMaterials[${index}].scopeId`),
      encryptedScopeKey: ensureNonEmptyString(
        entry.encryptedScopeKey || entry.enc_k_scope,
        `scopeMaterials[${index}].encryptedScopeKey`
      ),
      recryptMetadata: normalizeOptionalObject(
        entry.recryptMetadata,
        `scopeMaterials[${index}].recryptMetadata`
      ),
      metadata: normalizeOptionalObject(entry.metadata, `scopeMaterials[${index}].metadata`),
    };
  });
}

class GrantAccessDTO {
  /**
   * Build a DTO from the raw request payload.
   *
   * @param {Object} payload - Request payload received from the client.
   */
  constructor(payload = {}) {
    const permission = payload.permission && typeof payload.permission === 'object'
      ? payload.permission
      : payload;

    this.permissionId = permission.permissionId || payload.permissionId || null;
    this.professionalUsername = permission.professionalUsername || payload.professionalUsername || null;
    this.granteeId = permission.granteeId || payload.granteeId || null;
    this.granteeRole = permission.granteeRole || payload.granteeRole || null;
    this.allowedScopes = permission.allowedScopes || payload.allowedScopes;
    this.allowedActions = permission.allowedActions || payload.allowedActions;
    this.validFrom = permission.validFrom || payload.validFrom;
    this.validTo = permission.validTo || payload.validTo;
    this.signature = permission.signature || payload.signature;
    this.transformKeys = payload.transformKeys || permission.transformKeys;
    this.scopeMaterials = payload.scopeMaterials || permission.scopeMaterials;
  }

  /**
   * Validate that the payload contains the minimum fields required by the
   * grant access flow.
   *
   * @throws {Error} When any required field is missing.
   */
  validate() {
    const requiredFields = [
      'allowedScopes',
      'allowedActions',
      'validFrom',
      'validTo',
      'signature',
    ];

    for (const field of requiredFields) {
      if (!this[field]) {
        throw createAppError(`Missing required field: ${field}`, 400);
      }
    }

    if (!this.professionalUsername && !this.granteeId) {
      throw createAppError('Missing required field: granteeId or professionalUsername', 400);
    }

    this.professionalUsername = normalizeOptionalString(this.professionalUsername, 'professionalUsername');
    this.granteeId = normalizeOptionalString(this.granteeId, 'granteeId');
    this.granteeRole = normalizeOptionalString(this.granteeRole, 'granteeRole');
    this.transformKeys = normalizeTransformKeys(this.transformKeys);
    this.scopeMaterials = normalizeScopeMaterials(this.scopeMaterials);

    const allowedScopes = Array.isArray(this.allowedScopes)
      ? this.allowedScopes.map((scopeId) => String(scopeId || '').trim()).filter(Boolean)
      : [];

    if (allowedScopes.length === 0) {
      throw createAppError('Field allowedScopes must include at least one scope', 400);
    }

    const transformKeyScopes = new Set(this.transformKeys.map((entry) => entry.scopeId));
    const missingScopes = allowedScopes.filter((scopeId) => !transformKeyScopes.has(scopeId));

    if (missingScopes.length > 0) {
      throw createAppError('A transformKey is required for each allowed scope', 400);
    }
  }

  /**
   * Build and validate a DTO instance from a raw payload.
   *
   * @param {Object} payload - Request payload received from the client.
   * @returns {GrantAccessDTO} Validated DTO instance.
   */
  static from(payload) {
    const dto = new GrantAccessDTO(payload);
    dto.validate();
    return dto;
  }
}

module.exports = GrantAccessDTO;
