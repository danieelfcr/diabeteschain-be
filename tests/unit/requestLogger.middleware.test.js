const express = require('express');
const request = require('supertest');
const { createRequestLogger } = require('../../src/middlewares/requestLogger.middleware');

function buildTestApp(logger) {
  const app = express();

  app.use(createRequestLogger({ logger, enabled: true }));
  app.get('/created', (req, res) => res.status(201).json({ ok: true }));
  app.get('/not-found', (req, res) => res.status(404).json({ error: 'missing' }));
  app.get('/error', (req, res) => res.status(500).json({ error: 'boom' }));

  return app;
}

describe('requestLogger middleware', () => {
  it('logs successful responses with their status code', async () => {
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const app = buildTestApp(logger);

    await request(app).get('/created?source=test').expect(201);

    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('GET /created?source=test -> 201')
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs client errors as warnings', async () => {
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const app = buildTestApp(logger);

    await request(app).get('/not-found').expect(404);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('GET /not-found -> 404')
    );
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs server errors as errors', async () => {
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const app = buildTestApp(logger);

    await request(app).get('/error').expect(500);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('GET /error -> 500')
    );
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
