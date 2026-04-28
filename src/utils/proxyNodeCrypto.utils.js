const crypto = require('crypto');
const { createAppError } = require('./app-error');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Resolve the symmetric key used to protect PRE proxy node base URLs.
 *
 * Supported formats:
 * - Base64-encoded 32-byte key
 * - Hex-encoded 32-byte key
 * - Raw UTF-8 32-byte string
 *
 * @returns {Buffer} Validated symmetric key material.
 */
function getInfrastructureSecretKey() {
  const rawKey = process.env.INFRASTRUCTURE_SECRET_KEY || '';

  if (!rawKey.trim()) {
    throw createAppError('INFRASTRUCTURE_SECRET_KEY environment variable is required', 500);
  }

  const normalizedKey = rawKey.trim();
  const candidateDecoders = [
    () => Buffer.from(normalizedKey, 'base64'),
    () => Buffer.from(normalizedKey, 'hex'),
    () => Buffer.from(normalizedKey, 'utf8'),
  ];

  for (const decode of candidateDecoders) {
    const decodedKey = decode();

    if (decodedKey.length === KEY_LENGTH) {
      return decodedKey;
    }
  }

  throw createAppError(
    'INFRASTRUCTURE_SECRET_KEY must resolve to exactly 32 bytes (base64, hex, or raw string)',
    500
  );
}

/**
 * Encrypt a PRE proxy base URL for storage in the infrastructure database.
 *
 * @param {string} baseUrl - Proxy base URL in clear text.
 * @returns {string} Serialized encrypted payload.
 */
function encryptProxyNodeBaseUrl(baseUrl) {
  const normalizedBaseUrl = normalizeBaseUrlForCrypto(baseUrl);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getInfrastructureSecretKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalizedBaseUrl, 'utf8'),
    cipher.final(),
  ]);

  return JSON.stringify({
    alg: ALGORITHM,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

/**
 * Decrypt a stored PRE proxy base URL.
 *
 * @param {string} serializedPayload - Serialized encrypted payload.
 * @returns {string} Decrypted base URL.
 */
function decryptProxyNodeBaseUrl(serializedPayload) {
  if (typeof serializedPayload !== 'string' || !serializedPayload.trim()) {
    throw createAppError('Encrypted PRE proxy base URL is required', 500);
  }

  const payload = parseEncryptedPayload(serializedPayload);
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || ciphertext.length === 0) {
    throw createAppError('Encrypted PRE proxy base URL is invalid', 500);
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getInfrastructureSecretKey(), iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');

    return normalizeBaseUrlForCrypto(plaintext);
  } catch (error) {
    throw createAppError('Failed to decrypt PRE proxy base URL', 500);
  }
}

/**
 * Parse and validate the encrypted payload envelope before decryption.
 *
 * @param {string} serializedPayload - Serialized encrypted payload.
 * @returns {Object} Parsed encrypted payload.
 */
function parseEncryptedPayload(serializedPayload) {
  let payload;

  try {
    payload = JSON.parse(serializedPayload);
  } catch (error) {
    throw createAppError('Encrypted PRE proxy base URL is malformed', 500);
  }

  if (
    payload?.alg !== ALGORITHM
    || typeof payload.iv !== 'string'
    || typeof payload.authTag !== 'string'
    || typeof payload.ciphertext !== 'string'
  ) {
    throw createAppError('Encrypted PRE proxy base URL is invalid', 500);
  }

  return payload;
}

/**
 * Validate and normalize a PRE proxy base URL.
 *
 * @param {string} baseUrl - Candidate base URL.
 * @returns {string} Normalized URL.
 */
function normalizeBaseUrlForCrypto(baseUrl) {
  const normalizedBaseUrl = String(baseUrl || '').trim();

  if (!normalizedBaseUrl) {
    throw createAppError('PRE proxy base URL must be a non-empty string', 500);
  }

  try {
    return new URL(normalizedBaseUrl).toString();
  } catch (error) {
    throw createAppError('PRE proxy base URL must be a valid URL', 500);
  }
}

module.exports = {
  encryptProxyNodeBaseUrl,
  decryptProxyNodeBaseUrl,
  getInfrastructureSecretKey,
};
