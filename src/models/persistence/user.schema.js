const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

/**
 * Sequelize instance configured for the identity persistence store.
 */
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../../data/Identity.sqlite'),
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
    pseudo_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    professional_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
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
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    cui_hash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    first_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    middle_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    first_last_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    second_last_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'roles',
        key: 'id',
      },
    },
    status_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'statuses',
        key: 'id',
      },
    },
    public_key: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    encrypted_private_key_by_password: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    password_kdf_salt: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    encrypted_private_key_by_recovery: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    recovery_kdf_salt: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    recovery_key_hash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: 'users',
    timestamps: true,
  }
);

// Define associations between user, role, and status models.
User.belongsTo(Role, {
  foreignKey: 'role_id',
  as: 'role',
});

User.belongsTo(Status, {
  foreignKey: 'status_id',
  as: 'status',
});

Role.hasMany(User, {
  foreignKey: 'role_id',
  as: 'users',
});

Status.hasMany(User, {
  foreignKey: 'status_id',
  as: 'users',
});

module.exports = {
  sequelize,
  User,
  Role,
  Status,
};
