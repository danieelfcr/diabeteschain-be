const request = require('supertest');

jest.mock('../../src/controllers/clinicalRecord.controller', () =>
  jest.fn().mockImplementation(() => ({
    getMyHistory(req, res) {
      return res.status(200).json({
        message: 'Protected route reached',
        authenticatedUser: req.user,
      });
    },
    getProfessionalHistory(req, res) {
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
const {
  initializeTestDatabase,
  resetTestDatabase,
  closeTestDatabase,
} = require('../setup/testDb');

const buildRegisterPayload = (overrides = {}) => ({
  username: 'patient_user',
  email: 'patient@example.com',
  password: 'StrongPassword123!',
  cuiHash: 'cui-hash-001',
  birthDate: '1990-01-15',
  firstName: 'Ana',
  middleName: 'Maria',
  firstLastName: 'Lopez',
  secondLastName: 'Perez',
  role: 'PATIENT',
  publicKey: 'patient-public-key',
  encryptedPrivateKeyByPassword: 'enc-private-password',
  passwordKdfSalt: 'password-salt',
  encryptedPrivateKeyByRecovery: 'enc-private-recovery',
  recoveryKdfSalt: 'recovery-salt',
  recoveryKeyHash: 'recovery-hash-001',
  ...overrides,
});

beforeAll(async () => {
  await initializeTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('JWT authentication integration', () => {
  it('debe responder 401 si un endpoint protegido no recibe Authorization', async () => {
    const response = await request(app).get('/clinical-records/history/me');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication token is required');
  });

  it('debe responder 401 si un endpoint protegido recibe un Bearer token invalido', async () => {
    const response = await request(app)
      .get('/clinical-records/history/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid authentication token');
  });

  it('debe permitir acceso con un token valido y poblar req.user', async () => {
    await request(app)
      .post('/auth/register')
      .send(buildRegisterPayload());

    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ email: 'patient@example.com', password: 'StrongPassword123!' });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.accessToken).toEqual(expect.any(String));

    const response = await request(app)
      .get('/clinical-records/history/me')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Protected route reached');
    expect(response.body.authenticatedUser).toEqual({
      id: loginResponse.body.user.id,
      pseudoId: loginResponse.body.user.pseudoId,
      role: loginResponse.body.user.role,
      email: loginResponse.body.user.email,
      professionalId: loginResponse.body.user.professionalId,
      username: loginResponse.body.user.username,
      exp: expect.any(Number),
    });
  });
});
