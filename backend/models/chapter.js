'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Chapter extends Model {
    static associate(models) {
      if (models.Series) {
        Chapter.belongsTo(models.Series, { 
          foreignKey: 'seriesId',
          as: 'Series'
        });
      }

      if (models.Act) {
        Chapter.hasMany(models.Act, { 
          foreignKey: 'chapterId',
          as: 'Acts'
        });
      }
    }

    // Get acts ordered by sequence
    async getOrderedActs() {
      if (!this.getActs) return [];
      return await this.getActs({
        order: [['sequence', 'ASC']]
      });
    }

    // Aggregate strategy from all acts
    async aggregateStrategy() {
      if (!this.getActs) return null;
      const acts = await this.getActs();
      const strategies = acts
        .map(a => a.anatomyProfile?.narrative)
        .filter(Boolean);

      if (strategies.length === 0) return null;

      return {
        language: acts[0].Chapter?.Series?.language,
        emotionalArc: strategies.map(s => s.primaryEmotion).filter(Boolean),
        pacingConsistency: new Set(strategies.map(s => s.pacingPattern).filter(Boolean)).size > 1 
          ? 'mixed' 
          : 'uniform'
      };
    }
  }

  Chapter.init({
    seriesId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Series',
        key: 'id'
      }
    },
    number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 }
    },
    title: DataTypes.STRING(255),
    rawText: DataTypes.TEXT,
    finalText: DataTypes.TEXT,
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'ready', 'complete'),
      defaultValue: 'pending'
    },
    strategyProfile: DataTypes.JSONB
  }, {
    sequelize,
    modelName: 'Chapter',
    tableName: 'Chapters',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['seriesId', 'number'] }
    ]
  });

  return Chapter;
};
