"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class GlossaryEntry extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.belongsTo(models.Glossary, { foreignKey: "glossaryId" });
    }
  }
  GlossaryEntry.init(
    {
      glossaryId: DataTypes.INTEGER,
      scope: DataTypes.ENUM("series", "chapter", "act"),
      scopeId: DataTypes.INTEGER,
      term_ja: DataTypes.STRING,
      term_zh: DataTypes.STRING,
      term_en: DataTypes.STRING,
      definition: DataTypes.TEXT,
      metadata: DataTypes.JSONB,
    },
    {
      sequelize,
      modelName: "GlossaryEntry",
    },
  );
  return GlossaryEntry;
};
