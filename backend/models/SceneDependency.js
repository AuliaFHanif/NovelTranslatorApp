'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SceneDependency extends Model {
    static associate(models) {
      // Associations are handled in the belongsToMany relationship in Scene model
    }
  }

  SceneDependency.init({
    sceneId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Scenes',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    dependsOnSceneId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Scenes',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    dependencyType: {
      type: DataTypes.ENUM('translation_sequence', 'narrative_continuity', 'character_arc'),
      defaultValue: 'translation_sequence'
    }
  }, {
    sequelize,
    modelName: 'SceneDependency',
    tableName: 'SceneDependencies',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['sceneId', 'dependsOnSceneId'] }
    ]
  });

  return SceneDependency;
};
