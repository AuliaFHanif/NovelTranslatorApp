'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Scene extends Model {
    static associate(models) {
      Scene.belongsTo(models.Chapter, {
        foreignKey: 'chapterId',
        as: 'Chapter'
      });
      
      // Scene-level glossary appearances
      Scene.hasMany(models.TermAppearance, {
        foreignKey: 'sceneId',
        as: 'Appearances',
        onDelete: 'CASCADE'
      });

      // Dependencies
      Scene.belongsToMany(models.Scene, {
        through: models.SceneDependency,
        as: 'Dependencies',
        foreignKey: 'dependsOnSceneId',
        otherKey: 'sceneId'
      });
      
      Scene.belongsToMany(models.Scene, {
        through: models.SceneDependency,
        as: 'Dependents',
        foreignKey: 'sceneId',
        otherKey: 'dependsOnSceneId'
      });
    }

    // Helper: Get analysis summary
    getAnalysisSummary() {
      if (!this.analysis) return null;
      return {
        tone: this.analysis.tone,
        characters: this.analysis.characters?.slice(0, 3),
        setting: this.analysis.setting,
        keyEvents: this.analysis.keyEvents?.slice(0, 2)
      };
    }

    // Helper: Apply polish edits
    applyPolishEdits() {
      if (!this.finalText || !this.polishEdits?.length) return this.finalText;
      
      let text = this.finalText;
      const applied = this.polishEdits.filter(e => e.applied);
      
      for (const edit of applied) {
        const regex = new RegExp(this.escapeRegExp(edit.original), 'g');
        text = text.replace(regex, edit.replacement);
      }
      
      return text;
    }

    escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }

  Scene.init({
    chapterId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 }
    },
    sceneType: DataTypes.ENUM('dialogue', 'action', 'transition', 'exposition', 'climax'),
    rawText: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    translatedText: DataTypes.TEXT,
    finalText: DataTypes.TEXT,
    tokenCount: DataTypes.INTEGER,
    charCount: DataTypes.INTEGER,
    wordCount: DataTypes.INTEGER,
    status: {
      type: DataTypes.ENUM('pending', 'segmented', 'analyzed', 'translated', 'polished', 'complete'),
      defaultValue: 'pending'
    },
    analysis: DataTypes.JSONB,
    polishEdits: {
      type: DataTypes.JSONB,
      defaultValue: []
    },
    contextSummary: DataTypes.TEXT,
    glossaryTermIds: {
      type: DataTypes.ARRAY(DataTypes.INTEGER),
      defaultValue: []
    }
  }, {
    sequelize,
    modelName: 'Scene',
    tableName: 'Scenes',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['chapterId', 'sequence'] },
      { fields: ['chapterId', 'status'] }
    ]
  });

  return Scene;
};
