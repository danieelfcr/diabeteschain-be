const { AsyncLocalStorage } = require('async_hooks');
const { performance } = require('perf_hooks');

const storage = new AsyncLocalStorage();

function normalizeOptionalHeader(value) {
  if (Array.isArray(value)) {
    return normalizeOptionalHeader(value[0]);
  }

  const normalized = String(value || '').trim();
  return normalized || null;
}

function loadTestContextMiddleware(req, res, next) {
  const context = {
    scenario: normalizeOptionalHeader(req.get('X-Test-Scenario')) || process.env.LOAD_TEST_SCENARIO || null,
    runId: normalizeOptionalHeader(req.get('X-Test-Run-Id')) || process.env.LOAD_TEST_RUN_ID || null,
    method: req.method,
    path: req.originalUrl || req.url || null,
    requestStartMs: performance.now(),
  };

  storage.run(context, next);
}

function getLoadTestContext() {
  return storage.getStore() || null;
}

module.exports = {
  loadTestContextMiddleware,
  getLoadTestContext,
};
