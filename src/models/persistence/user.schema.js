const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const identityStorage = process.env.IDENTITY_DB_STORAGE || path.join(__dirname, '../../../data/Identity.sqlite');

/**
 * Sequelize instance configured for the identity persistence store.
 */
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: identityStorage,
  logging: false,
  define: {
    timestamps: true,
    underscored: true,
  },
});

/**
 * Catalog table for user roles.
 * Defines valid role names for identity users.
 */
const Role = sequelize.define(
  'Role',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.ENUM('PATIENT', 'DOCTOR', 'LABORATORY', 'PHARMACIST', 'ADMIN'),
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: 'roles',
    timestamps: false,
  }
);

/**
 * Catalog table for user statuses.
 * Defines valid state values for identity users.
 */
const Status = sequelize.define(
  'Status',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: 'statuses',
    timestamps: false,
  }
);

/**
 * User model representing identity domain users.
 * Includes personal information, authentication metadata, and references to role/status.
 */
const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    pseudoId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'pseudo_id',
    },
    professionalId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'professional_id',
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'password_hash',
    },
    cuiHash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'cui_hash',
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'first_name',
    },
    middleName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'middle_name',
    },
    firstLastName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'first_last_name',
    },
    secondLastName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'second_last_name',
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id',
      },
      field: 'role_id',
    },
    statusId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'statuses',
        key: 'id',
      },
      field: 'status_id',
    },
    publicKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'public_key',
    },
    encryptedPrivateKeyByPassword: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'encrypted_private_key_by_password',
    },
    passwordKdfSalt: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'password_kdf_salt',
    },
    encryptedPrivateKeyByRecovery: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'encrypted_private_key_by_recovery',
    },
    recoveryKdfSalt: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'recovery_kdf_salt',
    },
    recoveryKeyHash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'recovery_key_hash',
    },
  },
  {
    tableName: 'users',
    timestamps: true,
  }
);

// Define associations between user, role, and status models.
User.belongsTo(Role, {
  foreignKey: 'roleId',
  as: 'role',
});

User.belongsTo(Status, {
  foreignKey: 'statusId',
  as: 'status',
});

Role.hasMany(User, {
  foreignKey: 'roleId',
  as: 'users',
});

Status.hasMany(User, {
  foreignKey: 'statusId',
  as: 'users',
});

module.exports = {
  sequelize,
  User,
  Role,
  Status,
};
