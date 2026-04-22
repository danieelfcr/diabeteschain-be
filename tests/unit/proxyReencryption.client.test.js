const ProxyReencryptionClient = require('../../src/clients/proxyReencryption/proxyReencryption.client');

describe('ProxyReencryptionClient', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.PRE_SERVICE_TIMEOUT_MS = '5000';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('distributes exactly one kfrag to each resolved proxy node endpoint', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        status: 'success',
        delegation: {
          delegationId: 'delegation-001',
          status: 'PENDING',
          updatedAt: '2026-04-19T18:00:00.000Z',
        },
      }),
    });

    const client = new ProxyReencryptionClient();
    const result = await client.distributeKFrags({
      delegationId: 'delegation-001',
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      allowedScopes: ['scope-001'],
      kfrags: ['kfrag-001', 'kfrag-002'],
      proxies: [
        { id: 'proxy-a', endpoint: 'http://proxy-a.local:5001' },
        { id: 'proxy-b', endpoint: 'http://proxy-b.local:5001' },
      ],
      threshold: 1,
      shares: 2,
      status: 'PENDING',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('http://proxy-a.local:5001/delegations');
    expect(global.fetch.mock.calls[1][0]).toBe('http://proxy-b.local:5001/delegations');

    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({
      delegationId: 'delegation-001',
      kfrags: ['kfrag-001'],
      proxies: [{ id: 'proxy-a' }],
      shares: 2,
      threshold: 1,
    });
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toMatchObject({
      delegationId: 'delegation-001',
      kfrags: ['kfrag-002'],
      proxies: [{ id: 'proxy-b' }],
      shares: 2,
      threshold: 1,
    });

    expect(result).toMatchObject({
      id: 'delegation-001',
      delegationId: 'delegation-001',
      proxyIds: ['proxy-a', 'proxy-b'],
      fragmentsDistributed: 2,
      shares: 2,
      threshold: 1,
    });
  });

  it('rejects inconsistent shares, kfrags, and proxy node counts', async () => {
    const client = new ProxyReencryptionClient();

    await expect(client.distributeKFrags({
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      allowedScopes: ['scope-001'],
      kfrags: ['kfrag-001'],
      proxies: [
        { id: 'proxy-a', endpoint: 'http://proxy-a.local:5001' },
        { id: 'proxy-b', endpoint: 'http://proxy-b.local:5001' },
      ],
      threshold: 1,
      shares: 2,
      status: 'PENDING',
    })).rejects.toThrow('PRE shares must match kfrags length: shares=2, kfrags=1');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('short-circuits delegated material retrieval when there are no references', async () => {
    const client = new ProxyReencryptionClient();

    const result = await client.getDelegatedAccessMaterial({
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      permissionIds: ['permission-001'],
      effectiveScopes: ['scope-001'],
      scopeMaterials: [
        {
          permissionId: 'permission-001',
          scopeId: 'scope-001',
          scopeMaterial: {
            proxyIds: ['proxy-a'],
          },
        },
      ],
      proxyNodes: [
        { id: 'proxy-a', endpoint: 'http://proxy-a.local:5001' },
      ],
      references: [],
      records: [],
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ready',
      retrievalMode: 'umbral_pre',
      permissionIds: ['permission-001'],
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      effectiveScopes: ['scope-001'],
      proxyIds: ['proxy-a'],
      scopeMaterials: [
        {
          permissionId: 'permission-001',
          scopeId: 'scope-001',
          scopeMaterial: {
            proxyIds: ['proxy-a'],
          },
        },
      ],
      proxyTransforms: [
        {
          proxyId: 'proxy-a',
          endpoint: 'http://proxy-a.local:5001/',
          status: 'AVAILABLE',
        },
      ],
      capsules: [],
      cfrags: [],
      threshold: 3,
      contributionsCollected: 0,
    });
  });

  it('contacts resolved proxy endpoints until threshold contributions are collected', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          status: 'ready',
          cfrags: [{ proxyId: 'proxy-a', value: 'cfrag-a' }],
          capsules: [{ capsuleId: 'capsule-record-001', recordId: 'record-001' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          status: 'ready',
          cfrags: [{ proxyId: 'proxy-b', value: 'cfrag-b' }],
          capsules: [{ capsuleId: 'capsule-record-001', recordId: 'record-001' }],
        }),
      });

    const client = new ProxyReencryptionClient();
    const result = await client.getDelegatedAccessMaterial({
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      permissionIds: ['permission-001'],
      effectiveScopes: ['scope-001'],
      threshold: 2,
      scopeMaterials: [
        {
          permissionId: 'permission-001',
          scopeId: 'scope-001',
          scopeMaterial: {
            proxyIds: ['proxy-a', 'proxy-b', 'proxy-c'],
          },
        },
      ],
      proxyNodes: [
        { id: 'proxy-a', endpoint: 'http://proxy-a.local:5001' },
        { id: 'proxy-b', endpoint: 'http://proxy-b.local:5001' },
        { id: 'proxy-c', endpoint: 'http://proxy-c.local:5001' },
      ],
      references: [
        {
          recordId: 'record-001',
          scopeId: 'scope-001',
          capsule: 'base64-blockchain-capsule-001',
        },
      ],
      records: [
        {
          recordId: 'record-001',
          scopeId: 'scope-001',
          encryption: {
            ciphertext: 'ciphertext',
            capsule: 'base64-mongo-capsule-should-not-be-used',
          },
        },
      ],
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toBe('http://proxy-a.local:5001/reencrypt/batch');
    expect(global.fetch.mock.calls[1][0]).toBe('http://proxy-b.local:5001/reencrypt/batch');
    const firstBatchBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(firstBatchBody).toMatchObject({
      references: [
        {
          recordId: 'record-001',
          scopeId: 'scope-001',
          capsule: {
            format: 'umbral-capsule/base64',
            value: 'base64-blockchain-capsule-001',
          },
        },
      ],
    });
    expect(firstBatchBody.records[0].encryption).not.toHaveProperty('capsule');
    expect(result).toMatchObject({
      status: 'ready',
      threshold: 2,
      contributionsCollected: 2,
      contactedProxyIds: ['proxy-a', 'proxy-b'],
      cfrags: [
        { proxyId: 'proxy-a', value: 'cfrag-a' },
        { proxyId: 'proxy-b', value: 'cfrag-b' },
      ],
    });
  });

  it('fails clearly when delegated history references do not include blockchain Umbral capsules', async () => {
    const client = new ProxyReencryptionClient();

    await expect(client.getDelegatedAccessMaterial({
      patientPseudoId: 'patient-001',
      granteeId: 'professional-001',
      permissionIds: ['permission-001'],
      effectiveScopes: ['scope-001'],
      threshold: 1,
      proxyNodes: [
        { id: 'proxy-a', endpoint: 'http://proxy-a.local:5001' },
      ],
      scopeMaterials: [],
      references: [
        {
          recordId: 'record-001',
          scopeId: 'scope-001',
        },
      ],
      records: [
        {
          recordId: 'record-001',
          scopeId: 'scope-001',
          encryption: {
            ciphertext: 'ciphertext',
            capsule: 'base64-mongo-capsule-should-not-be-used',
          },
        },
      ],
    })).rejects.toThrow(
      'Delegated clinical references are missing blockchain Umbral capsules required for PRE: record-001'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
