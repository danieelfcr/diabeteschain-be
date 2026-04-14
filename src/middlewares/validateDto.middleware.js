/**
 * Build a middleware that validates the request body with a DTO class.
 *
 * The validated DTO instance is attached to req.validatedBody so downstream
 * layers can rely on a normalized payload instead of the raw body.
 *
 * @param {Object} DtoClass - DTO class exposing a static from(payload) method.
 * @returns {import('express').RequestHandler} Express middleware.
 */
module.exports = (DtoClass) => (req, res, next) => {
  try {
    req.validatedBody = DtoClass.from(req.body);
    next();
  } catch (error) {
    next(error);
  }
};
