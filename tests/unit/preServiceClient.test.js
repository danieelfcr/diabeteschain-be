const PreServiceClient = require('../../src/clients/preServiceClient');

describe('PreServiceClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.PRE_SERVICE_TIMEOUT_MS = '5000';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('registers a transform key using the PRE service contract', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        status: 'OK',
        proxyId: 'proxy-001',
        transformKeyId: 'tk-001',
        permissionId: 'permission-001',
        scopeId: 'scope-001',
      }),
    });

    const client = new PreServiceClient();
    const result = await client.registerTransformKey({
      baseUrl: 'http://pre-proxy.local:4100',
      proxyNodeId: 'proxy-001',
      permissionId: 'permission-001',
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      scopeId: 'scope-001',
      transformKey: 'transform-key-001',
      validFrom: '2026-01-01T00:00:00.000Z',
      validTo: '2026-12-31T23:59:59.000Z',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://pre-proxy.local:4100/transform-keys',
      expect.objectContaining({
        method: 'POST',
      })
    );

    const requestBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      permissionId: 'permission-001',
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      scopeId: 'scope-001',
      transformKey: 'transform-key-001',
    });
    expect(requestBody).not.toHaveProperty('patientId');
    expect(result).toEqual({
      scopeId: 'scope-001',
      proxyNodeId: 'proxy-001',
      transformKeyId: 'tk-001',
      status: 'REGISTERED',
    });
  });

  it('normalizes transformed scope key responses', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        status: 'OK',
        proxyId: 'proxy-001',
        scopeId: 'scope-001',
        transformedScopeKey: 'transformed-scope-key',
        transformedScopeKeyEncoding: 'base64',
        algorithm: 'RECRYPT_V1',
      }),
    });

    const client = new PreServiceClient();
    const result = await client.transformScopeKey({
      baseUrl: 'http://pre-proxy.local:4100',
      permissionId: 'permission-001',
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      scopeId: 'scope-001',
      encryptedScopeKey: 'encrypted-scope-key',
    });

    expect(global.fetch.mock.calls[0][0]).toBe('http://pre-proxy.local:4100/transform');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      encryptedScopeKey: 'encrypted-scope-key',
    });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).not.toHaveProperty('encryptedKey');
    expect(result).toEqual({
      scopeId: 'scope-001',
      transformedScopeKey: 'transformed-scope-key',
      metadata: {
        proxyNodeId: 'proxy-001',
        transformedScopeKeyEncoding: 'base64',
        algorithm: 'RECRYPT_V1',
      },
    });
  });
});
