'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Act extends Model {
    static associate(models) {
      // Belongs to chapter
      if (models.Chapter) {
        Act.belongsTo(models.Chapter, { 
          foreignKey: 'chapterId',
          as: 'Chapter'
        });
      }

      // Many-to-many: Act <-> GlossaryTerm via TermAppearance
      if (models.GlossaryTerm && models.TermAppearance) {
        Act.belongsToMany(models.GlossaryTerm, {
          through: models.TermAppearance,
          foreignKey: 'actId',
          otherKey: 'termId',
          as: 'Terms'
        });
      }

      // Self-referential: Dependencies (this act depends on others)
      if (models.ActDependency) {
        Act.belongsToMany(models.Act, {
          through: {
            model: models.ActDependency,
            unique: false
          },
          as: 'Dependencies',
          foreignKey: 'actId',
          otherKey: 'dependsOnActId'
        });

        // Self-referential: Dependents (other acts depend on this)
        Act.belongsToMany(models.Act, {
          through: {
            model: models.ActDependency,
            unique: false
          },
          as: 'Dependents',
          foreignKey: 'dependsOnActId',
          otherKey: 'actId'
        });
      }
    }

    // Get previous act in sequence (simple!)
    async getPrevious() {
      return await Act.findOne({
        where: {
          chapterId: this.chapterId,
          sequence: this.sequence - 1
        }
      });
    }

    // Get next act in sequence
    async getNext() {
      return await Act.findOne({
        where: {
          chapterId: this.chapterId,
          sequence: this.sequence + 1
        }
      });
    }

    // Get all glossary terms for this act with appearance data
    async getTermsWithContext() {
      const terms = await this.getTerms();
      return terms;
    }

    // Check if this act can be translated (all dependencies ready)
    async canTranslate() {
      const deps = await this.getDependencies();
      for (const dep of deps) {
        if (dep.status !== 'complete' && dep.status !== 'ready') {
          return false;
        }
      }
      return true;
    }
  }

  Act.init({
    chapterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Chapters',
        key: 'id'
      }
    },
    sequence: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
      comment: 'Continuous integer sequence, NOT hierarchical'
    },
    label: {
      type: DataTypes.STRING(10),
      allowNull: false,
      comment: 'Display label: "1", "2", "2A", "2B"'
    },
    rawText: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    translation: DataTypes.TEXT,
    tokenCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    segmentSource: DataTypes.ENUM('ai', 'fallback', 'manual'),
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'ready', 'complete'),
      defaultValue: 'pending'
    },
    anatomyProfile: DataTypes.JSONB
  }, {
    sequelize,
    modelName: 'Act',
    tableName: 'Acts',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['chapterId', 'sequence'] }
    ]
  });

  return Act;
};
