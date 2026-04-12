module.exports = (...allowedRoles) => (req, res, next) => {
  if (!allowedRoles.length) {
    return next();
  }

  const role = req.user?.role?.name || req.user?.role || null;

  if (!role) {
    return res.status(401).json({ error: 'Authentication role is required' });
  }

  if (!allowedRoles.includes(role)) {
    return res.status(403).json({ error: 'Forbidden for current role' });
  }

  return next();
};
