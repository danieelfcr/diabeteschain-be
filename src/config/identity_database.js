const { sequelize, Role, Status } = require('../models/persistence/user.schema');

const defaultRoles = ['PATIENT', 'DOCTOR', 'LABORATORY', 'PHARMACIST', 'ADMIN'];
const defaultStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

const seedIdentityCatalogs = async () => {
  for (const roleName of defaultRoles) {
    await Role.findOrCreate({ where: { name: roleName } });
  }

  for (const statusName of defaultStatuses) {
    await Status.findOrCreate({ where: { name: statusName } });
  }
};

/**
 * Initialize the identity database and ensure required catalog entries exist.
 *
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Recreate the schema from scratch.
 * @returns {Promise<void>} Resolves when the identity database is synchronized and seeded.
 */
const initializeIdentityDatabase = async (options = {}) => {
  const { force = false } = options;

  try {
    await sequelize.sync({ force });
    console.log('Base de datos sincronizada exitosamente');

    await seedIdentityCatalogs();

    console.log('Catalogos inicializados');
  } catch (error) {
    console.error('Error inicializando la base de datos:', error);
    throw error;
  }
};

module.exports = {
  initializeIdentityDatabase,
  seedIdentityCatalogs,
  sequelize,
};
