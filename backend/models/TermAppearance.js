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
    }
  }

  TermAppearance.init({
    termId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'GlossaryTerms',
        key: 'id'
      }
    },
    actId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Acts',
        key: 'id'
      }
    },
    contextSentence: DataTypes.TEXT,
    contextPosition: DataTypes.INTEGER,
    extractedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    confidence: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'TermAppearance',
    tableName: 'TermAppearances',
    timestamps: false,  // No updatedAt needed
    indexes: [
      { unique: true, fields: ['termId', 'actId'] },
      { fields: ['termId'] },
      { fields: ['actId'] }
    ]
  });

  return TermAppearance;
};
