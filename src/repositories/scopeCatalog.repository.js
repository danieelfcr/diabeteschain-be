const { ScopeCatalog } = require('../models/persistence/infrastructure.schema');

/**
 * Repository for the off-chain clinical scope catalog persisted in the
 * infrastructure SQLite database.
 */
class ScopeCatalogRepository {
  /**
   * Retrieve all scope catalog entries filtered by status.
   *
   * @param {Object} filter - Query filter.
   * @param {string|null} filter.status - Optional catalog status.
   * @returns {Promise<Array<Object>>} Matching catalog rows.
   */
  async findAll(filter = {}) {
    const where = {};

    if (filter.status) {
      where.status = filter.status;
    }

    return ScopeCatalog.findAll({
      where,
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Retrieve a single scope catalog entry by opaque identifier.
   *
   * @param {string} scopeId - Opaque scope identifier.
   * @returns {Promise<Object|null>} Matching catalog row or null.
   */
  async findByScopeId(scopeId) {
    return ScopeCatalog.findByPk(scopeId);
  }

  /**
   * Create or update one catalog row while keeping the operation idempotent.
   *
   * @param {Object} data - Catalog data to persist.
   * @returns {Promise<Object>} Persisted catalog row.
   */
  async upsert(data) {
    await ScopeCatalog.upsert(data);
    return this.findByScopeId(data.scopeId);
  }
}

module.exports = new ScopeCatalogRepository();
