const { User, Role, Status } = require('../models/persistence/user.schema');

class IdentityRepository {
  async createUser(userData) {
    try {
      const user = await User.create(userData);
      // Fetch the created user with associations
      const createdUser = await User.findByPk(user.id, {
        include: [
          { model: Role, as: 'role' },
          { model: Status, as: 'status' }
        ]
      });
      return createdUser;
    } catch (error) {
      throw error;
    }
  }

  async findByEmail(email) {
    try {
      return await this.findAuthUserByEmail(email);
    } catch (error) {
      throw new Error(`Error finding user by email: ${error.message}`);
    }
  }

  async findAuthUserByEmail(email) {
    try {
      const user = await User.findOne({
        where: { email },
        include: [
          { model: Role, as: 'role' },
          { model: Status, as: 'status' }
        ]
      });
      return user;
    } catch (error) {
      throw new Error(`Error finding auth user by email: ${error.message}`);
    }
  }

  async findByUsername(username) {
    try {
      const user = await User.findOne({
        where: { username },
        include: [
          { model: Role, as: 'role' },
          { model: Status, as: 'status' }
        ]
      });
      return user;
    } catch (error) {
      throw new Error(`Error finding user by username: ${error.message}`);
    }
  }

  async findByPseudoId(pseudoId) {
    try {
      const user = await User.findOne({
        where: { pseudo_id: pseudoId },
        include: [
          { model: Role, as: 'role' },
          { model: Status, as: 'status' }
        ]
      });
      return user;
    } catch (error) {
      throw new Error(`Error finding user by pseudo_id: ${error.message}`);
    }
  }

  async findByProfessionalId(professionalId) {
    try {
      const user = await User.findOne({
        where: { professional_id: professionalId },
        include: [
          { model: Role, as: 'role' },
          { model: Status, as: 'status' }
        ]
      });
      return user;
    } catch (error) {
      throw new Error(`Error finding user by professional_id: ${error.message}`);
    }
  }
}

module.exports = IdentityRepository;
