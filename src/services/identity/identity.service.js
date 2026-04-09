const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Role, Status } = require('../../models/persistence/user.schema');
const IdentityRepository = require('../../repositories/identity.repository');

class IdentityService {
  constructor() {
    this.repository = new IdentityRepository();
  }

  sanitizeUser(user) {
    return {
      id: user.id,
      pseudo_id: user.pseudo_id,
      username: user.username,
      email: user.email,
      role: user.role?.name || null,
      professional_id: user.professional_id,
      status: user.status?.name || null,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  createAuthError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  async registerUser(userData) {
    const { role, professional_id, email, password, ...otherFields } = userData;

    // Validar rol
    const allowedRoles = ['PATIENT', 'DOCTOR', 'PHARMACIST', 'LABORATORY'];
    if (!allowedRoles.includes(role)) {
      throw new Error('Invalid role. Allowed roles: PATIENT, DOCTOR, PHARMACIST, LABORATORY');
    }

    // Lógica para pseudo_id y professional_id
    let pseudo_id = null;
    if (role === 'PATIENT') {
      pseudo_id = crypto.randomUUID();
    } else {
      if (!professional_id) {
        throw new Error('professional_id is required for non-PATIENT roles');
      }
    }

    // Verificar email único
    const existingUser = await this.repository.findByEmail(email);
    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Hashear contraseña
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Obtener role_id
    const roleRecord = await Role.findOne({ where: { name: role } });
    if (!roleRecord) {
      throw new Error('Role not found');
    }
    const role_id = roleRecord.id;

    // Obtener status_id para ACTIVE
    const statusRecord = await Status.findOne({ where: { name: 'ACTIVE' } });
    if (!statusRecord) {
      throw new Error('Status ACTIVE not found');
    }
    const status_id = statusRecord.id;

    // Preparar datos para crear usuario
    const newUserData = {
      ...otherFields,
      pseudo_id,
      professional_id: role === 'PATIENT' ? null : professional_id,
      email,
      password_hash,
      role_id,
      status_id,
    };

    // Crear usuario
    const user = await this.repository.createUser(newUserData);
    return user;
  }

  async loginUser(credentials) {
    const { email, password } = credentials;

    const user = await this.repository.findAuthUserByEmail(email);
    if (!user) {
      throw this.createAuthError('Invalid credentials', 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw this.createAuthError('Invalid credentials', 401);
    }

    if (user.status?.name !== 'ACTIVE') {
      throw this.createAuthError('User is inactive or blocked', 403);
    }

    return this.sanitizeUser(user);
  }
}

module.exports = IdentityService;
