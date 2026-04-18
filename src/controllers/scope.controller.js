const ScopeCatalogService = require('../services/infrastructure/scopeCatalog.service');

/**
 * Controller responsible for scope catalog HTTP endpoints.
 */
class ScopeController {
  /**
   * Build a controller with its infrastructure service dependency.
   */
  constructor() {
    this.scopeCatalogService = new ScopeCatalogService();
  }

  /**
   * Return active scope catalog entries ready for frontend consumption.
   *
   * @param {import('express').Request} req - Express request object.
   * @param {import('express').Response} res - Express response object.
   * @param {import('express').NextFunction} next - Express next callback.
   * @returns {Promise<import('express').Response>} JSON scope list.
   */
  async listScopes(req, res, next) {
    try {
      const scopes = await this.scopeCatalogService.listActiveScopes();
      return res.status(200).json(scopes);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = ScopeController;
