const { DataTypes } = require('sequelize');
const { sequelize, Role, Status, Organization } = require('../models/persistence/user.schema');
const { DEFAULT_IDENTITY_ORGANIZATIONS } = require('../constants/identityOrganizations.constants');

const defaultRoles = ['PATIENT', 'DOCTOR', 'LABORATORY', 'PHARMACIST', 'ADMIN'];
const defaultStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

const seedIdentityCatalogs = async () => {
  for (const roleName of defaultRoles) {
    await Role.findOrCreate({ where: { name: roleName } });
  }

  for (const statusName of defaultStatuses) {
    await Status.findOrCreate({ where: { name: statusName } });
  }

  for (const organization of DEFAULT_IDENTITY_ORGANIZATIONS) {
    const [record] = await Organization.findOrCreate({
      where: { id: organization.id },
      defaults: { name: organization.name },
    });

    if (record.name !== organization.name) {
      record.name = organization.name;
      await record.save();
    }
  }
};

const ensureUserOptionalColumns = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const usersTable = await queryInterface.describeTable('users');

  if (usersTable.middle_name && usersTable.middle_name.allowNull === false) {
    await queryInterface.changeColumn('users', 'middle_name', {
      type: DataTypes.STRING,
      allowNull: true,
    });
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
    console.log('Identity Database synchronized successfully');

    await ensureUserOptionalColumns();
    await seedIdentityCatalogs();

    console.log('Catalogs initialized successfully');
  } catch (error) {
    console.error('Error initializing Identity database:', error);
    throw error;
  }
};

module.exports = {
  initializeIdentityDatabase,
  seedIdentityCatalogs,
  defaultOrganizations: DEFAULT_IDENTITY_ORGANIZATIONS,
  sequelize,
};
