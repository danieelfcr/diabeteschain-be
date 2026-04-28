const { createAppError } = require('../utils/app-error');

class PreServiceClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.PRE_SERVICE_BASE_URL || null;
    this.apiKey = options.apiKey || process.env.PRE_SERVICE_API_KEY || process.env.PRE_API_KEY || null;
    this.timeoutMs = this.normalizeTimeout(
      options.timeoutMs || process.env.PRE_SERVICE_TIMEOUT_MS || 5000
    );
  }

  async registerTransformKey(payload = {}) {
    const response = await this.request('/transform-keys', {
      method: 'POST',
      body: {
        permissionId: payload.permissionId,
        patientPseudoId: payload.patientPseudoId,
        granteeId: payload.granteeId,
        scopeId: payload.scopeId,
        transformKey: payload.transformKey,
        transformKeyEncoding: payload.transformKeyEncoding || 'base64',
        expiresAt: payload.validTo || payload.expiresAt || null,
        algorithm: payload.algorithm || 'RECRYPT_V1',
        metadata: {
          ...(payload.metadata || {}),
          proxyNodeId: payload.proxyNodeId || null,
          validFrom: payload.validFrom || null,
          status: payload.status || 'ACTIVE',
        },
      },
      errorMessage: 'Unable to register transform key in PRE service',
    });

    return {
      scopeId: payload.scopeId,
      proxyNodeId: payload.proxyNodeId || response?.proxyNodeId || response?.proxyId || null,
      transformKeyId: response?.transformKeyId || response?.id || null,
      status: 'REGISTERED',
    };
  }

  async revokeTransformKey(payload = {}) {
    const response = await this.request('/transform-keys/revoke', {
      method: 'POST',
      body: {
        permissionId: payload.permissionId,
        patientPseudoId: payload.patientPseudoId,
        granteeId: payload.granteeId,
        scopeId: payload.scopeId,
      },
      errorMessage: 'Unable to revoke transform key in PRE service',
    });

    return {
      scopeId: payload.scopeId,
      proxyNodeId: response?.proxyNodeId || response?.proxyId || payload.proxyNodeId || null,
      status: 'REVOKED',
    };
  }

  async transformScopeKey(payload = {}) {
    const response = await this.request('/transform', {
      method: 'POST',
      body: {
        permissionId: payload.permissionId,
        patientPseudoId: payload.patientPseudoId,
        granteeId: payload.granteeId,
        scopeId: payload.scopeId,
        encryptedScopeKey: payload.encryptedScopeKey,
        encryptedScopeKeyEncoding: payload.encryptedScopeKeyEncoding || 'base64',
        encryptedKeyEncoding: payload.encryptedScopeKeyEncoding || 'base64',
      },
      errorMessage: 'Unable to transform scope key in PRE service',
    });

    const transformedScopeKey = response?.transformedScopeKey || response?.transformedKey || null;
    if (!transformedScopeKey) {
      throw createAppError(
        'PRE service response did not include transformedScopeKey',
        502,
        'pre_service_invalid_response'
      );
    }

    return {
      scopeId: payload.scopeId,
      transformedScopeKey,
      metadata: {
        proxyNodeId: response?.proxyNodeId || response?.proxyId || null,
        transformedScopeKeyEncoding: response?.transformedScopeKeyEncoding || response?.transformedKeyEncoding || null,
        algorithm: response?.algorithm || null,
      },
    };
  }

  async request(path, { method = 'GET', body = null, errorMessage = 'PRE service request failed' } = {}) {
    if (typeof fetch !== 'function') {
      throw createAppError('Global fetch API is not available in this Node.js runtime', 500, 'pre_fetch_unavailable');
    }

    const endpoint = this.resolveEndpoint(path);
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const payload = await this.parseJsonSafely(response);
      if (!response.ok) {
        throw this.buildServiceError(response, payload, errorMessage);
      }

      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw createAppError(
          `${errorMessage}: request timed out after ${this.timeoutMs}ms`,
          504,
          'pre_service_timeout'
        );
      }

      if (error?.statusCode) {
        throw error;
      }

      throw createAppError(
        `${errorMessage}: ${error.message}`,
        503,
        'pre_service_unavailable'
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  resolveEndpoint(path) {
    const baseUrl = this.normalizeBaseUrl(this.baseUrl);
    return new URL(path, baseUrl).toString();
  }

  normalizeBaseUrl(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
      throw createAppError('PRE_SERVICE_BASE_URL is required to contact PRE service', 500, 'pre_configuration_error');
    }

    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  normalizeTimeout(value) {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 5000;
  }

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

  buildServiceError(response, payload, fallbackMessage) {
    const serviceMessage = payload?.error?.message || payload?.message || payload?.error || null;
    const error = createAppError(
      serviceMessage ? `${fallbackMessage}: ${serviceMessage}` : fallbackMessage,
      response.status,
      payload?.error?.code || payload?.code || 'pre_service_error'
    );
    error.details = payload?.details || payload?.error?.details || null;
    return error;
  }
}

module.exports = PreServiceClient;
