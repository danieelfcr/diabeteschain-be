const { createAppError } = require('../../../utils/app-error');

/**
 * Ensure a field is present in the payload.
 *
 * @param {*} value - Value to validate.
 * @param {string} fieldName - Field name for error messages.
 * @returns {*} The original value when present.
 * @throws {Error} When the value is missing.
 */
function ensureRequired(value, fieldName) {
  if (value === undefined || value === null) {
    throw createAppError(`Missing required field: ${fieldName}`, 400);
  }

  return value;
}

/**
 * Ensure a field is a non-empty string.
 *
 * @param {*} value - Value to validate.
 * @param {string} fieldName - Field name for error messages.
 * @param {Object} [options] - Validation options.
 * @param {boolean} [options.trim=true] - Whether to trim the string.
 * @returns {string} Normalized string.
 * @throws {Error} When the value is not a valid string.
 */
function ensureNonEmptyString(value, fieldName, options = {}) {
  const { trim = true } = options;

  ensureRequired(value, fieldName);

  if (typeof value !== 'string') {
    throw createAppError(`Field ${fieldName} must be a string`, 400);
  }

  const normalizedValue = trim ? value.trim() : value;

  if (!normalizedValue) {
    throw createAppError(`Field ${fieldName} cannot be empty`, 400);
  }

  return normalizedValue;
}

/**
 * Normalize an optional string field.
 *
 * @param {*} value - Value to validate.
 * @param {string} fieldName - Field name for error messages.
 * @param {Object} [options] - Validation options.
 * @param {boolean} [options.trim=true] - Whether to trim the string.
 * @returns {string|null} Normalized string or null when omitted/empty.
 * @throws {Error} When the value is not a string.
 */
function ensureOptionalString(value, fieldName, options = {}) {
  const { trim = true } = options;

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw createAppError(`Field ${fieldName} must be a string`, 400);
  }

  const normalizedValue = trim ? value.trim() : value;
  return normalizedValue || null;
}

module.exports = {
  ensureRequired,
  ensureNonEmptyString,
  ensureOptionalString,
};
