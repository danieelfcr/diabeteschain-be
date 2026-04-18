const { sequelize, ProxyNode, ScopeCatalog } = require('../models/persistence/infrastructure.schema');
const ScopeCatalogService = require('../services/infrastructure/scopeCatalog.service');

/**
 * Initialize the infrastructure database and synchronize the schema.
 * Uses alter mode to apply model changes without dropping the database.
 *
 * @returns {Promise<void>} Resolves when synchronization completes.
 */
const initializeInfrastructureDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    const scopeCatalogService = new ScopeCatalogService();
    await scopeCatalogService.seedDefaultScopes();
    console.log('Database Infrastructure initialized successfully');
  } catch (error) {
    console.error('Error initializing Infrastructure database:', error);
    process.exit(1);
  }
};

module.exports = { initializeInfrastructureDatabase, sequelize, ProxyNode, ScopeCatalog };
