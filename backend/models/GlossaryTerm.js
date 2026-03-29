'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class GlossaryTerm extends Model {
    static associate(models) {
      if (models.Series) {
        GlossaryTerm.belongsTo(models.Series, { 
          foreignKey: 'seriesId',
          as: 'Series'
        });
      }

      // Many-to-many: GlossaryTerm <-> Act via TermAppearance
      if (models.Act && models.TermAppearance) {
        GlossaryTerm.belongsToMany(models.Act, {
          through: models.TermAppearance,
          foreignKey: 'termId',
          otherKey: 'actId',
          as: 'AssociatedActs'
        });

        GlossaryTerm.hasMany(models.TermAppearance, {
          foreignKey: 'termId',
          as: 'Appearances'
        });
      }
    }

    // Get term in appropriate language
    getTerm(language) {
      if (language === 'ja' && this.termJa) return this.termJa;
      if (language === 'zh' && this.termZh) return this.termZh;
      return this.termEn;
    }

    // Get all appearances ordered by chapter/act
    async getAppearanceHistory() {
      const acts = await this.getAppearances({
        include: [{
          model: sequelize.models.Chapter,
          attributes: ['number', 'title'],
          include: [{
            model: sequelize.models.Series,
            attributes: ['title']
          }]
        }],
        order: [
          [sequelize.models.Chapter, 'number', 'ASC'],
          [sequelize.col('Act.sequence'), 'ASC']
        ]
      });
      return acts;
    }

    // Add variant form (e.g., "山田" as variant of "山田太郎")
    async addVariant(variantForm) {
      const variants = this.metadata?.variants || [];
      if (!variants.includes(variantForm)) {
        await this.update({
          metadata: {
            ...this.metadata,
            variants: [...variants, variantForm]
          }
        });
      }
    }
  }

  GlossaryTerm.init({
    seriesId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Series',
        key: 'id'
      }
    },
    canonicalForm: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Primary display form'
    },
    termJa: DataTypes.STRING(255),
    termZh: DataTypes.STRING(255),
    termEn: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('character', 'organization', 'location', 'item', 'concept', 'technique'),
      allowNull: false
    },
    definition: DataTypes.TEXT,
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected'),
      defaultValue: 'pending'
    },
    approvedAt: DataTypes.DATE,
    approvedBy: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'GlossaryTerm',
    tableName: 'GlossaryTerms',
    timestamps: true,
    indexes: [
      { fields: ['seriesId', 'canonicalForm'] },
      { fields: ['seriesId', 'type'] },
      { fields: ['status'] }
    ]
  });

  return GlossaryTerm;
};
