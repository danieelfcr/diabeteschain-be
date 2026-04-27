/**
 * Builds a middleware that logs each completed HTTP request with its response
 * status code and duration.
 *
 * @param {Object} options - Logger options.
 * @param {Console|Object} options.logger - Target logger implementation.
 * @param {boolean} options.enabled - Whether request logging should run.
 * @returns {import('express').RequestHandler}
 */
function createRequestLogger({
  logger = console,
  enabled = process.env.REQUEST_LOGGER_ENABLED !== 'false' && process.env.NODE_ENV !== 'test',
} = {}) {
  return (req, res, next) => {
    if (!enabled) {
      return next();
    }

    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
      const message = [
        `[HTTP] ${new Date().toISOString()}`,
        req.method,
        req.originalUrl || req.url,
        '->',
        res.statusCode,
        `(${durationMs.toFixed(1)} ms)`,
      ].join(' ');

      if (res.statusCode >= 500 && typeof logger.error === 'function') {
        logger.error(message);
        return;
      }

      if (res.statusCode >= 400 && typeof logger.warn === 'function') {
        logger.warn(message);
        return;
      }

      if (typeof logger.log === 'function') {
        logger.log(message);
      }
    });

    return next();
  };
}

module.exports = createRequestLogger();
module.exports.createRequestLogger = createRequestLogger;
