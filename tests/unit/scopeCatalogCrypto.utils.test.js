const crypto = require('crypto');

describe('scopeCatalogCrypto.utils', () => {
  const envKey = crypto.randomBytes(32).toString('base64');

  beforeEach(() => {
    process.env.SCOPES_CATALOG_KEY = envKey;
    jest.resetModules();
  });

  it('encrypts and decrypts scope labels correctly', () => {
    const {
      encryptScopeCatalogValue,
      decryptScopeCatalogValue,
    } = require('../../src/utils/scopeCatalogCrypto.utils');

    const encrypted = encryptScopeCatalogValue('Control glucemico');

    expect(encrypted).toEqual(expect.any(String));
    expect(encrypted).not.toContain('Control glucemico');
    expect(decryptScopeCatalogValue(encrypted)).toBe('Control glucemico');
  });

  it('fails when the encryption key is missing', () => {
    delete process.env.SCOPES_CATALOG_KEY;
    jest.resetModules();

    const { encryptScopeCatalogValue } = require('../../src/utils/scopeCatalogCrypto.utils');

    expect(() => encryptScopeCatalogValue('Control glucemico')).toThrow(
      'SCOPES_CATALOG_KEY environment variable is required'
    );
  });
});
