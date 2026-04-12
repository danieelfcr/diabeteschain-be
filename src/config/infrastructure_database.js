const { sequelize, ProxyNode } = require('../models/persistence/infrastructure.schema');

/**
 * Initialize the infrastructure database and synchronize the schema.
 * Uses alter mode to apply model changes without dropping the database.
 *
 * @returns {Promise<void>} Resolves when synchronization completes.
 */
const initializeInfrastructureDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('Database Infrastructure initialized successfully');
  } catch (error) {
    console.error('Error initializing Infrastructure database:', error);
    process.exit(1);
  }
};

module.exports = { initializeInfrastructureDatabase, sequelize };