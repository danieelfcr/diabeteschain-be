const crypto = require('crypto');

describe('proxyNodeCrypto.utils', () => {
  beforeEach(() => {
    process.env.INFRASTRUCTURE_SECRET_KEY = crypto.randomBytes(32).toString('base64');
    jest.resetModules();
  });

  it('encrypts and decrypts PRE proxy base URLs correctly', () => {
    const {
      encryptProxyNodeBaseUrl,
      decryptProxyNodeBaseUrl,
    } = require('../../src/utils/proxyNodeCrypto.utils');

    const encrypted = encryptProxyNodeBaseUrl('http://pre-proxy.local:4100');

    expect(encrypted).toEqual(expect.any(String));
    expect(encrypted).not.toContain('pre-proxy.local');
    expect(decryptProxyNodeBaseUrl(encrypted)).toBe('http://pre-proxy.local:4100/');
  });

  it('rejects tampered auth tags', () => {
    const {
      encryptProxyNodeBaseUrl,
      decryptProxyNodeBaseUrl,
    } = require('../../src/utils/proxyNodeCrypto.utils');

    const encrypted = JSON.parse(encryptProxyNodeBaseUrl('http://pre-proxy.local:4100'));
    encrypted.authTag = Buffer.alloc(16).toString('base64');

    expect(() => decryptProxyNodeBaseUrl(JSON.stringify(encrypted))).toThrow(
      'Failed to decrypt PRE proxy base URL'
    );
  });

  it('fails when the infrastructure key is missing', () => {
    delete process.env.INFRASTRUCTURE_SECRET_KEY;
    jest.resetModules();

    const { encryptProxyNodeBaseUrl } = require('../../src/utils/proxyNodeCrypto.utils');

    expect(() => encryptProxyNodeBaseUrl('http://pre-proxy.local:4100')).toThrow(
      'INFRASTRUCTURE_SECRET_KEY environment variable is required'
    );
  });
});
