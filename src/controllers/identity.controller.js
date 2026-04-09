const IdentityService = require('../services/identity/identity.service');

class IdentityController {
  constructor() {
    this.identityService = new IdentityService();
  }

  async register(req, res) {
    try {
      const userData = req.body;

      // Validar campos requeridos básicos
      const requiredFields = [
        'username', 'email', 'password', 'cui_hash', 'first_name', 'middle_name',
        'first_last_name', 'second_last_name', 'role', 'public_key',
        'encrypted_private_key_by_password', 'password_kdf_salt',
        'encrypted_private_key_by_recovery', 'recovery_kdf_salt', 'recovery_key_hash'
      ];

      for (const field of requiredFields) {
        if (!userData[field]) {
          return res.status(400).json({ error: `Missing required field: ${field}` });
        }
      }

      const user = await this.identityService.registerUser(userData);

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          pseudo_id: user.pseudo_id,
          professional_id: user.professional_id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          role: user.role.name,
          status: user.status.name,
          created_at: user.created_at,
        }
      });
    } catch (error) {
      console.log('Error type:', error.name, 'Message:', error.message);
      if (error.message === 'Email already exists') {
        return res.status(409).json({ error: error.message });
      }
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ error: 'Unique constraint violation: ' + error.errors.map(e => e.path).join(', ') });
      }
      if (error.name === 'SequelizeValidationError') {
        return res.status(400).json({ error: 'Validation error: ' + error.errors.map(e => e.message).join(', ') });
      }
      if (error.message.includes('Invalid role') || error.message.includes('professional_id is required')) {
        return res.status(400).json({ error: error.message });
      }
      console.error('Error registering user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Missing required field: email' });
      }

      if (!password) {
        return res.status(400).json({ error: 'Missing required field: password' });
      }

      const user = await this.identityService.loginUser({ email, password });

      return res.status(200).json({
        message: 'Login successful',
        user,
      });
    } catch (error) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      console.error('Error logging in user:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = IdentityController;
