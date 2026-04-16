const jsonwebtoken = require('jsonwebtoken');
const securityConfig = require('../config/security');

/**
 * Sign a short-lived access token with the minimal claims needed by the API.
 *
 * @param {Object} payload - Access token payload.
 * @param {string} payload.sub - Authenticated user identifier.
 * @returns {string} Signed JWT access token.
 */
function signAccessToken(payload) {
  const { sub, ...claims } = payload;

  if (!sub) {
    throw new Error('Access token subject is required');
  }

  return jsonwebtoken.sign(claims, securityConfig.jwt.accessSecret, {
    algorithm: 'HS256',
    expiresIn: securityConfig.jwt.accessExpiresIn,
    issuer: securityConfig.jwt.issuer,
    subject: sub,
  });
}

/**
 * Verify a bearer token and return its decoded claims.
 *
 * @param {string} token - Bearer token value without the scheme.
 * @returns {Object} Verified JWT payload.
 */
function verifyAccessToken(token) {
  return jsonwebtoken.verify(token, securityConfig.jwt.accessSecret, {
    algorithms: ['HS256'],
    issuer: securityConfig.jwt.issuer,
  });
}

/**
 * Translate verified JWT claims into the request user shape expected across
 * the existing orchestration services.
 *
 * @param {Object} payload - Verified JWT payload.
 * @returns {Object|null} Request user context or null when required claims are missing.
 */
function mapTokenPayloadToRequestUser(payload) {
  if (!payload?.sub || !payload?.role) {
    return null;
  }

  return {
    id: payload.sub,
    pseudoId: payload.pseudoId || null,
    role: payload.role,
    email: payload.email || null,
    professionalId: payload.professionalId || null,
    username: payload.username || null,
    exp: payload.exp || null,
  };
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  mapTokenPayloadToRequestUser,
};
