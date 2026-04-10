const express = require('express');
const healthRoutes = require('./routes/health');
const clinicalRecordRoutes = require('./routes/clinicalRecord.routes');
const identityRoutes = require('./routes/identity.routes');

const app = express();

app.use(express.json());
app.use('/health', healthRoutes);
app.use('/clinical-records', clinicalRecordRoutes);
app.use('/auth', identityRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'DiabetesChain backend esta funcionando' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

module.exports = app;
