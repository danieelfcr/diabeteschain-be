const { allowDevIdentityHeaders } = require('../config/security');
const { createAppError } = require('../utils/app-error');
const {
  verifyAccessToken,
  mapTokenPayloadToRequestUser,
} = require('../utils/jwt');

/**
 * Optional compatibility path for local scaffolding only.
 * It is disabled by default and must never be relied on outside development.
 *
 * @param {import('express').Request} req - Express request object.
 * @returns {Object|null} Request user context derived from explicit dev headers.
 */
function resolveDevHeaderIdentity(req) {
  if (!allowDevIdentityHeaders) {
    return null;
  }

  const id = req.headers['x-user-id'] || null;
  const role = req.headers['x-user-role'] || null;

  if (!id || !role) {
    return null;
  }

  return {
    id,
    pseudoId: req.headers['x-user-pseudo-id'] || null,
    role,
    email: req.headers['x-user-email'] || null,
    professionalId: req.headers['x-user-professional-id'] || null,
    username: req.headers['x-user-username'] || null,
  };
}

/**
 * Extract the token portion from a bearer Authorization header.
 *
 * @param {string|undefined} authorizationHeader - Raw Authorization header.
 * @returns {{ token: string|null, missing: boolean, malformed: boolean }} Token parsing result.
 */
function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader) {
    return {
      token: null,
      missing: true,
      malformed: false,
    };
  }

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);

  if (rest.length > 0 || !scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return {
      token: null,
      missing: false,
      malformed: true,
    };
  }

  return {
    token,
    missing: false,
    malformed: false,
  };
}

/**
 * Verify the incoming JWT bearer token and populate req.user.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {import('express').Response} res - Express response object.
 * @param {import('express').NextFunction} next - Express next callback.
 * @returns {void}
 */
module.exports = (req, res, next) => {
  const { token, missing, malformed } = extractBearerToken(req.get('Authorization'));

  if (missing) {
    const devIdentity = resolveDevHeaderIdentity(req);

    if (devIdentity) {
      req.user = devIdentity;
      return next();
    }

    return next(createAppError('Authentication token is required', 401, 'AUTH_ERROR'));
  }

  if (malformed) {
    return next(createAppError('Invalid authentication token', 401, 'AUTH_ERROR'));
  }

  try {
    const payload = verifyAccessToken(token);
    const user = mapTokenPayloadToRequestUser(payload);

    if (!user) {
      return next(createAppError('Invalid authentication token', 401, 'AUTH_ERROR'));
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(createAppError('Authentication token expired', 401, 'AUTH_ERROR'));
    }

    return next(createAppError('Invalid authentication token', 401, 'AUTH_ERROR'));
  }
};
