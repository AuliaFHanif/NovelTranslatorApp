'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TermAppearance extends Model {
    static associate(models) {
      if (models.GlossaryTerm) {
        TermAppearance.belongsTo(models.GlossaryTerm, { 
          foreignKey: 'termId',
          as: 'Term'
        });
      }

      if (models.Act) {
        TermAppearance.belongsTo(models.Act, { 
          foreignKey: 'actId',
          as: 'Act'
        });
      }

      if (models.SubAct) {
        TermAppearance.belongsTo(models.SubAct, { 
          foreignKey: 'subActId',
          as: 'SubAct'
        });
      }
    }
  }

  TermAppearance.init({
    termId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'GlossaryTerms',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    actId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'Acts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    subActId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'SubActs',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    contextSnippet: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    confidence: {
      type: DataTypes.FLOAT,
      defaultValue: 1.0
    },
    frequency: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    }
  }, {
    sequelize,
    modelName: 'TermAppearance',
    tableName: 'TermAppearances',
    timestamps: true,
    validate: {
      eitherActOrSubAct() {
        if (!this.actId && !this.subActId) {
          throw new Error('Either actId or subActId must be set');
        }
      }
    },
    indexes: [
      { unique: true, fields: ['termId', 'actId', 'subActId'] },
      { fields: ['termId'] },
      { fields: ['actId'] },
      { fields: ['subActId'] }
    ]
  });

  return TermAppearance;
};
