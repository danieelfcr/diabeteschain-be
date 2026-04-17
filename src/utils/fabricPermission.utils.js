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

  const resultText = resultBytes.toString();

  try {
    return JSON.parse(resultText);
  } catch (error) {
    return resultText;
  }
}

/**
 * Normalize active permission query responses from the ledger.
 *
 * @param {Object|Array|string|null} result - Parsed ledger payload.
 * @returns {Object|string|null} Active permission payload.
 */
function normalizeActivePermission(result) {
  if (!result) {
    return null;
  }

  if (Array.isArray(result)) {
    return result[0] || null;
  }

  if (typeof result === 'string') {
    if (/not found|does not exist|no active/i.test(result)) {
      return null;
    }

    return result;
  }

  if (result.permission) {
    return result.permission;
  }

  if (result.data) {
    return result.data;
  }

  if (result.result) {
    return result.result;
  }

  return result;
}

/**
 * Normalize active permission query responses into an array.
 *
 * @param {Object|Array|string|null} result - Parsed ledger payload.
 * @returns {Array<Object>} Active permission list.
 */
function normalizeActivePermissions(result) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result.filter(Boolean);
  }

  if (typeof result === 'string') {
    if (/not found|does not exist|no active/i.test(result)) {
      return [];
    }

    return [];
  }

  if (Array.isArray(result.permissions)) {
    return result.permissions.filter(Boolean);
  }

  if (Array.isArray(result.data)) {
    return result.data.filter(Boolean);
  }

  if (Array.isArray(result.results)) {
    return result.results.filter(Boolean);
  }

  return [result].filter(Boolean);
}

/**
 * Normalize scope material query responses into an array.
 *
 * @param {Object|Array|string|null} result - Parsed ledger payload.
 * @returns {Array<Object>} Scope material list.
 */
function normalizeScopeMaterials(result) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result.filter(Boolean);
  }

  if (typeof result === 'string') {
    return [];
  }

  if (Array.isArray(result.scopeMaterials)) {
    return result.scopeMaterials.filter(Boolean);
  }

  if (Array.isArray(result.data)) {
    return result.data.filter(Boolean);
  }

  if (Array.isArray(result.results)) {
    return result.results.filter(Boolean);
  }

  return [result].filter(Boolean);
}

module.exports = {
  parseFabricResult,
  normalizeActivePermission,
  normalizeActivePermissions,
  normalizeScopeMaterials,
};
