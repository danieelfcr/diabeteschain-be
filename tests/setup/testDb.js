const { initializeIdentityDatabase, sequelize } = require('../../src/config/identity_database');

const initializeTestDatabase = async () => {
  await initializeIdentityDatabase({ force: true });
};

const resetTestDatabase = async () => {
  await initializeIdentityDatabase({ force: true });
};

const closeTestDatabase = async () => {
  await sequelize.close();
};

module.exports = {
  initializeTestDatabase,
  resetTestDatabase,
  closeTestDatabase,
};
