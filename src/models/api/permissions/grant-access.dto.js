/**
 * Data transfer object for access grant requests.
 *
 * It centralizes payload validation and normalization for the grant access
 * use case before the request reaches the controller/service layer.
 */
const { createAppError } = require('../../../utils/app-error');

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSerializedCapsule(value, fieldName) {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      throw createAppError(`Field ${fieldName} must not be empty`, 400);
    }

    return normalized;
  }

  if (isPlainObject(value)) {
    const format = typeof value.format === 'string' ? value.format.trim() : null;
    const materialValue = typeof value.value === 'string' ? value.value.trim() : value.value;

    if (!format || materialValue === undefined || materialValue === null || materialValue === '') {
      throw createAppError(`Field ${fieldName} must include format and value`, 400);
    }

    return {
      ...value,
      format,
      value: materialValue,
    };
  }

  throw createAppError(`Field ${fieldName} must be a base64 string or { format, value } object`, 400);
}

function normalizeCapsuleByScope(value) {
  if (!isPlainObject(value)) {
    throw createAppError('Field capsuleByScope must be an object keyed by scopeId', 400);
  }

  return Object.entries(value).reduce((normalized, [scopeId, capsule]) => {
    if (!scopeId || !String(scopeId).trim()) {
      throw createAppError('Field capsuleByScope contains an empty scopeId', 400);
    }

    normalized[String(scopeId).trim()] = normalizeSerializedCapsule(
      capsule,
      `capsuleByScope.${scopeId}`
    );
    return normalized;
  }, {});
}

class GrantAccessDTO {
  /**
   * Build a DTO from the raw request payload.
   *
   * @param {Object} payload - Request payload received from the client.
   */
  constructor(payload = {}) {
    this.professionalId = payload.professionalId;
    this.allowedScopes = payload.allowedScopes;
    this.allowedActions = payload.allowedActions;
    this.validFrom = payload.validFrom;
    this.validTo = payload.validTo;
    this.signature = payload.signature;
    this.kfrags = payload.kfrags;
    this.enc_k_scope = payload.enc_k_scope || payload.encKScope;
    this.enc_k_scope_by_scope = payload.enc_k_scope_by_scope || payload.encKScopeByScope;
    this.capsuleByScope = payload.capsuleByScope;
  }

  /**
   * Validate that the payload contains the minimum fields required by the
   * grant access flow.
   *
   * @throws {Error} When any required field is missing.
   */
  validate() {
    const requiredFields = [
      'professionalId',
      'allowedScopes',
      'allowedActions',
      'validFrom',
      'validTo',
      'signature',
      'kfrags',
      'capsuleByScope',
    ];

    for (const field of requiredFields) {
      if (!this[field]) {
        throw createAppError(`Missing required field: ${field}`, 400);
      }
    }

    this.capsuleByScope = normalizeCapsuleByScope(this.capsuleByScope);

    if (Array.isArray(this.allowedScopes)) {
      const missingCapsuleScopes = this.allowedScopes
        .filter(Boolean)
        .filter((scopeId) => !this.capsuleByScope[scopeId]);

      if (missingCapsuleScopes.length > 0) {
        throw createAppError(
          `Missing capsuleByScope entries for scopes: ${missingCapsuleScopes.join(', ')}`,
          400,
          'pre_scope_material_capsule_missing'
        );
      }
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
