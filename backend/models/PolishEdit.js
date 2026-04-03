'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PolishEdit extends Model {
    static associate(models) {
      if (models.Act) {
        PolishEdit.belongsTo(models.Act, {
          foreignKey: 'actId',
          as: 'Act'
        });
      }
      if (models.Polish) {
        PolishEdit.belongsTo(models.Polish, {
          foreignKey: 'polishId',
          as: 'Polish'
        });
      }
    }
  }

  PolishEdit.init({
    actId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Acts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    polishId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Polishes',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    original: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    replacement: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    applied: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    modelUsed: {
      type: DataTypes.STRING,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'PolishEdit',
    tableName: 'PolishEdits',
    timestamps: true
  });

  return PolishEdit;
};
