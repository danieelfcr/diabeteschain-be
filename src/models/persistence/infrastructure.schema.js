const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../../data/Infrastructure.sqlite'),
  logging: false,
  define: {
    timestamps: true,
    underscored: true,
  },
});

// ProxyNode Model
const ProxyNode = sequelize.define(
  'ProxyNode',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    endpoint_url: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    status: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true, // ACTIVE: true (1), INACTIVE: false (0)
    },
  },
  {
    tableName: 'proxy_nodes',
    timestamps: true,
  }
);

module.exports = {
  sequelize,
  ProxyNode,
};