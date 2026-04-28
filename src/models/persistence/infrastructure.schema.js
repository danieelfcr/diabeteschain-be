const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.INFRASTRUCTURE_DB_STORAGE || path.join(__dirname, '../../../data/Infrastructure.sqlite'),
  logging: false,
  define: {
    timestamps: true,
    underscored: true,
  },
});

/**
 * Proxy node model for infrastructure persistence.
 * Stores encrypted endpoint information and current availability state.
 */
const ProxyNode = sequelize.define(
  'ProxyNode',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    encryptedBaseUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'encrypted_base_url',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  },
  {
    tableName: 'proxy_nodes',
    timestamps: true,
  }
);

/**
 * Off-chain clinical scope catalog stored in the infrastructure database.
 *
 * The ledger only handles opaque scope identifiers. Human-readable clinical
 * labels remain off-chain and are stored encrypted to reduce semantic
 * disclosure if auxiliary storage is exposed.
 */
const ScopeCatalog = sequelize.define(
  'ScopeCatalog',
  {
    scopeId: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      field: 'scope_id',
    },
    labelEnc: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'label_enc',
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
  },
  {
    tableName: 'scope_catalog',
    timestamps: true,
  }
);

module.exports = {
  sequelize,
  ProxyNode,
  ScopeCatalog,
};
