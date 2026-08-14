import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { env, explicitEnv, loadedEnvPath } from './lib/env.js';

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
const TOTAL_RECORDS = Number(env('TOTAL_RECORDS', DEFAULTS.total));
const VUS = Number(env('VUS', DEFAULTS.vus));
const MAX_DURATION = env('MAX_DURATION', '30m');
const RUN_ID = env('LOAD_TEST_RUN_ID', `write-${SCENARIO}-${Date.now()}`);
const SLEEP_MS = Number(env('SLEEP_MS', 0));

export const writeLatency = new Trend('write_latency_ms', true);
export const writeErrorRate = new Rate('write_error_rate');

export const options = {
  scenarios: {
    write_load: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: TOTAL_RECORDS,
      maxDuration: MAX_DURATION,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.20'],
    write_error_rate: ['rate<0.20'],
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
  const explicitToken = explicitEnv('AUTH_TOKEN');
  if (explicitToken) {
    return explicitToken;
  }

  const email = env('DOCTOR_EMAIL', env('AUTH_EMAIL', 'doctor_001@load.diabeteschain.local'));
  const password = env('DOCTOR_PASSWORD', env('AUTH_PASSWORD', 'DiabetesChainLoad2026!'));
  if (!email || !password) {
    const fallbackToken = env('AUTH_TOKEN');
    if (fallbackToken) {
      return fallbackToken;
    }

    fail('Write test requires AUTH_TOKEN or DOCTOR_EMAIL/DOCTOR_PASSWORD. Run npm run setup or pass credentials with -e.');
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

function buildDoctorPayload() {
  const signature = env('DOCTOR_EVENT_SIGNATURE') || env('WRITE_SIGNATURE') || env('SIGNATURE');
  if (!signature) {
    fail(
      `Write test requires DOCTOR_EVENT_SIGNATURE, WRITE_SIGNATURE, or SIGNATURE. `
      + `Run npm run setup first or pass -e LOAD_TEST_ENV_FILE=results/load-test.env. `
      + `Loaded env file: ${loadedEnvPath() || 'none'}.`
    );
  }

  return {
    patientUsername: env('PATIENT_USERNAME', 'patient_001'),
    signature,
    encounter: {
      scopeId: env('WRITE_SCOPE_ID', '8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2'),
      payloadMetadata: {
        payloadFormat: 'FHIR_JSON',
        fhirResourceType: 'Encounter',
        contentType: 'application/json',
      },
      encryption: {
        algorithm: 'AES-256-GCM',
        iv: env('WRITE_IV', 'bG9hZC10ZXN0LWl2LTEy'),
        authTag: env('WRITE_AUTH_TAG', 'bG9hZC10ZXN0LWF1dGgtdGFn'),
        ciphertext: env('WRITE_CIPHERTEXT', 'ZGlhYmV0ZXNjaGFpbi1sb2FkLXRlc3QtZW5jb3VudGVy'),
      },
      integrity: {
        payloadHash: env('WRITE_PAYLOAD_HASH', '0acd7276e8195501fc24f774753bcb4236db3d3d05ed20cee8892121f76b61f2'),
      },
    },
  };
}

export function setup() {
  return {
    token: login(),
    payload: buildDoctorPayload(),
  };
}

export default function (data) {
  const response = http.post(
    `${BASE_URL}/clinical-records/events/doctor`,
    JSON.stringify(data.payload),
    { headers: jsonHeaders({ Authorization: `Bearer ${data.token}` }) }
  );

  writeLatency.add(response.timings.duration);

  const ok = check(response, {
    'doctor write status is 201': (r) => r.status === 201,
    'doctor write response is successful': (r) => getJson(r, 'status') === 'success',
  });

  writeErrorRate.add(!ok);

  if (SLEEP_MS > 0) {
    sleep(SLEEP_MS / 1000);
  }
}
