"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Series extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.hasMany(models.Chapter, {
        foreignKey: "seriesId",
        onDelete: "CASCADE",
      });
      this.hasMany(models.GlossaryEntry, {
        foreignKey: "scopeId",
        scope: "series",
      });
    }
  }
  Series.init(
    {
      title: DataTypes.STRING,
      genre: DataTypes.STRING,
      description: DataTypes.TEXT,
      language: DataTypes.ENUM("ja", "zh"),
    },
    {
      sequelize,
      modelName: "Series",
    },
  );
  return Series;
};
