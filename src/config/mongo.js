const mongoose = require('mongoose');

const connectDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    await mongoose.connection.db.admin().command({ ping: 1 });
    console.log('Pinged deployment. Successfully connected to MongoDB!');

    const db = mongoose.connection.useDb('internal-clinical-repository');
    console.log(`MongoDB connected in DB: internal-clinical-repository`);
    return db;
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

module.exports = { connectDatabase };