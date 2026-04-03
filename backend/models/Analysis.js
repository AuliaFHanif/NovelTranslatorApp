'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Analysis extends Model {
    static associate(models) {
      if (models.Act) {
        Analysis.belongsTo(models.Act, {
          foreignKey: 'actId',
          as: 'Act'
        });
      }
    }
  }

  Analysis.init({
    actId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'Acts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    anatomyProfile: {
      type: DataTypes.JSONB,
      allowNull: false
    },
    scope: {
      type: DataTypes.ENUM('act', 'subact'),
      allowNull: false,
      defaultValue: 'act'
    }
  }, {
    sequelize,
    modelName: 'Analysis',
    tableName: 'Analysis',
    timestamps: true
  });

  return Analysis;
};
