const { createAppError } = require('./app-error');

/**
 * Validate permission validity period semantics.
 *
 * @param {string} validFrom - Start date of the permission validity period.
 * @param {string} validTo - End date of the permission validity period.
 * @throws {Error} When the dates are invalid or out of order.
 */
function validatePermissionDates(validFrom, validTo) {
  const from = new Date(validFrom);
  const to = new Date(validTo);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw createAppError('Invalid permission dates', 400);
  }

  if (from >= to) {
    throw createAppError('validFrom must be earlier than validTo', 400);
  }
}

/**
 * Validate that the requested actions and scopes are supported.
 *
 * @param {string[]} actions - List of actions to validate.
 * @param {string[]} scopes - List of scopes to validate.
 * @throws {Error} When any action or scope is invalid.
 */
function validateActionsAndScopes(actions, scopes) {
  const allowedActions = ['read', 'write'];
  const allowedScopes = ['summary', 'labs', 'prescriptions', 'encounters'];

  const invalidActions = actions.filter((action) => !allowedActions.includes(action));
  const invalidScopes = scopes.filter((scope) => !allowedScopes.includes(scope));

  if (invalidActions.length > 0) {
    throw createAppError(`Invalid actions: ${invalidActions.join(', ')}`, 400);
  }

  if (invalidScopes.length > 0) {
    throw createAppError(`Invalid scopes: ${invalidScopes.join(', ')}`, 400);
  }
}

module.exports = {
  validatePermissionDates,
  validateActionsAndScopes,
};
