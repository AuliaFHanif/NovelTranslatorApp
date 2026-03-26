"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Chapter extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.belongsTo(models.Series, { foreignKey: "seriesId" });
      this.hasMany(models.Act, {
        foreignKey: "chapterId",
        onDelete: "CASCADE",
      });
      this.hasMany(models.GlossaryEntry, {
        foreignKey: "scopeId",
        scope: "chapter",
      });
    }
  }
  Chapter.init(
    {
      seriesId: DataTypes.INTEGER,
      number: DataTypes.INTEGER,
      title: DataTypes.STRING,
      rawText: DataTypes.TEXT,
      finalText: DataTypes.TEXT,
    },
    {
      sequelize,
      modelName: "Chapter",
    },
  );
  return Chapter;
};
