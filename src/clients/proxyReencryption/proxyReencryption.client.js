const crypto = require('crypto');
const { createAppError } = require('../../utils/app-error');

/**
 * HTTP client for the external Proxy Re-Encryption microservices.
 *
 * The client intentionally does not query the infrastructure database. Proxy
 * nodes must be selected or resolved by the infrastructure layer and then
 * passed here with their real endpoints.
 */
class ProxyReencryptionClient {
  /**
   * Build the client with environment-driven transport settings.
   *
   * @param {Object} [options={}] - Optional client overrides.
   * @param {number|string} [options.timeoutMs] - Request timeout in milliseconds.
   */
  constructor(options = {}) {
    this.timeoutMs = this.normalizeTimeout(
      options.timeoutMs || process.env.PRE_SERVICE_TIMEOUT_MS || 5000
    );
  }

  /**
   * Distribute one kfrag to each selected proxy node.
   *
   * @param {Object} data - Distribution payload.
   * @returns {Promise<Object>} Normalized aggregate distribution response.
   */
  async distributeKFrags(data = {}) {
    const kfrags = this.normalizeArray(data.kfrags);
    const proxies = this.normalizeProxyNodes(data.proxies);
    const shares = this.normalizePositiveInteger(data.shares, 'shares');
    const threshold = this.normalizePositiveInteger(data.threshold, 'threshold');
    const allowedScopes = this.normalizeArray(data.allowedScopes);
    const delegationId = data.delegationId || `delegation-${crypto.randomUUID()}`;

    this.validateThresholdDistribution({
      shares,
      threshold,
      kfrags,
      proxies,
    });

    const nodeResponses = await Promise.all(
      proxies.map((proxy, index) =>
        this.request(proxy.endpoint, '/delegations', {
          method: 'POST',
          body: {
            delegationId,
            permissionId: data.permissionId || null,
            patientPseudoId: data.patientPseudoId || null,
            granteeId: data.granteeId || null,
            allowedScopes,
            kfrags: [kfrags[index]],
            proxies: [this.serializeProxyNode(proxy)],
            threshold,
            shares,
            status: data.status || 'PENDING',
            expiresAt: data.expiresAt || null,
          },
        }).then((response) => ({
          proxyId: proxy.id,
          endpoint: proxy.endpoint,
          response,
        }))
      )
    );

    return {
      id: delegationId,
      delegationId,
      status: data.status || 'PENDING',
      proxyIds: proxies.map((proxy) => proxy.id),
      patientPseudoId: data.patientPseudoId || null,
      granteeId: data.granteeId || null,
      allowedScopes,
      threshold,
      shares,
      fragmentsDistributed: nodeResponses.length,
      proxyDistributions: nodeResponses.map((entry) => ({
        proxyId: entry.proxyId,
        endpoint: entry.endpoint,
        status: entry.response?.delegation?.status || data.status || 'PENDING',
      })),
      createdAt: this.resolveFirstDelegationField(nodeResponses, 'createdAt'),
      updatedAt: this.resolveFirstDelegationField(nodeResponses, 'updatedAt'),
    };
  }

  /**
   * Update the logical status of a distributed delegation in every proxy node.
   *
   * @param {Object} data - Status update payload.
   * @returns {Promise<Object>} Normalized aggregate status response.
   */
  async updateKFragDistributionStatus(data = {}) {
    const delegationId = data.kfragDistributionId || data.delegationId || null;
    const proxies = this.normalizeProxyNodes(data.proxies);

    if (!delegationId) {
      throw createAppError('Missing required field: kfragDistributionId', 400, 'pre_validation_error');
    }

    if (proxies.length === 0) {
      throw createAppError('At least one resolved proxy node is required to update PRE status', 400, 'pre_validation_error');
    }

    const nodeResponses = await Promise.all(
      proxies.map((proxy) =>
        this.request(proxy.endpoint, `/delegations/${encodeURIComponent(delegationId)}/status`, {
          method: 'PATCH',
          body: {
            status: data.status || 'UNKNOWN',
            permissionId: data.permissionId || null,
            expiresAt: data.expiresAt || null,
          },
        }).then((response) => ({
          proxyId: proxy.id,
          endpoint: proxy.endpoint,
          response,
        }))
      )
    );

    return {
      kfragDistributionId: delegationId,
      delegationId,
      permissionId: data.permissionId || null,
      status: data.status || 'UNKNOWN',
      updatedAt: this.resolveFirstDelegationField(nodeResponses, 'updatedAt') || new Date().toISOString(),
      proxyIds: proxies.map((proxy) => proxy.id),
      proxyUpdates: nodeResponses.map((entry) => ({
        proxyId: entry.proxyId,
        endpoint: entry.endpoint,
        status: entry.response?.delegation?.status || data.status || 'UNKNOWN',
      })),
    };
  }

  /**
   * Request delegated re-encryption material for a single record from one
   * resolved proxy node.
   *
   * @param {Object} data - Input payload required by the PRE service.
   * @returns {Promise<Object>} Service response.
   */
  async generateAccessTransform(data = {}) {
    const proxy = this.normalizeProxyNodes([data.proxy || data.proxyNode])[0] || null;
    const recordId = this.resolveRecordId(data.record || data.reference || data);
    const capsule = this.resolveSerializedCapsule({
      capsule: data.capsule,
      reference: data.reference,
    });

    if (!proxy) {
      throw createAppError('A resolved proxy node is required to request re-encryption material', 400, 'pre_validation_error');
    }

    if (!capsule) {
      throw createAppError(
        'A valid Umbral capsule is required to request re-encryption material',
        500,
        'pre_capsule_missing'
      );
    }

    return this.request(proxy.endpoint, '/reencrypt', {
      method: 'POST',
      body: {
        delegationId: data.delegationId || null,
        permissionId: data.permissionId || null,
        patientPseudoId: data.patientPseudoId || null,
        granteeId: data.granteeId || null,
        scopeId: data.scopeId || data.reference?.scopeId || data.record?.scopeId || null,
        recordId,
        capsuleId: data.capsuleId || (recordId ? `capsule-${recordId}` : null),
        capsule,
      },
    });
  }

  /**
   * Revoke logically active delegated material in the resolved proxy nodes.
   *
   * @param {Object} data - Input payload required by the PRE service.
   * @returns {Promise<Object>} Aggregate service response.
   */
  async revokeAccessTransform(data = {}) {
    const proxies = this.normalizeProxyNodes(data.proxies || data.proxyNodes);

    if (proxies.length === 0) {
      throw createAppError('At least one resolved proxy node is required to revoke PRE material', 400, 'pre_validation_error');
    }

    const nodeResponses = await Promise.all(
      proxies.map((proxy) =>
        this.request(proxy.endpoint, '/delegations/revoke', {
          method: 'POST',
          body: {
            delegationId: data.delegationId || null,
            permissionId: data.permissionId || null,
            patientPseudoId: data.patientPseudoId || null,
            granteeId: data.granteeId || null,
            scopeId: data.scopeId || null,
            status: data.status || 'REVOKED',
          },
        }).then((response) => ({
          proxyId: proxy.id,
          endpoint: proxy.endpoint,
          response,
        }))
      )
    );

    return {
      status: data.status || 'REVOKED',
      permissionId: data.permissionId || null,
      delegationId: data.delegationId || null,
      proxyIds: proxies.map((proxy) => proxy.id),
      proxyRevocations: nodeResponses.map((entry) => ({
        proxyId: entry.proxyId,
        endpoint: entry.endpoint,
        status: entry.response?.status || data.status || 'REVOKED',
      })),
    };
  }

  /**
   * Resolve the cryptographic access requirements for history retrieval.
   *
   * @param {Object} data - Input payload required by the PRE service.
   * @returns {Promise<Object>} Service response.
   */
  async resolveHistoryAccess(data) {
    return this.getDelegatedAccessMaterial(data);
  }

  /**
   * Retrieve delegated cryptographic material for a professional history
   * query by contacting the real proxy node endpoints until threshold is met.
   *
   * @param {Object} data - History access resolution payload.
   * @returns {Promise<Object>} Delegated access material.
   */
  async getDelegatedAccessMaterial(data = {}) {
    const references = this.normalizeArray(data.references);
    const scopeMaterials = this.normalizeArray(data.scopeMaterials);
    const permissionIds = this.normalizeArray(data.permissionIds);
    const effectiveScopes = this.normalizeArray(data.effectiveScopes);
    const proxyNodes = this.normalizeProxyNodes(data.proxyNodes || data.proxies);
    const threshold = this.normalizePositiveInteger(data.threshold || 3, 'threshold');
    const requiredProxyIds = this.extractProxyIdsFromScopeMaterials(scopeMaterials);

    if (references.length === 0) {
      return {
        status: 'ready',
        retrievalMode: 'umbral_pre',
        permissionIds,
        patientPseudoId: data.patientPseudoId || null,
        granteeId: data.granteeId || null,
        effectiveScopes,
        proxyIds: requiredProxyIds,
        scopeMaterials,
        proxyTransforms: proxyNodes.map((proxy) => ({
          proxyId: proxy.id,
          endpoint: proxy.endpoint,
          status: proxy.status || 'AVAILABLE',
        })),
        capsules: [],
        cfrags: [],
        threshold,
        contributionsCollected: 0,
      };
    }

    if (proxyNodes.length === 0) {
      throw createAppError('Resolved PRE proxy nodes are required for delegated history access', 400, 'pre_validation_error');
    }

    if (proxyNodes.length < threshold) {
      throw createAppError(
        `Insufficient resolved PRE proxy nodes: required threshold ${threshold}, resolved ${proxyNodes.length}`,
        502,
        'pre_threshold_not_met'
      );
    }

    const records = this.normalizeArray(data.records);
    const recordsForPre = this.removeRecordCapsules(records);
    const enrichedReferences = this.enrichReferencesWithCapsules(references);
    const proxyTransforms = [];
    const proxyErrors = [];
    const cfrags = [];
    const capsules = new Map();
    let contributionsCollected = 0;

    for (const proxy of proxyNodes) {
      try {
        const response = await this.request(proxy.endpoint, '/reencrypt/batch', {
          method: 'POST',
          body: {
            patientPseudoId: data.patientPseudoId || null,
            granteeId: data.granteeId || null,
            permissionIds,
            effectiveScopes,
            scopeMaterials,
            references: enrichedReferences,
            records: recordsForPre,
          },
        });

        const responseCfrags = this.normalizeArray(response?.cfrags);
        const responseCapsules = this.normalizeArray(response?.capsules);

        if (responseCfrags.length > 0) {
          contributionsCollected += 1;
        }

        responseCfrags.forEach((cfrag) => cfrags.push(cfrag));
        responseCapsules.forEach((capsule) => {
          const key = capsule?.capsuleId || capsule?.recordId || JSON.stringify(capsule);
          capsules.set(key, capsule);
        });

        proxyTransforms.push({
          proxyId: proxy.id,
          endpoint: proxy.endpoint,
          status: response?.status || 'ready',
          cfragCount: responseCfrags.length,
        });

        if (contributionsCollected >= threshold) {
          break;
        }
      } catch (error) {
        proxyErrors.push({
          proxyId: proxy.id,
          endpoint: proxy.endpoint,
          message: error.message,
          code: error.code || null,
        });
      }
    }

    if (contributionsCollected < threshold) {
      throw createAppError(
        `Insufficient PRE contributions: required ${threshold}, collected ${contributionsCollected}`,
        502,
        'pre_threshold_not_met'
      );
    }

    return {
      status: 'ready',
      retrievalMode: 'umbral_pre',
      permissionIds,
      patientPseudoId: data.patientPseudoId || null,
      granteeId: data.granteeId || null,
      effectiveScopes,
      proxyIds: requiredProxyIds,
      contactedProxyIds: proxyTransforms.map((entry) => entry.proxyId),
      threshold,
      contributionsCollected,
      scopeMaterials,
      proxyTransforms,
      proxyErrors,
      capsules: [...capsules.values()],
      cfrags,
    };
  }

  /**
   * Send an HTTP request to a concrete PRE service endpoint and normalize
   * transport errors.
   *
   * @param {string} baseUrl - Base URL of the target proxy node.
   * @param {string} path - Relative service path.
   * @param {Object} options - Request options.
   * @param {string} [options.method='GET'] - HTTP method.
   * @param {Object|null} [options.body=null] - JSON payload.
   * @returns {Promise<Object|null>} Parsed JSON response.
   */
  async request(baseUrl, path, { method = 'GET', body = null } = {}) {
    if (typeof fetch !== 'function') {
      throw createAppError(
        'Global fetch API is not available in the current Node.js runtime',
        500,
        'pre_fetch_unavailable'
      );
    }

    const endpoint = this.normalizeBaseUrl(baseUrl);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(new URL(path, endpoint).toString(), {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const payload = await this.parseJsonSafely(response);
      if (!response.ok) {
        throw this.buildServiceError(response, payload);
      }

      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw createAppError(
          `Proxy re-encryption service request timed out after ${this.timeoutMs}ms`,
          504,
          'pre_service_timeout'
        );
      }

      if (error?.statusCode) {
        throw error;
      }

      throw createAppError(
        `Proxy re-encryption service is unavailable at ${endpoint}: ${error.message}`,
        503,
        'pre_service_unavailable'
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  /**
   * Validate threshold PRE distribution invariants.
   *
   * @param {Object} input - Distribution input.
   * @param {number} input.shares - Expected number of kfrags and proxies.
   * @param {number} input.threshold - Minimum required proxy contributions.
   * @param {Array<*>} input.kfrags - Kfrag collection.
   * @param {Array<Object>} input.proxies - Selected proxy nodes.
   */
  validateThresholdDistribution({ shares, threshold, kfrags, proxies }) {
    if (threshold > shares) {
      throw createAppError('PRE threshold must be less than or equal to shares', 400, 'pre_validation_error');
    }

    if (kfrags.length !== shares) {
      throw createAppError(
        `PRE shares must match kfrags length: shares=${shares}, kfrags=${kfrags.length}`,
        400,
        'pre_validation_error'
      );
    }

    if (proxies.length !== shares) {
      throw createAppError(
        `PRE shares must match selected proxy nodes: shares=${shares}, proxies=${proxies.length}`,
        400,
        'pre_validation_error'
      );
    }
  }

  /**
   * Validate and normalize capsules already attached to ledger references.
   *
   * @param {Array<Object>} references - Ledger references enriched by orchestration.
   * @returns {Array<Object>} References with normalized capsule metadata.
   */
  enrichReferencesWithCapsules(references) {
    const missingCapsules = [];

    const enrichedReferences = references.map((reference) => {
      const recordId = this.resolveRecordId(reference);
      const capsule = this.resolveSerializedCapsule({ reference });

      if (!capsule) {
        missingCapsules.push(recordId || 'unknown-record');
      }

      return {
        ...reference,
        ...(capsule ? { capsule } : {}),
      };
    });

    if (missingCapsules.length > 0) {
      throw createAppError(
        `Delegated clinical references are missing blockchain Umbral capsules required for PRE: ${missingCapsules.join(', ')}`,
        500,
        'pre_reference_capsule_missing'
      );
    }

    return enrichedReferences;
  }

  /**
   * Strip any Mongo-stored capsule before sending records to the PRE service.
   *
   * @param {Array<Object>} records - Off-chain clinical records.
   * @returns {Array<Object>} Records without encryption.capsule.
   */
  removeRecordCapsules(records = []) {
    return this.normalizeArray(records).map((record) => {
      if (!record?.encryption || !Object.prototype.hasOwnProperty.call(record.encryption, 'capsule')) {
        return record;
      }

      const { capsule, ...encryption } = record.encryption;
      return {
        ...record,
        encryption,
      };
    });
  }

  /**
   * Parse a PRE service response body as JSON when available.
   *
   * @param {Response} response - Fetch response object.
   * @returns {Promise<Object|null>} Parsed response payload.
   */
  async parseJsonSafely(response) {
    const rawBody = await response.text();
    if (!rawBody) {
      return null;
    }

    try {
      return JSON.parse(rawBody);
    } catch (error) {
      return { raw: rawBody };
    }
  }

  /**
   * Build a normalized application error from a PRE service failure payload.
   *
   * @param {Response} response - Fetch response object.
   * @param {Object|null} payload - Parsed JSON payload when available.
   * @returns {Error} Application error with HTTP metadata.
   */
  buildServiceError(response, payload) {
    const message = payload?.error?.message
      || payload?.message
      || `Proxy re-encryption service returned HTTP ${response.status}`;

    return createAppError(message, response.status, payload?.error?.code || 'pre_service_error');
  }

  /**
   * Normalize a PRE service base URL.
   *
   * @param {string} value - Raw URL value.
   * @returns {string} Normalized base URL.
   */
  normalizeBaseUrl(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw createAppError('Proxy node endpoint URL is required', 500, 'pre_configuration_error');
    }

    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  /**
   * Normalize the configured PRE request timeout.
   *
   * @param {number|string} value - Raw timeout value.
   * @returns {number} Timeout in milliseconds.
   */
  normalizeTimeout(value) {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 5000;
  }

  /**
   * Normalize a value into an array.
   *
   * @param {*} value - Candidate array value.
   * @returns {Array<*>} Array value.
   */
  normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  /**
   * Normalize a positive integer field.
   *
   * @param {number|string} value - Candidate numeric value.
   * @param {string} fieldName - Field name used in validation errors.
   * @returns {number} Positive integer.
   */
  normalizePositiveInteger(value, fieldName) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized <= 0) {
      throw createAppError(`PRE ${fieldName} must be a positive integer`, 400, 'pre_validation_error');
    }

    return normalized;
  }

  /**
   * Normalize proxy node objects received from the infrastructure layer.
   *
   * @param {Array<Object>} proxies - Proxy node candidates.
   * @returns {Array<Object>} Normalized proxy nodes.
   */
  normalizeProxyNodes(proxies = []) {
    return this.normalizeArray(proxies).map((proxy) => {
      const id = proxy?.id || proxy?.proxyId || null;
      const endpoint = proxy?.endpoint || proxy?.endpointUrl || null;

      if (!id) {
        throw createAppError('Resolved proxy node is missing id', 400, 'pre_validation_error');
      }

      if (!endpoint) {
        throw createAppError(`Resolved proxy node ${id} is missing endpoint`, 400, 'pre_validation_error');
      }

      return {
        id,
        endpoint: this.normalizeBaseUrl(endpoint),
        status: this.normalizeProxyStatus(proxy.status),
      };
    });
  }

  /**
   * Normalize a proxy node status without promoting inactive boolean values.
   *
   * @param {boolean|string|null|undefined} status - Raw status value.
   * @returns {string} Normalized status label.
   */
  normalizeProxyStatus(status) {
    if (typeof status === 'boolean') {
      return status ? 'AVAILABLE' : 'INACTIVE';
    }

    return status || 'AVAILABLE';
  }

  /**
   * Serialize a proxy node for the Flask PRE delegation contract.
   *
   * @param {Object} proxy - Normalized proxy node.
   * @returns {Object} Serializable proxy node.
   */
  serializeProxyNode(proxy) {
    return {
      id: proxy.id,
      endpoint: proxy.endpoint,
      status: proxy.status || 'AVAILABLE',
    };
  }

  /**
   * Resolve the first available delegation field from node responses.
   *
   * @param {Array<Object>} nodeResponses - Per-node response wrappers.
   * @param {string} fieldName - Delegation field name.
   * @returns {*|null} Resolved value or null.
   */
  resolveFirstDelegationField(nodeResponses, fieldName) {
    const match = nodeResponses.find((entry) => entry?.response?.delegation?.[fieldName]);
    return match?.response?.delegation?.[fieldName] || null;
  }

  /**
   * Extract unique proxy identifiers from scope material entries.
   *
   * @param {Array<Object>} scopeMaterials - Scope material list.
   * @returns {string[]} Unique proxy identifiers.
   */
  extractProxyIdsFromScopeMaterials(scopeMaterials = []) {
    return [...new Set(
      this.normalizeArray(scopeMaterials).flatMap((entry) =>
        Array.isArray(entry?.scopeMaterial?.proxyIds) ? entry.scopeMaterial.proxyIds.filter(Boolean) : []
      )
    )];
  }

  /**
   * Resolve a stable record identifier from references or record documents.
   *
   * @param {Object|null|undefined} source - Reference or record source.
   * @returns {string|null} Resolved record identifier.
   */
  resolveRecordId(source) {
    if (!source || typeof source !== 'object') {
      return null;
    }

    return source.recordId || source.clinicalRecordId || source.documentId || source.id || source._id || null;
  }

  /**
   * Resolve a serialized capsule from explicit input or an enriched reference.
   *
   * @param {Object} data - Capsule resolution input.
   * @param {*} [data.capsule] - Explicit capsule payload.
   * @param {Object|null} [data.reference] - Reference payload.
   * @returns {Object|null} Normalized serialized capsule or null.
   */
  resolveSerializedCapsule({ capsule = null, reference = null } = {}) {
    const candidate = capsule
      || reference?.capsule
      || null;

    if (!candidate) {
      return null;
    }

    if (typeof candidate === 'string') {
      return {
        format: 'umbral-capsule/base64',
        value: candidate,
      };
    }

    if (
      typeof candidate === 'object'
      && !Array.isArray(candidate)
      && candidate.format
      && candidate.value
    ) {
      return candidate;
    }

    throw createAppError(
      'Umbral capsule must be provided as a base64 string or { format, value } object',
      400,
      'pre_validation_error'
    );
  }
}

module.exports = ProxyReencryptionClient;
