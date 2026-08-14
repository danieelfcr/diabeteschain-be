const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const {
  serializeCanonicalPayload,
} = require('../../src/utils/signatureCanonicalization');
const {
  buildDoctorConsultationSignaturePayload,
  buildGrantAccessSignaturePayload,
} = require('../../src/utils/signaturePayload.utils');

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const RESULTS_DIR = path.resolve(__dirname, '..', 'results');
const IDENTITIES_PATH = path.join(RESULTS_DIR, 'generated-identities.json');
const OUTPUT_PATH = path.join(RESULTS_DIR, 'setup-output.json');
const ENV_PATH = path.join(RESULTS_DIR, 'load-test.env');
const DEFAULT_PASSWORD = process.env.TEST_PASSWORD || 'DiabetesChainLoad2026!';
const DEFAULT_SCOPE_ID = process.env.WRITE_SCOPE_ID || '8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2';

const BASE_ACTORS = [
  { username: 'patient_001', role: 'PATIENT', firstName: 'Ana', firstLastName: 'Lopez' },
  { username: 'patient_002', role: 'PATIENT', firstName: 'Luis', firstLastName: 'Garcia' },
  { username: 'patient_003', role: 'PATIENT', firstName: 'Maria', firstLastName: 'Perez' },
  {
    username: 'doctor_001',
    role: 'DOCTOR',
    firstName: 'Carlos',
    firstLastName: 'Mendez',
    professionalId: 'MED-LOAD-001',
    organizationId: 'hospital-general',
  },
  {
    username: 'doctor_002',
    role: 'DOCTOR',
    firstName: 'Sofia',
    firstLastName: 'Ramirez',
    professionalId: 'MED-LOAD-002',
    organizationId: 'hospital-centro-clinico',
  },
  {
    username: 'doctor_003',
    role: 'DOCTOR',
    firstName: 'Jorge',
    firstLastName: 'Castillo',
    professionalId: 'MED-LOAD-003',
    organizationId: 'hospital-san-isidro',
  },
  {
    username: 'lab_001',
    role: 'LABORATORY',
    firstName: 'Laboratorio',
    firstLastName: 'Central',
    professionalId: 'LAB-LOAD-001',
    organizationId: 'laboratorio-central',
  },
  {
    username: 'lab_002',
    role: 'LABORATORY',
    firstName: 'Laboratorio',
    firstLastName: 'Scantecni',
    professionalId: 'LAB-LOAD-002',
    organizationId: 'laboratorio-scantecni',
  },
  {
    username: 'pharma_001',
    role: 'PHARMACIST',
    firstName: 'Farmacia',
    firstLastName: 'Galeano',
    professionalId: 'PHA-LOAD-001',
    organizationId: 'farmacia-galeano',
  },
  {
    username: 'pharma_002',
    role: 'PHARMACIST',
    firstName: 'Farmacia',
    firstLastName: 'CruzAzul',
    professionalId: 'PHA-LOAD-002',
    organizationId: 'farmacia-cruz-azul',
  },
];

function buildActorSet(suffix = '') {
  return BASE_ACTORS.map((actor) => {
    const normalizedSuffix = suffix ? `_${suffix}` : '';
    const nextActor = {
      ...actor,
      baseUsername: actor.username,
      username: `${actor.username}${normalizedSuffix}`,
    };

    if (actor.professionalId) {
      nextActor.professionalId = `${actor.professionalId}${normalizedSuffix.toUpperCase()}`;
    }

    return nextActor;
  });
}

function createFallbackSuffix() {
  return `lt_${Date.now().toString(36).slice(-6)}`;
}

function emailFor(username) {
  return `${username}@load.diabeteschain.local`;
}

function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

async function loadOrCreateIdentities(actors) {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
  const existing = await readJsonIfExists(IDENTITIES_PATH);
  const identities = existing || {};

  for (const actor of actors) {
    if (!identities[actor.username]) {
      const keyPair = generateKeyPair();
      identities[actor.username] = {
        username: actor.username,
        role: actor.role,
        email: emailFor(actor.username),
        password: DEFAULT_PASSWORD,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      };
    }
  }

  return identities;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(pathName, options = {}) {
  const endpoint = `${BASE_URL}${pathName}`;
  let response;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      response = await fetch(endpoint, {
        method: options.method || 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      break;
    } catch (error) {
      if (attempt < 5) {
        await wait(500 * attempt);
        continue;
      }

      const cause = error.cause?.code || error.cause?.errors?.map((entry) => entry.code).filter(Boolean).join(',')
        || 'unknown';
      const message = [
        `Could not connect to DiabetesChain backend at ${endpoint}.`,
        `Start the backend first or set BASE_URL to the active port.`,
        `Example: $env:BASE_URL="http://127.0.0.1:3000"; npm run setup`,
        `Original error: ${error.message}`,
        `Cause: ${cause}`,
      ].join(' ');
      throw new Error(message);
    }
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { raw: text };
  }

  return { response, payload };
}

function publicKeyPathFor(actor) {
  return actor.role === 'PATIENT'
    ? `/auth/patients/${encodeURIComponent(actor.username)}/public-key`
    : `/auth/users/${encodeURIComponent(actor.username)}/public-key`;
}

function buildRegistrationPayload(actor, identity) {
  const payload = {
    username: actor.username,
    email: identity.email,
    password: identity.password,
    cuiHash: crypto.createHash('sha256').update(actor.username).digest('hex'),
    birthDate: '1985-01-01',
    firstName: actor.firstName,
    middleName: '',
    firstLastName: actor.firstLastName,
    secondLastName: 'Load',
    role: actor.role,
    publicKey: identity.publicKey,
    encryptedPrivateKeyByPassword: Buffer.from('synthetic-private-key-by-password').toString('base64'),
    passwordKdfSalt: Buffer.from('synthetic-password-salt').toString('base64'),
    encryptedPrivateKeyByRecovery: Buffer.from('synthetic-private-key-by-recovery').toString('base64'),
    recoveryKdfSalt: Buffer.from('synthetic-recovery-salt').toString('base64'),
    recoveryKeyHash: crypto.createHash('sha256').update(`${actor.username}:recovery`).digest('hex'),
  };

  if (actor.role !== 'PATIENT') {
    payload.professionalId = actor.professionalId;
    payload.organizationId = actor.organizationId;
  }

  return payload;
}

async function ensureActor(actor, identity, warnings) {
  const existing = await requestJson(publicKeyPathFor(actor));
  if (existing.response.status === 200) {
    const existingPublicKey = existing.payload?.user?.publicKey || null;
    if (existingPublicKey && existingPublicKey !== identity.publicKey) {
      warnings.push(
        `${actor.username} already exists with a different public key. Signatures generated here will not validate for that account.`
      );
    }
    return { username: actor.username, status: 'existing' };
  }

  const registration = await requestJson('/auth/register', {
    method: 'POST',
    body: buildRegistrationPayload(actor, identity),
  });

  if (![200, 201, 409].includes(registration.response.status)) {
    warnings.push(
      `Could not register ${actor.username}: HTTP ${registration.response.status} ${JSON.stringify(registration.payload)}`
    );
    return { username: actor.username, status: 'failed' };
  }

  return {
    username: actor.username,
    status: registration.response.status === 409 ? 'existing' : 'registered',
  };
}

function findActor(actors, username) {
  return actors.find((actor) => actor.username === username || actor.baseUsername === username) || null;
}

async function prepareActorSet({ suffix = '', warnings }) {
  const actors = buildActorSet(suffix);
  const identities = await loadOrCreateIdentities(actors);
  const actorResults = [];

  for (const actor of actors) {
    actorResults.push(await ensureActor(actor, identities[actor.username], warnings));
  }

  const requestedPatientUsername = process.env.PATIENT_USERNAME || 'patient_001';
  const requestedProfessionalUsername = process.env.PROFESSIONAL_USERNAME || 'doctor_001';
  const patientActor = findActor(actors, requestedPatientUsername) || actors.find((actor) => actor.baseUsername === 'patient_001');
  const professionalActor = findActor(actors, requestedProfessionalUsername) || actors.find((actor) => actor.baseUsername === 'doctor_001');

  const patientIdentity = identities[patientActor.username];
  const professionalIdentity = identities[professionalActor.username];
  const professionalLogin = await login(professionalIdentity, warnings);
  const patientLogin = await login(patientIdentity, warnings);

  return {
    suffix,
    actors,
    identities,
    actorResults,
    patientActor,
    professionalActor,
    patientIdentity,
    professionalIdentity,
    patientLogin,
    professionalLogin,
  };
}

async function login(identity, warnings) {
  const result = await requestJson('/auth/login', {
    method: 'POST',
    body: {
      email: identity.email,
      password: identity.password,
    },
  });

  if (result.response.status !== 200 || !result.payload?.accessToken) {
    warnings.push(
      `Could not login ${identity.username}: HTTP ${result.response.status} ${JSON.stringify(result.payload)}`
    );
    return null;
  }

  return result.payload;
}

function signPayload(payload, privateKey) {
  const signer = crypto.createSign('SHA256');
  signer.update(serializeCanonicalPayload(payload), 'utf8');
  signer.end();
  return signer.sign(privateKey, 'base64');
}

function buildDoctorEventPayload(patientUsername, scopeId, privateKey) {
  const unsignedPayload = {
    patientUsername,
    encounter: {
      scopeId,
      payloadMetadata: {
        payloadFormat: 'FHIR_JSON',
        fhirResourceType: 'Encounter',
        contentType: 'application/json',
      },
      encryption: {
        algorithm: 'AES-256-GCM',
        iv: process.env.WRITE_IV || 'bG9hZC10ZXN0LWl2LTEy',
        authTag: process.env.WRITE_AUTH_TAG || 'bG9hZC10ZXN0LWF1dGgtdGFn',
        ciphertext: process.env.WRITE_CIPHERTEXT || 'ZGlhYmV0ZXNjaGFpbi1sb2FkLXRlc3QtZW5jb3VudGVy',
      },
      integrity: {
        payloadHash: process.env.WRITE_PAYLOAD_HASH || '0acd7276e8195501fc24f774753bcb4236db3d3d05ed20cee8892121f76b61f2',
      },
    },
  };

  const signaturePayload = buildDoctorConsultationSignaturePayload(unsignedPayload);
  return {
    ...unsignedPayload,
    signature: signPayload(signaturePayload, privateKey),
  };
}

function buildGrantTemplate(patientUsername, professionalUsername, scopeId, privateKey) {
  const validFrom = new Date(Date.now() - 60 * 1000).toISOString();
  const validTo = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const grantCore = {
    patientUsername,
    professionalUsername,
    allowedActions: ['read', 'write'],
    allowedScopes: [scopeId],
    validFrom,
    validTo,
  };

  const signaturePayload = buildGrantAccessSignaturePayload(grantCore);
  return {
    professionalUsername,
    allowedActions: grantCore.allowedActions,
    allowedScopes: grantCore.allowedScopes,
    validFrom,
    validTo,
    signature: signPayload(signaturePayload, privateKey),
    transformKeys: [
      {
        scopeId,
        transformKey: '<base64-recrypt-transform-key>',
        transformKeyEncoding: 'base64',
        metadata: {
          scheme: 'RECRYPT',
        },
      },
    ],
    scopeMaterials: [
      {
        scopeId,
        encryptedScopeKey: '<base64-recrypt-encrypted-scope-key>',
        encryptedScopeKeyEncoding: 'base64',
        metadata: {
          source: 'LOAD_TEST_SETUP',
        },
      },
    ],
  };
}

function buildEnvOutput({ doctorLogin, patientUsername, professionalUsername, doctorIdentity, scopeId, writePayload }) {
  const lines = [
    `BASE_URL=${BASE_URL}`,
    `AUTH_TOKEN=${doctorLogin?.accessToken || ''}`,
    `DOCTOR_EMAIL=${doctorIdentity.email}`,
    `DOCTOR_PASSWORD=${doctorIdentity.password}`,
    `PATIENT_USERNAME=${patientUsername}`,
    `PROFESSIONAL_USERNAME=${professionalUsername}`,
    `WRITE_SCOPE_ID=${scopeId}`,
    `READ_SCOPE_IDS=${scopeId}`,
    `DOCTOR_EVENT_SIGNATURE=${writePayload.signature}`,
    `WRITE_PAYLOAD_HASH=${writePayload.encounter.integrity.payloadHash}`,
    `WRITE_IV=${writePayload.encounter.encryption.iv}`,
    `WRITE_AUTH_TAG=${writePayload.encounter.encryption.authTag}`,
    `WRITE_CIPHERTEXT=${writePayload.encounter.encryption.ciphertext}`,
  ];

  return `${lines.join('\n')}\n`;
}

async function main() {
  const warnings = [];

  const health = await requestJson('/health');
  if (health.response.status !== 200) {
    throw new Error(`Backend healthcheck failed at ${BASE_URL}/health with HTTP ${health.response.status}`);
  }

  let prepared = await prepareActorSet({
    suffix: process.env.LOAD_TEST_ACTOR_SUFFIX || '',
    warnings,
  });

  if (!prepared.professionalLogin || !prepared.patientLogin) {
    const fallbackSuffix = createFallbackSuffix();
    warnings.push(
      `Primary synthetic credentials could not login. Creating isolated load-test actors with suffix ${fallbackSuffix}.`
    );

    prepared = await prepareActorSet({
      suffix: fallbackSuffix,
      warnings,
    });
  }

  if (!prepared.professionalLogin) {
    throw new Error(
      `Unable to login professional ${prepared.professionalIdentity.email}. Check backend identity DB or registration errors above.`
    );
  }

  if (!prepared.patientLogin) {
    warnings.push(
      `Patient ${prepared.patientIdentity.email} could not login. Professional write tests can still authenticate, but grant setup may need manual review.`
    );
  }

  const patientUsername = prepared.patientActor.username;
  const professionalUsername = prepared.professionalActor.username;
  const doctorIdentity = prepared.professionalIdentity;
  const patientIdentity = prepared.patientIdentity;
  const doctorLogin = prepared.professionalLogin;
  const patientLogin = prepared.patientLogin;

  const writePayload = buildDoctorEventPayload(patientUsername, DEFAULT_SCOPE_ID, doctorIdentity.privateKey);
  const grantTemplate = buildGrantTemplate(
    patientUsername,
    professionalUsername,
    DEFAULT_SCOPE_ID,
    patientIdentity.privateKey
  );

  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    scopeId: DEFAULT_SCOPE_ID,
    actorSuffix: prepared.suffix,
    actors: prepared.actorResults,
    credentials: {
      password: DEFAULT_PASSWORD,
      patient: {
        username: patientUsername,
        email: patientIdentity.email,
        accessToken: patientLogin?.accessToken || null,
      },
      professional: {
        username: professionalUsername,
        email: doctorIdentity.email,
        accessToken: doctorLogin?.accessToken || null,
      },
    },
    write: {
      endpoint: '/clinical-records/events/doctor',
      payload: writePayload,
    },
    read: {
      endpoint: `/clinical-records/history/${patientUsername}?scopeIds=${DEFAULT_SCOPE_ID}`,
    },
    grant: {
      endpoint: '/permissions/grants',
      payloadTemplate: grantTemplate,
      note: 'Replace transformKeys and scopeMaterials placeholders with real Recrypt material before calling the grant endpoint.',
    },
    warnings,
  };

  await fs.writeFile(IDENTITIES_PATH, JSON.stringify(prepared.identities, null, 2), 'utf8');
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  await fs.writeFile(
    ENV_PATH,
    buildEnvOutput({
      doctorLogin,
      patientUsername,
      professionalUsername,
      doctorIdentity,
      scopeId: DEFAULT_SCOPE_ID,
      writePayload,
    }),
    'utf8'
  );

  console.log(`Setup output written to ${OUTPUT_PATH}`);
  console.log(`Convenience env file written to ${ENV_PATH}`);
  if (warnings.length) {
    console.warn('Warnings:');
    for (const warning of warnings) {
      console.warn(`- ${warning}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
