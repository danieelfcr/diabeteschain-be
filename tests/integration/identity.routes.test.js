const crypto = require('crypto');
const bcrypt = require('bcrypt');
const request = require('supertest');

const app = require('../../src/app');
const {
  User,
  Role,
  Status,
  Patient,
  Professional,
} = require('../../src/models/persistence/user.schema');
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

  const user = await User.create({
    username: overrides.username || uniqueValue('user'),
    email: overrides.email || `${uniqueValue('user')}@example.com`,
    passwordHash: passwordHash,
    cuiHash: overrides.cuiHash || uniqueValue('cui'),
    birthDate: overrides.birthDate || '1990-01-15',
    firstName: overrides.firstName || 'Test',
    middleName: overrides.middleName || 'Middle',
    firstLastName: overrides.firstLastName || 'User',
    secondLastName: overrides.secondLastName || 'Lastname',
    roleId: roleId,
    statusId: statusId,
    publicKey: overrides.publicKey === undefined ? 'public-key-value' : overrides.publicKey,
    encryptedPrivateKeyByPassword: overrides.encryptedPrivateKeyByPassword || 'enc-private-password',
    passwordKdfSalt: overrides.passwordKdfSalt || 'password-salt',
    encryptedPrivateKeyByRecovery: overrides.encryptedPrivateKeyByRecovery || 'enc-private-recovery',
    recoveryKdfSalt: overrides.recoveryKdfSalt || 'recovery-salt',
    recoveryKeyHash: overrides.recoveryKeyHash || uniqueValue('recovery'),
  });

  if (roleName === 'PATIENT') {
    await Patient.create({
      userId: user.id,
      pseudoId: overrides.pseudoId === undefined ? crypto.randomUUID() : overrides.pseudoId,
    });
  } else {
    await Professional.create({
      userId: user.id,
      professionalId: overrides.professionalId === undefined ? uniqueValue('PRO') : overrides.professionalId,
      organizationId: overrides.organizationId || 'hospital-general',
    });
  }

  return user;
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
      expect(persistedUser.birthDate).toBe('1990-01-15');
      expect(persistedUser.passwordHash).not.toBe('StrongPassword123!');
    });

    it('debe registrar un paciente sin segundo nombre', async () => {
      const payload = buildRegisterPayload();
      delete payload.middleName;

      const response = await request(app)
        .post('/auth/register')
        .send(payload);

      expect(response.status).toBe(201);

      const persistedUser = await User.findOne({ where: { email: 'patient@example.com' } });
      expect(persistedUser).not.toBeNull();
      expect(persistedUser.middleName).toBeNull();
    });

    it('debe fallar con 400 si no recibe fecha de nacimiento', async () => {
      const payload = buildRegisterPayload();
      delete payload.birthDate;

      const response = await request(app)
        .post('/auth/register')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('birthDate');
    });

    it('debe fallar con 400 si recibe una fecha de nacimiento invalida', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload({ birthDate: '1990-02-31' }));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('birthDate');
    });

    it('debe fallar con 400 si el username tiene menos de 3 caracteres', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload({ username: 'ab' }));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('username');
    });

    it('debe fallar con 400 si el username tiene mas de 30 caracteres', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload({ username: 'a'.repeat(31) }));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('username');
    });

    it('debe generar pseudoId automaticamente si role = PATIENT', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      expect(response.status).toBe(201);
      expect(response.body.user.pseudoId).toEqual(expect.stringMatching(/^[0-9a-f-]{36}$/i));

      const persistedUser = await User.findOne({ where: { email: 'patient@example.com' } });
      const persistedPatient = await Patient.findOne({ where: { userId: persistedUser.id } });
      const persistedProfessional = await Professional.findOne({ where: { userId: persistedUser.id } });
      expect(persistedPatient.pseudoId).toBe(response.body.user.pseudoId);
      expect(persistedProfessional).toBeNull();
    });

    it('debe registrar correctamente un profesional con professionalId', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(
          buildRegisterPayload({
            username: 'doctor_user',
            email: 'doctor@example.com',
            cuiHash: 'cui-hash-002',
            role: 'DOCTOR',
            professionalId: 'COL-12345',
            organizationId: 'hospital-general',
            recoveryKeyHash: 'recovery-hash-002',
          })
        );

      expect(response.status).toBe(201);
      expect(response.body.user.professionalId).toBe('COL-12345');
      expect(response.body.user.organization).toEqual({
        id: 'hospital-general',
        name: 'Hospital General',
      });
      expect(response.body.user.role).toBe('DOCTOR');

      const persistedUser = await User.findOne({ where: { email: 'doctor@example.com' } });
      const persistedProfessional = await Professional.findOne({ where: { userId: persistedUser.id } });
      const persistedPatient = await Patient.findOne({ where: { userId: persistedUser.id } });
      expect(persistedProfessional.professionalId).toBe('COL-12345');
      expect(persistedProfessional.organizationId).toBe('hospital-general');
      expect(persistedPatient).toBeNull();
    });

    it('debe fallar con 400 si el profesional no envia professionalId', async () => {
      const payload = buildRegisterPayload({
        username: 'lab_user',
        email: 'lab@example.com',
        cuiHash: 'cui-hash-003',
        role: 'LABORATORY',
        organizationId: 'laboratorio-central',
        recoveryKeyHash: 'recovery-hash-003',
      });

      delete payload.professionalId;

      const response = await request(app)
        .post('/auth/register')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('El ID profesional es obligatorio para los roles que no son pacientes.');
    });

    it('debe fallar con 400 si el profesional no envia organizationId', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(
          buildRegisterPayload({
            username: 'pharmacy_user',
            email: 'pharmacy@example.com',
            cuiHash: 'cui-hash-006',
            role: 'PHARMACIST',
            professionalId: 'FAR-12345',
            recoveryKeyHash: 'recovery-hash-006',
          })
        );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('La organización es obligatoria para los roles que no son pacientes.');
    });

    it('debe fallar con 409 si el email ya existe', async () => {
      const payload = buildRegisterPayload();

      await request(app).post('/auth/register').send(payload);
      const response = await request(app).post('/auth/register').send({
        ...payload,
        username: 'patient_user_2',
        cuiHash: 'cui-hash-004',
        recoveryKeyHash: 'recovery-hash-004',
      });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('Ya existe una cuenta registrada con este correo electrónico.');
    });

    it('debe guardar password hasheada, no en texto plano', async () => {
      await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      const persistedUser = await User.findOne({ where: { email: 'patient@example.com' } });
      expect(persistedUser.passwordHash).toBeDefined();
      expect(persistedUser.passwordHash).not.toBe('StrongPassword123!');
      expect(await bcrypt.compare('StrongPassword123!', persistedUser.passwordHash)).toBe(true);
    });

    it('debe responder 201 cuando el registro sea exitoso', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      expect(response.status).toBe(201);
    });

    it('no debe retornar passwordHash en la respuesta', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send(buildRegisterPayload());

      expect(response.status).toBe(201);
      expect(response.body.user.passwordHash).toBeUndefined();
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
      expect(response.body.tokenType).toBe('Bearer');
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.expiresIn).toBe(process.env.JWT_ACCESS_EXPIRES_IN);
      expect(response.body.user.email).toBe('patient@example.com');
      expect(response.body.user.role).toBe('PATIENT');
    });

    it('debe autenticar correctamente con el nombre de usuario', async () => {
      await request(app).post('/auth/register').send(buildRegisterPayload());

      const response = await request(app)
        .post('/auth/login')
        .send({ identifier: 'patient_user', password: 'StrongPassword123!' });

      expect(response.status).toBe(200);
      expect(response.body.user.username).toBe('patient_user');
    });

    it('debe retornar 401 si el email no existe', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'missing@example.com', password: 'StrongPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Las credenciales son inválidas.');
    });

    it('debe retornar 401 si la contrasena es incorrecta', async () => {
      await request(app).post('/auth/register').send(buildRegisterPayload());

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'patient@example.com', password: 'WrongPassword123!' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Las credenciales son inválidas.');
    });

    it('debe retornar 403 si el usuario no esta ACTIVE', async () => {
      await createUser({
        email: 'inactive@example.com',
        username: 'inactive_user',
        cuiHash: 'cui-hash-005',
        recoveryKeyHash: 'recovery-hash-005',
        statusName: 'INACTIVE',
        password: 'StrongPassword123!',
      });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'inactive@example.com', password: 'StrongPassword123!' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('El usuario está inactivo o bloqueado.');
    });

    it('no debe retornar passwordHash', async () => {
      await request(app).post('/auth/register').send(buildRegisterPayload());

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'patient@example.com', password: 'StrongPassword123!' });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.user.passwordHash).toBeUndefined();
    });
  });

  describe('GET /auth/organizations', () => {
    it('debe retornar el catalogo de organizaciones', async () => {
      const response = await request(app).get('/auth/organizations');

      expect(response.status).toBe(200);
      expect(response.body.organizations).toEqual(
        expect.arrayContaining([
          { id: 'hospital-general', name: 'Hospital General' },
          { id: 'laboratorio-central', name: 'Laboratorio Central' },
        ])
      );
    });
  });

  describe('GET /auth/users/:username/public-key', () => {
    it('debe retornar la publicKey de un profesional existente', async () => {
      const user = await createUser({
        roleName: 'DOCTOR',
        username: 'doctor_public_key_user',
        pseudoId: null,
        professionalId: 'COL-67890',
        publicKey: 'doctor-public-key',
      });

      const response = await request(app).get(`/auth/users/${user.username}/public-key`);

      expect(response.status).toBe(200);
      expect(response.body.user.username).toBe(user.username);
      expect(response.body.user.id).toBeUndefined();
      expect(response.body.user.publicKey).toBe('doctor-public-key');
      expect(response.body.user.role).toBe('DOCTOR');
    });

    it('debe retornar 404 si el usuario no existe', async () => {
      const response = await request(app).get('/auth/users/missing_doctor/public-key');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Usuario no encontrado.');
    });

    it('debe retornar 404 si el usuario existe pero no tiene publicKey', async () => {
      const user = await createUser({
        roleName: 'DOCTOR',
        username: 'doctor_without_key',
        pseudoId: null,
        professionalId: 'COL-22222',
        publicKey: '',
      });

      const response = await request(app).get(`/auth/users/${user.username}/public-key`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('No se encontró una llave pública para este usuario.');
    });
  });

  describe('GET /auth/patients/:username/public-key', () => {
    it('debe retornar la publicKey de un paciente existente', async () => {
      const user = await createUser({
        roleName: 'PATIENT',
        username: 'patient_public_key_user',
        pseudoId: '11111111-1111-4111-8111-111111111111',
        professionalId: null,
        publicKey: 'patient-public-key-2',
      });

      const response = await request(app).get(`/auth/patients/${user.username}/public-key`);

      expect(response.status).toBe(200);
      expect(response.body.user.username).toBe(user.username);
      expect(response.body.user.pseudoId).toBeUndefined();
      expect(response.body.user.publicKey).toBe('patient-public-key-2');
      expect(response.body.user.role).toBe('PATIENT');
    });

    it('debe retornar 404 si el paciente no existe', async () => {
      const response = await request(app).get('/auth/patients/missing_patient/public-key');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Usuario no encontrado.');
    });

    it('debe retornar 404 si el paciente existe pero no tiene publicKey', async () => {
      const user = await createUser({
        roleName: 'PATIENT',
        username: 'patient_without_key',
        pseudoId: '33333333-3333-4333-8333-333333333333',
        professionalId: null,
        publicKey: '',
      });

      const response = await request(app).get(`/auth/patients/${user.username}/public-key`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('No se encontró una llave pública para este usuario.');
    });
  });
});
