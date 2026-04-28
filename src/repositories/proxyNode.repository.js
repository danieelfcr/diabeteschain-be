const { Op } = require('sequelize');
const { ProxyNode } = require('../models/persistence/infrastructure.schema');

/**
 * Repository for PRE proxy nodes stored in the infrastructure SQLite database.
 *
 * This layer is the only backend component that knows how proxy nodes are
 * persisted. Higher layers should consume domain methods instead of issuing
 * direct SQLite or Sequelize queries.
 */
class ProxyNodeRepository {
  /**
   * Retrieve active proxy nodes ordered by creation date.
   *
   * @returns {Promise<Array<Object>>} Active proxy node rows.
   */
  async findAvailable() {
    return ProxyNode.findAll({
      where: {
        status: {
          [Op.in]: ['ACTIVE', true, 1],
        },
      },
      order: [['createdAt', 'ASC']],
    });
  }

  /**
   * Retrieve proxy nodes by their persisted identifiers.
   *
   * @param {string[]} ids - Proxy node identifiers.
   * @returns {Promise<Array<Object>>} Matching proxy node rows.
   */
  async findByIds(ids = []) {
    const normalizedIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];

    if (normalizedIds.length === 0) {
      return [];
    }

    return ProxyNode.findAll({
      where: {
        id: {
          [Op.in]: normalizedIds,
        },
      },
    });
  }

  /**
   * Retrieve one proxy node by its persisted identifier.
   *
   * @param {string} id - Proxy node identifier.
   * @returns {Promise<Object|null>} Matching proxy node row or null.
   */
  async findById(id) {
    if (!id) {
      return null;
    }

    return ProxyNode.findByPk(id);
  }

  /**
   * Create or update one proxy node.
   *
   * @param {Object} data - Proxy node data to persist.
   * @returns {Promise<Object|null>} Persisted proxy node row.
   */
  async upsert(data) {
    await ProxyNode.upsert(data);
    return this.findById(data.id);
  }
}

module.exports = new ProxyNodeRepository();
