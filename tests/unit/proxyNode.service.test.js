jest.mock('../../src/repositories/proxyNode.repository', () => ({
  findAvailable: jest.fn(),
  findByIds: jest.fn(),
}));

const proxyNodeRepository = require('../../src/repositories/proxyNode.repository');
const ProxyNodeService = require('../../src/services/infrastructure/proxyNode.service');

describe('ProxyNodeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('selects requested proxy nodes from infrastructure records only', async () => {
    proxyNodeRepository.findAvailable.mockResolvedValue([
      { id: 'proxy-a', endpointUrl: 'http://proxy-a.local:5001', status: true },
      { id: 'proxy-b', endpointUrl: 'http://proxy-b.local:5001', status: true },
      { id: 'proxy-c', endpointUrl: 'http://proxy-c.local:5001', status: true },
    ]);

    const service = new ProxyNodeService();
    const selected = await service.selectRandomProxyNodes(2);

    expect(proxyNodeRepository.findAvailable).toHaveBeenCalledTimes(1);
    expect(selected).toHaveLength(2);
    expect(selected.every((node) => node.id.startsWith('proxy-'))).toBe(true);
    expect(selected.every((node) => node.endpoint.startsWith('http://proxy-'))).toBe(true);
    expect(selected.every((node) => node.status === 'AVAILABLE')).toBe(true);
  });

  it('fails clearly when infrastructure has fewer active nodes than required', async () => {
    proxyNodeRepository.findAvailable.mockResolvedValue([
      { id: 'proxy-a', endpointUrl: 'http://proxy-a.local:5001', status: true },
    ]);

    const service = new ProxyNodeService();

    await expect(service.selectRandomProxyNodes(5)).rejects.toThrow(
      'Insufficient active PRE proxy nodes: required 5, available 1'
    );
  });

  it('resolves proxy nodes by id while preserving the requested order', async () => {
    proxyNodeRepository.findByIds.mockResolvedValue([
      { id: 'proxy-b', endpointUrl: 'http://proxy-b.local:5001', status: true },
      { id: 'proxy-a', endpointUrl: 'http://proxy-a.local:5001', status: true },
    ]);

    const service = new ProxyNodeService();
    const resolved = await service.getProxyNodesByIds(['proxy-a', 'proxy-b']);

    expect(proxyNodeRepository.findByIds).toHaveBeenCalledWith(['proxy-a', 'proxy-b']);
    expect(resolved).toEqual([
      {
        id: 'proxy-a',
        endpoint: 'http://proxy-a.local:5001',
        endpointUrl: 'http://proxy-a.local:5001',
        status: 'AVAILABLE',
      },
      {
        id: 'proxy-b',
        endpoint: 'http://proxy-b.local:5001',
        endpointUrl: 'http://proxy-b.local:5001',
        status: 'AVAILABLE',
      },
    ]);
  });
});
