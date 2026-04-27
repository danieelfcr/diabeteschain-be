const express = require('express');
const healthRoutes = require('./routes/health');
const auditRoutes = require('./routes/audit.routes');
const clinicalRecordRoutes = require('./routes/clinicalRecord.routes');
const identityRoutes = require('./routes/identity.routes');
const permissionRoutes = require('./routes/permission.routes');
const scopeRoutes = require('./routes/scope.routes');
const errorMiddleware = require('./middlewares/error.middleware');
const requestLogger = require('./middlewares/requestLogger.middleware');

/**
 * Express application instance configured with the project's HTTP routes and
 * shared middleware stack.
 *
 * The application intentionally keeps route registration centralized so the
 * module boundaries remain easy to discover and maintain as the backend grows.
 *
 * @type {import('express').Express}
 */
const app = express();

// Log every request once the response finishes so the final status is included.
app.use(requestLogger);

// Parse JSON payloads before requests reach the domain routes.
app.use(express.json());
app.use('/health', healthRoutes);
app.use('/audit', auditRoutes);
app.use('/clinical-records', clinicalRecordRoutes);
app.use('/permissions', permissionRoutes);
app.use('/auth', identityRoutes);
app.use('/scopes', scopeRoutes);

/**
 * Root endpoint used as a simple availability check for local environments.
 *
 * @param {import('express').Request} req - The incoming HTTP request.
 * @param {import('express').Response} res - The outgoing HTTP response.
 * @returns {void}
 */
app.get('/', (req, res) => {
  res.json({ message: 'DiabetesChain backend esta funcionando' });
});

/**
 * Fallback handler for unknown routes.
 *
 * This handler is deliberately placed after the route registrations so that it
 * only executes when no module matches the request path.
 *
 * @param {import('express').Request} req - The incoming HTTP request.
 * @param {import('express').Response} res - The outgoing HTTP response.
 * @returns {void}
 */
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Centralized error translation must be registered after all routes.
app.use(errorMiddleware);

module.exports = app;
