const { sequelize, User, Role, Status } = require('../models/persistence/user.schema');

const initializeIdentityDatabase = async () => {
  try {
    await sequelize.sync();
    console.log('Base de datos sincronizada exitosamente');
    
    // Crear catálogos iniciales si no existen
    await Role.findOrCreate({ where: { name: 'PATIENT' } });
    await Role.findOrCreate({ where: { name: 'DOCTOR' } });
    await Role.findOrCreate({ where: { name: 'LABORATORY' } });
    await Role.findOrCreate({ where: { name: 'PHARMACIST' } });
    await Role.findOrCreate({ where: { name: 'ADMIN' } });
    
    await Status.findOrCreate({ where: { name: 'ACTIVE' } });
    await Status.findOrCreate({ where: { name: 'INACTIVE' } });
    await Status.findOrCreate({ where: { name: 'SUSPENDED' } });
    
    console.log('Catálogos inicializados');
  } catch (error) {
    console.error('Error inicializando la base de datos:', error);
    process.exit(1);
  }
};

module.exports = { initializeIdentityDatabase, sequelize };
