require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/mongo');
const { initializeIdentityDatabase } = require('./config/identity_database');
const { initializeInfrastructureDatabase } = require('./config/infrastructure_database');
const {
  initFabricGateway,
  closeFabricGateway,
} = require('./config/fabric_gateway');

/**
 * HTTP port used by the application server.
 */
const PORT = process.env.PORT || 3000;

/**
 * Cached HTTP server instance returned by Express after startup.
 */
let server;

/**
 * Initializes application dependencies and starts the HTTP server.
 *
 * The startup sequence ensures databases and Fabric connectivity are available
 * before the application begins accepting requests.
 *
 * @returns {Promise<import('http').Server|void>} The running HTTP server
 * instance when startup succeeds.
 */
const startServer = async () => {
  try {
    // Core infrastructure is initialized sequentially so startup fails fast if
    // any required dependency is unavailable.
    await connectDatabase();
    await initializeIdentityDatabase();
    await initializeInfrastructureDatabase();
    await initFabricGateway();

    server = app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });

    return server;
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

/**
 * Gracefully shuts down the HTTP server and external connections.
 *
 * @param {NodeJS.Signals|string} signal - The process signal that triggered the
 * shutdown flow.
 * @returns {Promise<void>}
 */
const shutdown = async (signal) => {
  console.log(`Received ${signal}. Closing server...`);

  try {
    if (server) {
      // Wrapping the callback-based close method allows the shutdown flow to
      // remain fully awaitable.
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    }

    // Close the Fabric Gateway and gRPC client to release resources.
    await closeFabricGateway();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

module.exports = {
  app,
  startServer,
};

if (require.main === module) {
  // Signal handlers are only registered when this module is executed as the
  // application entry point.
  startServer();
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
