import http from 'k6/http';
import { check, fail } from 'k6';
import { env, explicitEnv } from './lib/env.js';

const BASE_URL = env('BASE_URL', 'http://127.0.0.1:3000').replace(/\/$/, '');
const SCENARIO = env('SCENARIO', 'SMOKE');
const RUN_ID = env('LOAD_TEST_RUN_ID', `smoke-${Date.now()}`);

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate<0.20'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'max'],
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

function loginIfConfigured() {
  const explicitToken = explicitEnv('AUTH_TOKEN');
  if (explicitToken) {
    return explicitToken;
  }

  const fallbackToken = env('AUTH_TOKEN');
  if (fallbackToken) {
    return fallbackToken;
  }

  const email = env('AUTH_EMAIL') || env('DOCTOR_EMAIL') || env('PROFESSIONAL_EMAIL');
  const password = env('AUTH_PASSWORD') || env('DOCTOR_PASSWORD') || env('PROFESSIONAL_PASSWORD');

  if (!email || !password) {
    return null;
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

function getJson(response, selector) {
  try {
    return response.json(selector);
  } catch (error) {
    return null;
  }
}

function buildDoctorPayload() {
  return {
    patientUsername: env('PATIENT_USERNAME', 'patient_001'),
    signature: env('DOCTOR_EVENT_SIGNATURE') || env('WRITE_SIGNATURE') || env('SIGNATURE'),
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

export default function () {
  const root = http.get(`${BASE_URL}/`, { headers: jsonHeaders() });
  check(root, {
    'root responds': (r) => r.status === 200,
  });

  const health = http.get(`${BASE_URL}/health`, { headers: jsonHeaders() });
  check(health, {
    'health responds': (r) => r.status === 200,
  });

  const token = loginIfConfigured();
  if (!token) {
    return;
  }

  const authHeaders = jsonHeaders({ Authorization: `Bearer ${token}` });

  const scopes = http.get(`${BASE_URL}/scopes`, { headers: authHeaders });
  check(scopes, {
    'scopes responds for authenticated user': (r) => r.status === 200,
  });

  if (env('SMOKE_READ') === 'true') {
    const patientUsername = env('PATIENT_USERNAME', 'patient_001');
    const readScopeIds = env('READ_SCOPE_IDS');
    const scopeQuery = readScopeIds ? `?scopeIds=${encodeURIComponent(readScopeIds)}` : '';
    const read = http.get(`${BASE_URL}/clinical-records/history/${patientUsername}${scopeQuery}`, {
      headers: authHeaders,
    });
    check(read, {
      'delegated history smoke responds': (r) => r.status === 200,
    });
  }

  if (env('SMOKE_WRITE') === 'true') {
    const payload = buildDoctorPayload();
    if (!payload.signature) {
      fail('SMOKE_WRITE=true requires DOCTOR_EVENT_SIGNATURE, WRITE_SIGNATURE, or SIGNATURE.');
    }

    const write = http.post(`${BASE_URL}/clinical-records/events/doctor`, JSON.stringify(payload), {
      headers: authHeaders,
    });
    check(write, {
      'doctor write smoke status is 201': (r) => r.status === 201,
    });
  }
}
