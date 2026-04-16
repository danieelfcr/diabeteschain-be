const isProduction = process.env.NODE_ENV === 'production';
const accessSecret = process.env.JWT_ACCESS_SECRET || null;

if (!accessSecret) {
  throw new Error(
    `JWT_ACCESS_SECRET environment variable is required${isProduction ? ' in production' : ''}`
  );
}

module.exports = {
  jwt: {
    accessSecret,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    issuer: process.env.JWT_ISSUER,
  },
  allowDevIdentityHeaders: process.env.ALLOW_DEV_IDENTITY_HEADERS === 'true',
};
