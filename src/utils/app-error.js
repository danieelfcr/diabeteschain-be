/**
 * Create an application error enriched with HTTP response metadata.
 *
 * @param {string} message - Error message intended for the API response.
 * @param {number} [statusCode=500] - HTTP status code associated with the error.
 * @param {string|null} [code=null] - Optional internal application error code.
 * @returns {Error} Error instance extended with statusCode and optional code.
 */
function createAppError(message, statusCode = 500, code = null) {
  const error = new Error(message);
  error.statusCode = statusCode;

  if (code) {
    error.code = code;
  }

  return error;
}

module.exports = {
  createAppError,
};
