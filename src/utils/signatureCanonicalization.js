const { createAppError } = require('./app-error');

/**
 * Check whether a value is a plain JSON-like object.
 *
 * @param {*} value - Value to inspect.
 * @returns {boolean} True when the value is a plain object.
 */
function isPlainObject(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Normalize and validate an ISO 8601 datetime string.
 *
 * Signed date fields must be explicit datetimes with timezone information to
 * avoid locale-dependent interpretations.
 *
 * @param {string} value - Raw datetime string.
 * @param {string} fieldName - Field name used in validation errors.
 * @returns {string} Normalized ISO datetime string in UTC.
 */
function normalizeIsoDateString(value, fieldName) {
  if (typeof value !== 'string') {
    throw createAppError(`Field ${fieldName} must be an ISO 8601 string`, 400);
  }

  const trimmedValue = value.trim();
  const isoDateTimePattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

  if (!isoDateTimePattern.test(trimmedValue)) {
    throw createAppError(
      `Field ${fieldName} must use ISO 8601 datetime format with timezone`,
      400
    );
  }

  const normalizedDate = new Date(trimmedValue);

  if (Number.isNaN(normalizedDate.getTime())) {
    throw createAppError(`Field ${fieldName} is not a valid ISO 8601 datetime`, 400);
  }

  return normalizedDate.toISOString();
}

/**
 * Normalize a string array and optionally sort it when the array has set
 * semantics for signature purposes.
 *
 * @param {*} values - Candidate array value.
 * @param {Object} options - Normalization options.
 * @param {string} options.fieldName - Field name for validation errors.
 * @param {boolean} [options.sortValues=false] - Whether to sort the array.
 * @returns {string[]} Normalized array.
 */
function normalizeStringArray(values, { fieldName, sortValues = false }) {
  if (!Array.isArray(values) || values.length === 0) {
    throw createAppError(`Field ${fieldName} must be a non-empty array`, 400);
  }

  const normalizedValues = values.map((value, index) => {
    if (typeof value !== 'string') {
      throw createAppError(`Field ${fieldName}[${index}] must be a string`, 400);
    }

    const normalizedValue = value.trim();
    if (!normalizedValue) {
      throw createAppError(`Field ${fieldName}[${index}] cannot be empty`, 400);
    }

    return normalizedValue;
  });

  const uniqueValues = [...new Set(normalizedValues)];

  return sortValues
    ? uniqueValues.sort((left, right) => left.localeCompare(right))
    : uniqueValues;
}

/**
 * Transform any supported JSON value into a deterministic structure suitable
 * for signatures:
 * - object keys are sorted alphabetically
 * - undefined object properties are omitted
 * - array order is preserved
 * - Date values are normalized to ISO 8601 in UTC
 *
 * @param {*} value - Value to canonicalize.
 * @returns {*} Canonical JSON-compatible value.
 */
function canonicalizeForSignature(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Signed payloads cannot contain non-finite numbers');
    }

    return value;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError('Signed payloads cannot contain invalid Date values');
    }

    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (entry === undefined) {
        throw new TypeError('Signed payload arrays cannot contain undefined values');
      }

      return canonicalizeForSignature(entry);
    });
  }

  if (isPlainObject(value)) {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce((accumulator, key) => {
        const canonicalValue = canonicalizeForSignature(value[key]);

        if (canonicalValue !== undefined) {
          accumulator[key] = canonicalValue;
        }

        return accumulator;
      }, {});
  }

  throw new TypeError(`Unsupported value type in signed payload: ${typeof value}`);
}

/**
 * Serialize a payload to the exact deterministic UTF-8 string that must be
 * signed or verified by clients and backend.
 *
 * @param {*} value - Structured payload to serialize.
 * @returns {string} Canonical JSON string.
 */
function serializeCanonicalPayload(value) {
  return JSON.stringify(canonicalizeForSignature(value));
}

module.exports = {
  canonicalizeForSignature,
  serializeCanonicalPayload,
  normalizeIsoDateString,
  normalizeStringArray,
};
