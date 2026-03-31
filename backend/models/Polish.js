'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Polish extends Model {
    static associate(models) {
      if (models.Act) {
        Polish.belongsTo(models.Act, {
          foreignKey: 'actId',
          as: 'Act'
        });
      }
      if (models.PolishEdit) {
        Polish.hasMany(models.PolishEdit, {
          foreignKey: 'polishId',
          as: 'Edits',
          onDelete: 'CASCADE'
        });
      }
    }
  }

  Polish.init({
    actId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Acts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    modelUsed: {
      type: DataTypes.STRING,
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    editCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    appliedCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    sequelize,
    modelName: 'Polish',
    tableName: 'Polishes',
    timestamps: true
  });

  return Polish;
};
