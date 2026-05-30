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

      if (models.Scene) {
        TermAppearance.belongsTo(models.Scene, { 
          foreignKey: 'sceneId',
          as: 'Scene'
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
    sceneId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Scenes',
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
    indexes: [
      { unique: true, fields: ['termId', 'sceneId'] },
      { fields: ['termId'] },
      { fields: ['sceneId'] }
    ]
  });

  return TermAppearance;
};
