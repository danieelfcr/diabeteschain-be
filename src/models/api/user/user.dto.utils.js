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
 * Ensure a normalized string has an accepted length.
 *
 * @param {string} value - Normalized string to validate.
 * @param {string} fieldName - Field name for error messages.
 * @param {Object} options - Validation options.
 * @param {number} [options.min] - Minimum accepted length.
 * @param {number} [options.max] - Maximum accepted length.
 * @returns {string} The original string when length is valid.
 * @throws {Error} When the length is outside the accepted range.
 */
function ensureStringLength(value, fieldName, options = {}) {
  const { min, max } = options;

  if (typeof min === 'number' && value.length < min) {
    throw createAppError(`Field ${fieldName} must be at least ${min} characters`, 400);
  }

  if (typeof max === 'number' && value.length > max) {
    throw createAppError(`Field ${fieldName} must be at most ${max} characters`, 400);
  }

  return value;
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

/**
 * Ensure a field is a valid date-only value.
 *
 * @param {*} value - Value to validate.
 * @param {string} fieldName - Field name for error messages.
 * @returns {string} Normalized date in YYYY-MM-DD format.
 * @throws {Error} When the value is missing or not a real date.
 */
function ensureDateOnlyString(value, fieldName) {
  const normalizedValue = ensureNonEmptyString(value, fieldName);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue);

  if (!match) {
    throw createAppError(`Field ${fieldName} must use YYYY-MM-DD date format`, 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw createAppError(`Field ${fieldName} must be a valid date`, 400);
  }

  return normalizedValue;
}

module.exports = {
  ensureRequired,
  ensureNonEmptyString,
  ensureStringLength,
  ensureOptionalString,
  ensureDateOnlyString,
};
