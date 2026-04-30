const { sequelize, Role, Status, Organization } = require('../models/persistence/user.schema');

const defaultRoles = ['PATIENT', 'DOCTOR', 'LABORATORY', 'PHARMACIST', 'ADMIN'];
const defaultStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
const defaultOrganizations = [
  { id: 'hospital-general', name: 'Hospital General' },
  { id: 'clinica-diabeteschain', name: 'Clinica DiabetesChain' },
  { id: 'laboratorio-central', name: 'Laboratorio Central' },
  { id: 'farmacia-central', name: 'Farmacia Central' },
];

const seedIdentityCatalogs = async () => {
  for (const roleName of defaultRoles) {
    await Role.findOrCreate({ where: { name: roleName } });
  }

  for (const statusName of defaultStatuses) {
    await Status.findOrCreate({ where: { name: statusName } });
  }

  for (const organization of defaultOrganizations) {
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
  defaultOrganizations,
  sequelize,
};
