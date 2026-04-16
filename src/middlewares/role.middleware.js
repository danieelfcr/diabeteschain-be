const { createAppError } = require('../utils/app-error');

/**
 * Resolve a normalized role name from the authenticated request user.
 *
 * The JWT flow currently maps the role as a string, but the middleware also
 * accepts object-shaped roles so the route layer remains compatible with
 * alternative identity sources used in development or future refactors.
 *
 * @param {Object|null|undefined} user - Authenticated request user.
 * @returns {string|null} Normalized role name.
 */
function resolveRoleName(user) {
  const source = user?.role ?? user?.role?.name ?? null;

  if (!source) {
    return null;
  }

  if (typeof source === 'string') {
    return source.trim().toUpperCase() || null;
  }

  if (typeof source === 'object') {
    const nestedRole = source.name || source.role || source.value || null;

    if (typeof nestedRole === 'string') {
      return nestedRole.trim().toUpperCase() || null;
    }
  }

  return null;
}

/**
 * Build a role-based authorization middleware.
 *
 * Security policy:
 * 1. Authentication populates req.user from JWT.
 * 2. Route guards enforce coarse-grained role authorization.
 * 3. Services/orchestration still perform semantic permission validation.
 *
 * @param {...string} allowedRoles - Roles authorized to access the route.
 * @returns {import('express').RequestHandler} Express middleware function.
 */
function authorizeRoles(...allowedRoles) {
  const normalizedAllowedRoles = allowedRoles
    .filter((role) => typeof role === 'string' && role.trim())
    .map((role) => role.trim().toUpperCase());

  return (req, res, next) => {
    if (!normalizedAllowedRoles.length) {
      return next();
    }

    if (!req.user) {
      return next(createAppError('Authentication required', 401, 'AUTH_ERROR'));
    }

    const role = resolveRoleName(req.user);

    if (!role) {
      return next(createAppError('Authentication role is required', 401, 'AUTH_ERROR'));
    }

    if (!normalizedAllowedRoles.includes(role)) {
      return next(createAppError('Forbidden for current role', 403, 'AUTH_ERROR'));
    }

    return next();
  };
}

authorizeRoles.resolveRoleName = resolveRoleName;

module.exports = authorizeRoles;
