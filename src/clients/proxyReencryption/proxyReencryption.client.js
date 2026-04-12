class ProxyReencryptionClient {
  async generateAccessTransform(data) {
    return this.buildPendingResponse('generateAccessTransform', data);
  }

  async revokeAccessTransform(data) {
    return this.buildPendingResponse('revokeAccessTransform', data);
  }

  async resolveHistoryAccess(data) {
    return this.buildPendingResponse('resolveHistoryAccess', data);
  }

  buildPendingResponse(operation, input) {
    return {
      client: 'ProxyReencryptionClient',
      operation,
      status: 'pending_implementation',
      input,
    };
  }
}

module.exports = ProxyReencryptionClient;
