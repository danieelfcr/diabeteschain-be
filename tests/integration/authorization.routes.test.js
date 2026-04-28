const request = require('supertest');

jest.mock('../../src/controllers/clinicalRecord.controller', () =>
  jest.fn().mockImplementation(() => ({
    getMyHistory(req, res) {
      return res.status(200).json({ authenticatedUser: req.user });
    },
    getProfessionalHistory(req, res) {
      return res.status(200).json({ authenticatedUser: req.user });
    },
    getScopeMaterialAccess(req, res) {
      return res.status(200).json({ authenticatedUser: req.user });
    },
    registerDoctorConsultation(req, res) {
      return res.status(201).json({ authenticatedUser: req.user });
    },
    registerLaboratoryResult(req, res) {
      return res.status(201).json({ authenticatedUser: req.user });
    },
    registerPharmacyDispatch(req, res) {
      return res.status(201).json({ authenticatedUser: req.user });
    },
  }))
);

jest.mock('../../src/controllers/permission.controller', () =>
  jest.fn().mockImplementation(() => ({
    getScopeMaterialPreflight(req, res) {
      return res.status(200).json({ authenticatedUser: req.user });
    },
    grantAccess(req, res) {
      return res.status(201).json({ authenticatedUser: req.user });
    },
    revokeAccess(req, res) {
      return res.status(200).json({ authenticatedUser: req.user });
    },
  }))
);

const app = require('../../src/app');
const { signAccessToken } = require('../../src/utils/jwt');

const buildToken = ({ id, pseudoId = null, role, professionalId = null }) =>
  signAccessToken({
    sub: id,
    pseudoId,
    role,
    email: `${String(role || 'user').toLowerCase()}@example.com`,
    professionalId,
    username: `${String(role || 'user').toLowerCase()}_user`,
  });

const buildGrantPayload = () => ({
  professionalUsername: 'doctor_user',
  allowedScopes: ['8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2'],
  allowedActions: ['READ', 'WRITE'],
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: '2026-12-31T23:59:59.000Z',
  signature: 'grant-signature',
  transformKeys: [
    {
      scopeId: '8f4b8d0e-2d34-4cb3-b94d-7e4c8d1a31f2',
      transformKey: 'transform-key-001',
    },
  ],
});

const buildClinicalPayload = () => ({
  patientUsername: 'patient_user',
  scopeId: 'c91a0f5b-7e72-41df-a8f5-8c0d5b6f991a',
  basedOn: 'record-001',
  signature: 'record-signature',
  payloadMetadata: {
    fhirResourceType: 'Observation',
  },
  encryption: {
    iv: 'iv-value',
    authTag: 'auth-tag-value',
    ciphertext: 'ciphertext-value',
  },
  integrity: {
    payloadHash: 'payload-hash-value',
  },
});

describe('Role authorization integration', () => {
  it('permite que un PATIENT llame POST /permissions/grants', async () => {
    const token = buildToken({
      id: 'patient-id-001',
      pseudoId: 'patient-pseudo-001',
      role: 'PATIENT',
    });

    const response = await request(app)
      .post('/permissions/grants')
      .set('Authorization', `Bearer ${token}`)
      .send(buildGrantPayload());

    expect(response.status).toBe(201);
    expect(response.body.authenticatedUser.role).toBe('PATIENT');
  });

  it('rechaza con 403 a un DOCTOR en POST /permissions/grants', async () => {
    const token = buildToken({
      id: 'doctor-id-001',
      role: 'DOCTOR',
      professionalId: 'COL-001',
    });

    const response = await request(app)
      .post('/permissions/grants')
      .set('Authorization', `Bearer ${token}`)
      .send(buildGrantPayload());

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden for current role');
  });

  it('permite que un PATIENT llame POST /permissions/scope-materials/preflight', async () => {
    const token = buildToken({
      id: 'patient-id-preflight',
      pseudoId: 'patient-pseudo-preflight',
      role: 'PATIENT',
    });

    const response = await request(app)
      .post('/permissions/scope-materials/preflight')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeIds: ['scope-001'] });

    expect(response.status).toBe(200);
    expect(response.body.authenticatedUser.role).toBe('PATIENT');
  });

  it('rechaza con 403 a un DOCTOR en POST /permissions/scope-materials/preflight', async () => {
    const token = buildToken({
      id: 'doctor-id-preflight',
      role: 'DOCTOR',
      professionalId: 'COL-PREFLIGHT',
    });

    const response = await request(app)
      .post('/permissions/scope-materials/preflight')
      .set('Authorization', `Bearer ${token}`)
      .send({ scopeIds: ['scope-001'] });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden for current role');
  });

  it('rechaza con 403 un token valido con rol incorrecto en una ruta protegida por rol', async () => {
    const token = buildToken({
      id: 'doctor-id-002',
      role: 'DOCTOR',
      professionalId: 'COL-002',
    });

    const response = await request(app)
      .get('/clinical-records/history/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden for current role');
  });

  it.each(['DOCTOR', 'PATIENT'])(
    'rechaza la ruta clinica de laboratorio para el rol %s',
    async (role) => {
      const token = buildToken({
        id: `${role.toLowerCase()}-lab-route`,
        pseudoId: role === 'PATIENT' ? 'patient-pseudo-002' : null,
        role,
        professionalId: role === 'PATIENT' ? null : `PRO-${role}`,
      });

      const response = await request(app)
        .post('/clinical-records/events/laboratory')
        .set('Authorization', `Bearer ${token}`)
        .send(buildClinicalPayload());

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden for current role');
    }
  );

  it('permite que un DOCTOR llame GET /clinical-records/scope-material/:patientUsername/:scopeId/access', async () => {
    const token = buildToken({
      id: 'doctor-id-scope-material',
      role: 'DOCTOR',
      professionalId: 'COL-SCOPE',
    });

    const response = await request(app)
      .get('/clinical-records/scope-material/patient_user/scope-001/access')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.authenticatedUser.role).toBe('DOCTOR');
  });

  it('rechaza con 403 a un PATIENT en GET /clinical-records/scope-material/:patientUsername/:scopeId/access', async () => {
    const token = buildToken({
      id: 'patient-id-scope-material',
      pseudoId: 'patient-pseudo-scope-material',
      role: 'PATIENT',
    });

    const response = await request(app)
      .get('/clinical-records/scope-material/patient_user/scope-001/access')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Forbidden for current role');
  });

  it.each(['LABORATORY', 'PATIENT'])(
    'rechaza la ruta clinica de farmacia para el rol %s',
    async (role) => {
      const token = buildToken({
        id: `${role.toLowerCase()}-pharmacy-route`,
        pseudoId: role === 'PATIENT' ? 'patient-pseudo-003' : null,
        role,
        professionalId: role === 'PATIENT' ? null : `PRO-${role}`,
      });

      const response = await request(app)
        .post('/clinical-records/events/pharmacy')
        .set('Authorization', `Bearer ${token}`)
        .send(buildClinicalPayload());

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Forbidden for current role');
    }
  );
});
