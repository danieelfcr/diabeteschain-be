const crypto = require('crypto');
const bcrypt = require('bcrypt');
const request = require('supertest');

const app = require('../../src/app');
const { User, Role, Status } = require('../../src/models/persistence/user.schema');
const {
  initializeTestDatabase,
  resetTestDatabase,
  closeTestDatabase,
} = require('../setup/testDb');

const buildRegisterPayload = (overrides = {}) => ({
  username: 'patient_user',
  email: 'patient@example.com',
  password: 'StrongPassword123!',
  cui_hash: 'cui-hash-001',
  first_name: 'Ana',
  middle_name: 'Maria',
  first_last_name: 'Lopez',
  second_last_name: 'Perez',
  role: 'PATIENT',
  public_key: 'patient-public-key',
  encrypted_private_key_by_password: 'enc-private-password',
  password_kdf_salt: 'password-salt',
  encrypted_private_key_by_recovery: 'enc-private-recovery',
  recovery_kdf_salt: 'recovery-salt',
  recovery_key_hash: 'recovery-hash-001',
  ...overrides,
});

const uniqueValue = (prefix) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`;

const getRoleId = async (name) => {
  const role = await Role.findOne({ where: { name } });
  return role.id;
};

const getStatusId = async (name) => {
  const status = await Status.findOne({ where: { name } });
  return status.id;
};

const createUser = async (overrides = {}) => {
  const roleName = overrides.roleName || 'PATIENT';
  const statusName = overrides.statusName || 'ACTIVE';
  const password = overrides.password || 'StrongPassword123!';
  const roleId = await getRoleId(roleName);
  const statusId = await getStatusId(statusName);
  const passwordHash = await bcrypt.hash(password, 10);

  return User.create({
    username: overrides.username || uniqueValue('user'),
    email: overrides.email || `${uniqueValue('user')}@example.com`,
    password_hash: passwordHash,
    cui_hash: overrides.cui_hash || uniqueValue('cui'),
    first_name: overrides.first_name || 'Test',
    middle_name: overrides.middle_name || 'Middle',
    first_last_name: overrides.first_last_name || 'User',
    second_last_name: overrides.second_last_name || 'Lastname',
    role_id: roleId,
    status_id: statusId,
    pseudo_id:
      overrides.pseudo_id === undefined ? (roleName === 'PATIENT' ? crypto.randomUUID() : null) : overrides.pseudo_id,
    professional_id:
      overrides.professional_id === undefined ? (roleName === 'PATIENT' ? null : uniqueValue('PRO')) : overrides.professional_id,
    public_key: overrides.public_key === undefined ? 'public-key-value' : overrides.public_key,
    encrypted_private_key_by_password: overrides.encrypted_private_key_by_password || 'enc-private-password',
    password_kdf_salt: overrides.password_kdf_salt || 'password-salt',
    encrypted_private_key_by_recovery: overrides.encrypted_private_key_by_recovery || 'enc-private-recovery',
    recovery_kdf_salt: overrides.recovery_kdf_salt || 'recovery-salt',
    recovery_key_hash: overrides.recovery_key_hash || uniqueValue('recovery'),
  });
};

beforeAll(async () => {
  await initializeTestDatabase();
});

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});

describe('Identity routes integration', () => {
  describe('POST /auth/register', () => {
    it('debe registrar correctamente un paciente', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.user.email).toBe('patient@example.com');
      expect(response.body.user.role).toBe('PATIENT');

      const persistedUser = await User.findOne({ where: { email: 'patient@example.com' } });
      expect(persistedUser).not.toBeNull();
      expect(persistedUser.password_hash).not.toBe('StrongPassword123!');
    });

    it('debe generar pseudo_id automaticamente si role = PATIENT', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      expect(response.status).toBe(201);
      expect(response.body.user.pseudo_id).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i));

      const persistedUser = await User.findOne({ where: { email: 'patient@example.com' } });
      expect(persistedUser.pseudo_id).toBe(response.body.user.pseudo_id);
      expect(persistedUser.professional_id).toBeNull();
    });

    it('debe registrar correctamente un profesional con professional_id', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(
          buildRegisterPayload({
            username: 'doctor_user',
            email: 'doctor@example.com',
            cui_hash: 'cui-hash-002',
            role: 'DOCTOR',
            professional_id: 'COL-12345',
            recovery_key_hash: 'recovery-hash-002',
          })
        );

      expect(response.status).toBe(201);
      expect(response.body.user.professional_id).toBe('COL-12345');
      expect(response.body.user.role).toBe('DOCTOR');

      const persistedUser = await User.findOne({ where: { email: 'doctor@example.com' } });
      expect(persistedUser.professional_id).toBe('COL-12345');
      expect(persistedUser.pseudo_id).toBeNull();
    });

    it('debe fallar con 400 si el profesional no envia professional_id', async () => {
      const payload = buildRegisterPayload({
        username: 'lab_user',
        email: 'lab@example.com',
        cui_hash: 'cui-hash-003',
        role: 'LABORATORY',
        recovery_key_hash: 'recovery-hash-003',
      });

      delete payload.professional_id;

      const response = await request(app)
        .post('/auth/register')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('professional_id is required');
    });

    it('debe fallar con 409 si el email ya existe', async () => {
      const payload = buildRegisterPayload();

      await request(app).post('/auth/register').send(payload);
      const response = await request(app).post('/auth/register').send({
        ...payload,
        username: 'patient_user_2',
        cui_hash: 'cui-hash-004',
        recovery_key_hash: 'recovery-hash-004',
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Email already exists');
    });

    it('debe guardar password hasheada, no en texto plano', async () => {
      await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      const persistedUser = await User.findOne({ where: { email: 'patient@example.com' } });
      expect(persistedUser.password_hash).toBeDefined();
      expect(persistedUser.password_hash).not.toBe('StrongPassword123!');
      expect(await bcrypt.compare('StrongPassword123!', persistedUser.password_hash)).toBe(true);
    });

    it('debe responder 201 cuando el registro sea exitoso', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      expect(response.status).toBe(201);
    });

    it('no debe retornar password_hash en la respuesta', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      expect(response.status).toBe(201);
      expect(response.body.user.password_hash).toBeUndefined();
    });
  });

  describe('POST /auth/login', () => {
    it('debe autenticar correctamente con credenciales validas', async () => {
      await request(app).post('/auth/register').send(buildRegisterPayload());

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'patient@example.com', password: 'StrongPassword123!' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.user.email).toBe('patient@example.com');
      expect(response.body.user.role).toBe('PATIENT');
    });

    it('debe retornar 401 si el email no existe', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'missing@example.com', password: 'StrongPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('debe retornar 401 si la contrasena es incorrecta', async () => {
      await request(app).post('/auth/register').send(buildRegisterPayload());

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'patient@example.com', password: 'WrongPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('debe retornar 403 si el usuario no esta ACTIVE', async () => {
      await createUser({
        email: 'inactive@example.com',
        username: 'inactive_user',
        cui_hash: 'cui-hash-005',
        recovery_key_hash: 'recovery-hash-005',
        statusName: 'INACTIVE',
        password: 'StrongPassword123!',
      });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'inactive@example.com', password: 'StrongPassword123!' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('User is inactive or blocked');
    });

    it('no debe retornar password_hash', async () => {
      await request(app).post('/auth/register').send(buildRegisterPayload());

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'patient@example.com', password: 'StrongPassword123!' });

      expect(response.status).toBe(200);
      expect(response.body.user.password_hash).toBeUndefined();
    });
  });

  describe('GET /auth/users/:id/public-key', () => {
    it('debe retornar la public_key de un profesional existente', async () => {
      const user = await createUser({
        roleName: 'DOCTOR',
        pseudo_id: null,
        professional_id: 'COL-67890',
        public_key: 'doctor-public-key',
      });

      const response = await request(app).get(`/auth/users/${user.id}/public-key`);

      expect(response.status).toBe(200);
      expect(response.body.user.id).toBe(user.id);
      expect(response.body.user.public_key).toBe('doctor-public-key');
      expect(response.body.user.role).toBe('DOCTOR');
    });

    it('debe retornar 404 si el usuario no existe', async () => {
      const response = await request(app).get('/auth/users/11111111-1111-4111-8111-111111111111/public-key');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('debe retornar 404 si el usuario existe pero no tiene public_key', async () => {
      const user = await createUser({
        roleName: 'DOCTOR',
        pseudo_id: null,
        professional_id: 'COL-22222',
        public_key: '',
      });

      const response = await request(app).get(`/auth/users/${user.id}/public-key`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Public key not found for this user');
    });
  });

  describe('GET /auth/patients/:pseudoId/public-key', () => {
    it('debe retornar la public_key de un paciente existente', async () => {
      const user = await createUser({
        roleName: 'PATIENT',
        pseudo_id: '11111111-1111-4111-8111-111111111111',
        professional_id: null,
        public_key: 'patient-public-key-2',
      });

      const response = await request(app).get(`/auth/patients/${user.pseudo_id}/public-key`);

      expect(response.status).toBe(200);
      expect(response.body.user.pseudo_id).toBe(user.pseudo_id);
      expect(response.body.user.public_key).toBe('patient-public-key-2');
      expect(response.body.user.role).toBe('PATIENT');
    });

    it('debe retornar 404 si el paciente no existe', async () => {
      const response = await request(app).get('/auth/patients/22222222-2222-4222-8222-222222222222/public-key');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('User not found');
    });

    it('debe retornar 404 si el paciente existe pero no tiene public_key', async () => {
      const user = await createUser({
        roleName: 'PATIENT',
        pseudo_id: '33333333-3333-4333-8333-333333333333',
        professional_id: null,
        public_key: '',
      });

      const response = await request(app).get(`/auth/patients/${user.pseudo_id}/public-key`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Public key not found for this user');
    });
  });
});
