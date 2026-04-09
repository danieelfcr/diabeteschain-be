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
    console.log('Base de datos Infrastructure sincronizada exitosamente');
  } catch (error) {
    console.error('Error inicializando la base de datos Infrastructure:', error);
    process.exit(1);
  }
};

module.exports = { initializeInfrastructureDatabase, sequelize };