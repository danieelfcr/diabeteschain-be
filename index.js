require('dotenv').config();
const express = require('express');
const healthRoutes = require('./src/routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/health', healthRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'DiabetesChain backend está funcionando' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
