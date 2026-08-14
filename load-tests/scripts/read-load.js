import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { env, explicitEnv } from './lib/env.js';

const DEFAULT_SCENARIOS = {
  E1: { total: 50, vus: 5 },
  E2: { total: 100, vus: 10 },
  E3: { total: 500, vus: 20 },
  E4: { total: 1000, vus: 30 },
  E5: { total: 2000, vus: 50 },
};

const BASE_URL = env('BASE_URL', 'http://127.0.0.1:3000').replace(/\/$/, '');
const SCENARIO = env('SCENARIO', 'E1');
const DEFAULTS = DEFAULT_SCENARIOS[SCENARIO] || DEFAULT_SCENARIOS.E1;
const TOTAL_READS = Number(env('TOTAL_READS', DEFAULTS.total));
const VUS = Number(env('VUS', DEFAULTS.vus));
const MAX_DURATION = env('MAX_DURATION', '30m');
const RUN_ID = env('LOAD_TEST_RUN_ID', `read-${SCENARIO}-${Date.now()}`);
const SLEEP_MS = Number(env('SLEEP_MS', 0));

export const readLatency = new Trend('read_latency_ms', true);
export const readErrorRate = new Rate('read_error_rate');

export const options = {
  scenarios: {
    read_load: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: TOTAL_READS,
      maxDuration: MAX_DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.20'],
    read_error_rate: ['rate<0.20'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function jsonHeaders(extra = {}) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Test-Scenario': SCENARIO,
    'X-Test-Run-Id': RUN_ID,
    ...extra,
  };
}

function getJson(response, selector) {
  try {
    return response.json(selector);
  } catch (error) {
    return null;
  }
}

function login() {
  const explicitToken = explicitEnv('AUTH_TOKEN') || explicitEnv('PROFESSIONAL_TOKEN');
  if (explicitToken) {
    return explicitToken;
  }

  const email = env('PROFESSIONAL_EMAIL', env('DOCTOR_EMAIL', env('AUTH_EMAIL', 'doctor_001@load.diabeteschain.local')));
  const password = env('PROFESSIONAL_PASSWORD', env('DOCTOR_PASSWORD', env('AUTH_PASSWORD', 'DiabetesChainLoad2026!')));
  if (!email || !password) {
    const fallbackToken = env('AUTH_TOKEN') || env('PROFESSIONAL_TOKEN');
    if (fallbackToken) {
      return fallbackToken;
    }

    fail('Read test requires AUTH_TOKEN or PROFESSIONAL_EMAIL/PROFESSIONAL_PASSWORD. Run npm run setup or pass credentials with -e.');
  }

  const response = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: jsonHeaders() }
  );

  const token = getJson(response, 'accessToken');
  const ok = check(response, {
    'login status is 200': (r) => r.status === 200,
    'login returns accessToken': () => Boolean(token),
  });

  if (!ok) {
    fail(`Login failed with status ${response.status}: ${response.body}`);
  }

  return token;
}

function buildHistoryUrl() {
  const patientUsername = env('PATIENT_USERNAME');
  if (!patientUsername) {
    fail('Read test requires PATIENT_USERNAME.');
  }

  const scopeIds = env('READ_SCOPE_IDS') || env('SCOPE_IDS') || '';
  const query = scopeIds ? `?scopeIds=${encodeURIComponent(scopeIds)}` : '';
  return `${BASE_URL}/clinical-records/history/${encodeURIComponent(patientUsername)}${query}`;
}

export function setup() {
  return {
    token: login(),
    historyUrl: buildHistoryUrl(),
  };
}

export default function (data) {
  const response = http.get(data.historyUrl, {
    headers: jsonHeaders({ Authorization: `Bearer ${data.token}` }),
  });

  readLatency.add(response.timings.duration);

  const ok = check(response, {
    'history status is 200': (r) => r.status === 200,
    'history response is successful': (r) => getJson(r, 'status') === 'success' || getJson(r, 'success') === true,
  });

  readErrorRate.add(!ok);

  if (SLEEP_MS > 0) {
    sleep(SLEEP_MS / 1000);
  }
}
