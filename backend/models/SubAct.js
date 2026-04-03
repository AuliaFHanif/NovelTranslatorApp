'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SubAct extends Model {
    static associate(models) {
      // SubAct belongs to Act
      if (models.Act) {
        SubAct.belongsTo(models.Act, {
          foreignKey: 'actId',
          as: 'Act'
        });
      }

      // SubAct has many TermAppearances
      if (models.TermAppearance) {
        SubAct.hasMany(models.TermAppearance, {
          foreignKey: 'subActId',
          as: 'Appearances',
          onDelete: 'CASCADE'
        });
      }

      // SubAct has many Polishes
      if (models.Polish) {
        SubAct.hasMany(models.Polish, {
          foreignKey: 'subActId',
          as: 'Polishes',
          onDelete: 'CASCADE'
        });
      }
    }
  }

  SubAct.init({
    actId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Acts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 }
    },
    rawText: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    translatedText: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    tokenCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    charCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'SubAct',
    tableName: 'SubActs',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['actId', 'sequence'] }
    ]
  });

  return SubAct;
};
