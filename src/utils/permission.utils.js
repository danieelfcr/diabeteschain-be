const { createAppError } = require('./app-error');
const {
  normalizePermissionValidityPeriod,
  normalizePermissionSignatureCollections,
} = require('./signaturePayload.utils');

/**
 * Validate permission validity period semantics.
 *
 * @param {string} validFrom - Start date of the permission validity period.
 * @param {string} validTo - End date of the permission validity period.
 * @throws {Error} When the dates are invalid or out of order.
 */
function validatePermissionDates(validFrom, validTo) {
  const normalizedPeriod = normalizePermissionValidityPeriod({ validFrom, validTo });
  const from = new Date(normalizedPeriod.validFrom);
  const to = new Date(normalizedPeriod.validTo);

  if (from >= to) {
    throw createAppError('validFrom must be earlier than validTo', 400);
  }

  return normalizedPeriod;
}

/**
 * Validate that the requested actions are supported and normalize the scope
 * collection shape for downstream catalog validation.
 *
 * @param {string[]} actions - List of actions to validate.
 * @param {string[]} scopes - List of scopes to validate.
 * @throws {Error} When any action or scope is invalid.
 */
function validateActionsAndScopes(actions, scopes) {
  const allowedActions = ['read', 'write'];
  const normalizedCollections = normalizePermissionSignatureCollections({
    allowedActions: actions,
    allowedScopes: scopes,
  });
  const normalizedActions = normalizedCollections.allowedActions.map((action) => action.toLowerCase());

  const invalidActions = normalizedActions.filter(
    (action) => !allowedActions.includes(action)
  );
  if (invalidActions.length > 0) {
    throw createAppError(`Invalid actions: ${invalidActions.join(', ')}`, 400);
  }

  if (normalizedActions.includes('write') && !normalizedActions.includes('read')) {
    throw createAppError('Write access must include read access', 400);
  }

  return {
    allowedActions: normalizedActions,
    allowedScopes: normalizedCollections.allowedScopes,
  };
}

module.exports = {
  validatePermissionDates,
  validateActionsAndScopes,
};
