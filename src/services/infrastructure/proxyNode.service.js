const proxyNodeRepository = require('../../repositories/proxyNode.repository');
const { createAppError } = require('../../utils/app-error');
const { decryptProxyNodeBaseUrl } = require('../../utils/proxyNodeCrypto.utils');

/**
 * Service responsible for resolving real PRE proxy nodes from the
 * infrastructure module.
 *
 * Selection and lookup rules live here so the PRE HTTP client remains focused
 * on transport to already resolved endpoints.
 */
class ProxyNodeService {
  /**
   * List all active proxy nodes in normalized response shape.
   *
   * @returns {Promise<Array<Object>>} Available proxy nodes.
   */
  async getAvailableProxyNodes() {
    const nodes = await proxyNodeRepository.findAvailable();
    return nodes.map((node) => this.mapProxyNode(node));
  }

  /**
   * Select a random set of active proxy nodes for a threshold PRE grant.
   *
   * @param {number|string} count - Number of proxy nodes required.
   * @returns {Promise<Array<Object>>} Randomly selected proxy nodes.
   */
  async selectRandomProxyNodes(count) {
    const requiredCount = this.normalizePositiveInteger(count, 'proxy node count');
    const availableNodes = await this.getAvailableProxyNodes();

    if (availableNodes.length < requiredCount) {
      throw createAppError(
        `Insufficient active PRE proxy nodes: required ${requiredCount}, available ${availableNodes.length}`,
        503,
        'pre_proxy_nodes_unavailable'
      );
    }

    return this.shuffle(availableNodes).slice(0, requiredCount);
  }

  /**
   * Select the PRE proxy set used for a grant.
   *
   * Rules:
   * - 0 active proxies: fail
   * - 1 active proxy: use it
   * - 2 active proxies: use both
   * - 3 or more active proxies: use 3 shuffled proxies without repetition
   *
   * @returns {Promise<Array<Object>>} Selected proxy nodes.
   */
  async selectProxyNodesForGrant() {
    const availableNodes = await this.getAvailableProxyNodes();

    if (availableNodes.length === 0) {
      throw createAppError(
        'No active PRE proxy nodes are available',
        503,
        'pre_proxy_nodes_unavailable'
      );
    }

    if (availableNodes.length <= 2) {
      return availableNodes;
    }

    return this.shuffle(availableNodes).slice(0, 3);
  }

  /**
   * Resolve proxy nodes by persisted identifiers while preserving input order.
   *
   * @param {string[]} ids - Proxy node identifiers to resolve.
   * @returns {Promise<Array<Object>>} Resolved proxy nodes.
   */
  async getProxyNodesByIds(ids = []) {
    const normalizedIds = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];

    if (normalizedIds.length === 0) {
      throw createAppError('At least one PRE proxy node identifier is required', 400, 'pre_validation_error');
    }

    const nodes = await proxyNodeRepository.findByIds(normalizedIds);
    const nodeMap = new Map(nodes.map((node) => [node.id, this.mapProxyNode(node)]));
    const missingIds = normalizedIds.filter((id) => !nodeMap.has(id));

    if (missingIds.length > 0) {
      throw createAppError(`PRE proxy nodes not found: ${missingIds.join(', ')}`, 404, 'pre_proxy_nodes_not_found');
    }

    const inactiveIds = normalizedIds
      .filter((id) => nodeMap.get(id)?.status !== 'ACTIVE');

    if (inactiveIds.length > 0) {
      throw createAppError(`PRE proxy nodes are inactive: ${inactiveIds.join(', ')}`, 409, 'pre_proxy_nodes_inactive');
    }

    return normalizedIds.map((id) => nodeMap.get(id));
  }

  /**
   * Transform a persistence row into the domain shape used by orchestration.
   *
   * @param {Object} node - Sequelize model instance or plain object.
   * @returns {Object} Normalized proxy node.
   */
  mapProxyNode(node) {
    const plainNode = typeof node?.get === 'function' ? node.get({ plain: true }) : node;
    const encryptedBaseUrl = plainNode.encryptedBaseUrl || plainNode.encrypted_base_url || null;

    if (!encryptedBaseUrl) {
      throw createAppError('PRE proxy node is missing encrypted base URL', 500, 'pre_proxy_node_invalid');
    }

    const endpointUrl = decryptProxyNodeBaseUrl(encryptedBaseUrl);
    const status = plainNode.status === true || plainNode.status === 1
      ? 'ACTIVE'
      : String(plainNode.status || '').trim().toUpperCase();

    return {
      id: plainNode.id,
      endpoint: endpointUrl,
      endpointUrl,
      status: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
    };
  }

  /**
   * Validate a positive integer input.
   *
   * @param {number|string} value - Candidate numeric value.
   * @param {string} label - Label used in error messages.
   * @returns {number} Positive integer.
   */
  normalizePositiveInteger(value, label) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw createAppError(`PRE ${label} must be a positive integer`, 400, 'pre_validation_error');
    }

    return normalized;
  }

  /**
   * Shuffle an array using Fisher-Yates without mutating the input.
   *
   * @param {Array<*>} values - Values to shuffle.
   * @returns {Array<*>} Shuffled values.
   */
  shuffle(values) {
    const shuffled = [...values];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    return shuffled;
  }
}

module.exports = ProxyNodeService;
