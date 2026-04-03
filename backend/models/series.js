'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Series extends Model {
    static associate(models) {
      if (models.Chapter) {
        Series.hasMany(models.Chapter, { 
          foreignKey: 'seriesId',
          as: 'Chapters'
        });
      }

      if (models.GlossaryTerm) {
        Series.hasMany(models.GlossaryTerm, { 
          foreignKey: 'seriesId',
          as: 'GlossaryTerms'
        });
      }
    }
  }

  Series.init({
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    language: {
      type: DataTypes.ENUM('ja', 'zh'),
      allowNull: false,
      validate: {
        isIn: [['ja', 'zh']]
      }
    },
    genre: DataTypes.STRING(255),
    description: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Series',
    tableName: 'Series',
    timestamps: true
  });

  return Series;
};
