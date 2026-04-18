jest.mock('../../src/repositories/scopeCatalog.repository', () => ({
  findAll: jest.fn(),
  findByScopeId: jest.fn(),
  upsert: jest.fn(),
}));

jest.mock('../../src/utils/scopeCatalogCrypto.utils', () => ({
  encryptScopeCatalogValue: jest.fn((value) => `enc:${value}`),
  decryptScopeCatalogValue: jest.fn((value) => value.replace(/^enc:/, '')),
}));

const scopeCatalogRepository = require('../../src/repositories/scopeCatalog.repository');
const ScopeCatalogService = require('../../src/services/infrastructure/scopeCatalog.service');

describe('ScopeCatalogService', () => {
  let service;

  beforeEach(() => {
    service = new ScopeCatalogService();
    jest.clearAllMocks();
  });

  it('returns the active opaque scope ids from the catalog', async () => {
    scopeCatalogRepository.findAll.mockResolvedValue([
      { scopeId: 'scope-1', status: 'ACTIVE' },
      { scopeId: 'scope-2', status: 'ACTIVE' },
    ]);

    await expect(service.listActiveScopeIds()).resolves.toEqual(['scope-1', 'scope-2']);
  });

  it('rejects unknown scope identifiers', async () => {
    scopeCatalogRepository.findAll.mockResolvedValue([
      { scopeId: 'scope-1', status: 'ACTIVE' },
      { scopeId: 'scope-2', status: 'ACTIVE' },
    ]);

    await expect(service.assertActiveScopeIds(['scope-1', 'scope-3'])).rejects.toThrow(
      'Invalid scopes: scope-3'
    );
  });

  it('accepts unique active scope identifiers', async () => {
    scopeCatalogRepository.findAll.mockResolvedValue([
      { scopeId: 'scope-1', status: 'ACTIVE' },
      { scopeId: 'scope-2', status: 'ACTIVE' },
    ]);

    await expect(service.assertActiveScopeIds(['scope-1', 'scope-1', 'scope-2'])).resolves.toEqual([
      'scope-1',
      'scope-2',
    ]);
  });
});
