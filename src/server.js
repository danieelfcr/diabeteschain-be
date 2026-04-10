require('dotenv').config();

const app = require('./app');
const { connectDatabase } = require('./config/mongo');
const { initializeIdentityDatabase } = require('./config/identity_database');
const { initializeInfrastructureDatabase } = require('./config/infrastructure_database');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await connectDatabase();
    await initializeIdentityDatabase();
    await initializeInfrastructureDatabase();

    return app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
};

module.exports = {
  app,
  startServer,
};

if (require.main === module) {
  startServer();
}
