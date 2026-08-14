/**
 * Centralized Express error middleware.
 *
 * The middleware converts application errors into a normalized JSON response
 * while preserving explicit status codes when available.
 *
 * @param {Error} error - Error captured by Express.
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next callback.
 * @returns {import('express').Response|void}
 */
module.exports = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  // Unhandled errors default to the standard internal server error status.
  const statusCode = error.statusCode || 500;
  return res.status(statusCode).json({
    error: translateErrorMessage(error.message || '', statusCode),
  });
};
const { translateErrorMessage } = require('../utils/errorMessageTranslator');
