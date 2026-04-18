const crypto = require('crypto');
const { createAppError } = require('./app-error');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * Resolve the symmetric key used to protect scope catalog labels.
 *
 * Supported formats:
 * - Base64-encoded 32-byte key
 * - Hex-encoded 32-byte key
 * - Raw UTF-8 32-byte string
 *
 * @returns {Buffer} Validated symmetric key material.
 */
function getScopeCatalogKey() {
  const rawKey = process.env.SCOPES_CATALOG_KEY || '';

  if (!rawKey.trim()) {
    throw createAppError('SCOPES_CATALOG_KEY environment variable is required', 500);
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
    'SCOPES_CATALOG_KEY must resolve to exactly 32 bytes (base64, hex, or raw string)',
    500
  );
}

/**
 * Encrypt a clinical scope label for storage in SQLite.
 *
 * @param {string} plaintext - Scope label in clear text.
 * @returns {string} Serialized encrypted payload.
 */
function encryptScopeCatalogValue(plaintext) {
  if (typeof plaintext !== 'string' || !plaintext.trim()) {
    throw createAppError('Scope catalog value must be a non-empty string', 500);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getScopeCatalogKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext.trim(), 'utf8'),
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
 * Decrypt a previously stored scope catalog label.
 *
 * @param {string} serializedPayload - Serialized encrypted payload.
 * @returns {string} Decrypted label.
 */
function decryptScopeCatalogValue(serializedPayload) {
  if (typeof serializedPayload !== 'string' || !serializedPayload.trim()) {
    throw createAppError('Encrypted scope catalog value is required', 500);
  }

  let payload;

  try {
    payload = JSON.parse(serializedPayload);
  } catch (error) {
    throw createAppError('Encrypted scope catalog value is malformed', 500);
  }

  if (
    payload?.alg !== ALGORITHM
    || typeof payload.iv !== 'string'
    || typeof payload.authTag !== 'string'
    || typeof payload.ciphertext !== 'string'
  ) {
    throw createAppError('Encrypted scope catalog value is invalid', 500);
  }

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getScopeCatalogKey(),
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    if (!plaintext.trim()) {
      throw new Error('Empty plaintext');
    }

    return plaintext;
  } catch (error) {
    throw createAppError('Failed to decrypt scope catalog value', 500);
  }
}

module.exports = {
  encryptScopeCatalogValue,
  decryptScopeCatalogValue,
  getScopeCatalogKey,
};
