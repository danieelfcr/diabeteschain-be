/**
 * Temporary authentication middleware used to inject a request user context
 * during the architecture and endpoint scaffolding phase.
 *
 * This middleware is intentionally minimal and should be replaced by the real
 * authentication implementation once token or session validation is available.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next callback.
 * @returns {void}
 */
module.exports = (req, res, next) => {
  if (!req.user) {
    // Header-based user injection keeps the new routes testable without
    // coupling the scaffolding effort to the final authentication design.
    req.user = {
      id: req.headers['x-user-id'] || null,
      pseudo_id: req.headers['x-user-pseudo-id'] || null,
      role: req.headers['x-user-role'] || null,
    };
  }

  next();
};
