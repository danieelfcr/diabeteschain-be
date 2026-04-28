jest.mock('../../src/repositories/proxyNode.repository', () => ({
  findAvailable: jest.fn(),
  findByIds: jest.fn(),
}));

const crypto = require('crypto');
const proxyNodeRepository = require('../../src/repositories/proxyNode.repository');
const ProxyNodeService = require('../../src/services/infrastructure/proxyNode.service');
const { encryptProxyNodeBaseUrl } = require('../../src/utils/proxyNodeCrypto.utils');

describe('ProxyNodeService', () => {
  const proxyNode = (id, baseUrl, status = 'ACTIVE') => ({
    id,
    encryptedBaseUrl: encryptProxyNodeBaseUrl(baseUrl),
    status,
  });

  beforeEach(() => {
    process.env.INFRASTRUCTURE_SECRET_KEY = crypto.randomBytes(32).toString('base64');
    jest.clearAllMocks();
  });

  it('selects requested proxy nodes from infrastructure records only', async () => {
    proxyNodeRepository.findAvailable.mockResolvedValue([
      proxyNode('proxy-a', 'http://proxy-a.local:5001'),
      proxyNode('proxy-b', 'http://proxy-b.local:5001'),
      proxyNode('proxy-c', 'http://proxy-c.local:5001'),
    ]);

    const service = new ProxyNodeService();
    const selected = await service.selectRandomProxyNodes(2);

    expect(proxyNodeRepository.findAvailable).toHaveBeenCalledTimes(1);
    expect(selected).toHaveLength(2);
    expect(selected.every((node) => node.id.startsWith('proxy-'))).toBe(true);
    expect(selected.every((node) => node.endpoint.startsWith('http://proxy-'))).toBe(true);
    expect(selected.every((node) => node.status === 'ACTIVE')).toBe(true);
  });

  it('fails clearly when infrastructure has fewer active nodes than required', async () => {
    proxyNodeRepository.findAvailable.mockResolvedValue([
      proxyNode('proxy-a', 'http://proxy-a.local:5001'),
    ]);

    const service = new ProxyNodeService();

    await expect(service.selectRandomProxyNodes(5)).rejects.toThrow(
      'Insufficient active PRE proxy nodes: required 5, available 1'
    );
  });

  it('resolves proxy nodes by id while preserving the requested order', async () => {
    proxyNodeRepository.findByIds.mockResolvedValue([
      proxyNode('proxy-b', 'http://proxy-b.local:5001'),
      proxyNode('proxy-a', 'http://proxy-a.local:5001'),
    ]);

    const service = new ProxyNodeService();
    const resolved = await service.getProxyNodesByIds(['proxy-a', 'proxy-b']);

    expect(proxyNodeRepository.findByIds).toHaveBeenCalledWith(['proxy-a', 'proxy-b']);
    expect(resolved).toEqual([
      {
        id: 'proxy-a',
        endpoint: 'http://proxy-a.local:5001/',
        endpointUrl: 'http://proxy-a.local:5001/',
        status: 'ACTIVE',
      },
      {
        id: 'proxy-b',
        endpoint: 'http://proxy-b.local:5001/',
        endpointUrl: 'http://proxy-b.local:5001/',
        status: 'ACTIVE',
      },
    ]);
  });

  it('selects all active proxies when only two are available for a grant', async () => {
    proxyNodeRepository.findAvailable.mockResolvedValue([
      proxyNode('proxy-a', 'http://proxy-a.local:5001'),
      proxyNode('proxy-b', 'http://proxy-b.local:5001'),
    ]);

    const service = new ProxyNodeService();
    const selected = await service.selectProxyNodesForGrant();

    expect(selected.map((node) => node.id)).toEqual(['proxy-a', 'proxy-b']);
  });
});
