const scopeCatalogRepository = require('../../repositories/scopeCatalog.repository');
const { DEFAULT_SCOPE_CATALOG } = require('../../constants/scopeCatalog.constants');
const {
  encryptScopeCatalogValue,
  decryptScopeCatalogValue,
} = require('../../utils/scopeCatalogCrypto.utils');
const { createAppError } = require('../../utils/app-error');

/**
 * Service responsible for resolving the off-chain scope catalog used by the
 * frontend and orchestration flows.
 */
class ScopeCatalogService {
  /**
   * List active scope catalog entries with decrypted labels for UI consumers.
   *
   * @returns {Promise<Array<{scopeId: string, label: string}>>} Active scopes.
   */
  async listActiveScopes() {
    const scopes = await scopeCatalogRepository.findAll({ status: 'ACTIVE' });
    return scopes.map((scope) => this.mapScopeForResponse(scope));
  }

  /**
   * List the opaque identifiers of active catalog scopes.
   *
   * @returns {Promise<string[]>} Active scope identifiers.
   */
  async listActiveScopeIds() {
    const scopes = await scopeCatalogRepository.findAll({ status: 'ACTIVE' });
    return scopes
      .map((scope) => scope.scopeId)
      .filter(Boolean);
  }

  /**
   * Resolve one scope catalog entry by identifier.
   *
   * @param {string} scopeId - Opaque scope identifier.
   * @returns {Promise<{scopeId: string, label: string}>} Decrypted scope item.
   */
  async getScopeById(scopeId) {
    if (!scopeId) {
      throw createAppError('Scope identifier is required', 400);
    }

    const scope = await scopeCatalogRepository.findByScopeId(scopeId);

    if (!scope || scope.status !== 'ACTIVE') {
      throw createAppError('Scope not found', 404);
    }

    return this.mapScopeForResponse(scope);
  }

  /**
   * Assert that every provided scope identifier exists and is active in the
   * infrastructure catalog.
   *
   * @param {string[]} scopeIds - Candidate scope identifiers.
   * @returns {Promise<string[]>} Normalized unique identifiers.
   */
  async assertActiveScopeIds(scopeIds = []) {
    const normalizedScopeIds = [...new Set(
      (Array.isArray(scopeIds) ? scopeIds : [scopeIds]).filter(Boolean)
    )];

    if (normalizedScopeIds.length === 0) {
      throw createAppError('At least one clinical scope is required', 400);
    }

    const activeScopeIds = new Set(await this.listActiveScopeIds());
    const invalidScopeIds = normalizedScopeIds.filter((scopeId) => !activeScopeIds.has(scopeId));

    if (invalidScopeIds.length > 0) {
      throw createAppError(`Invalid scopes: ${invalidScopeIds.join(', ')}`, 400);
    }

    return normalizedScopeIds;
  }

  /**
   * Seed a stable default catalog for the diabetes prototype.
   *
   * The operation is idempotent and safe to invoke during every application
   * startup.
   *
   * @returns {Promise<number>} Number of seeded catalog rows.
   */
  async seedDefaultScopes() {
    let seededCount = 0;

    for (const entry of DEFAULT_SCOPE_CATALOG) {
      await scopeCatalogRepository.upsert({
        scopeId: entry.scopeId,
        labelEnc: encryptScopeCatalogValue(entry.label),
        status: 'ACTIVE',
      });
      seededCount += 1;
    }

    return seededCount;
  }

  /**
   * Transform a persistence row into the frontend response shape.
   *
   * @param {Object} scope - Sequelize model instance or plain object.
   * @returns {{scopeId: string, label: string}} Response-safe scope payload.
   */
  mapScopeForResponse(scope) {
    return {
      scopeId: scope.scopeId,
      label: decryptScopeCatalogValue(scope.labelEnc),
    };
  }
}

module.exports = ScopeCatalogService;
