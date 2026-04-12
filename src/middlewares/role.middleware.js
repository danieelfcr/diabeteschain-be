/**
 * Build a role-based authorization middleware.
 *
 * The middleware expects a user context to be present in the request and
 * rejects requests whose role is not part of the allowed set.
 *
 * @param {...string} allowedRoles - Roles authorized to access the route.
 * @returns {import('express').RequestHandler} Express middleware function.
 */
module.exports = (...allowedRoles) => (req, res, next) => {
  if (!allowedRoles.length) {
    return next();
  }

  // Support both plain string roles and nested role objects to remain
  // compatible with the current identity shape.
  const role = req.user?.role?.name || req.user?.role || null;

  if (!role) {
    return res.status(401).json({ error: 'Authentication role is required' });
  }

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ error: 'Forbidden for current role' });
  }

  return next();
};
