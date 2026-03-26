"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Glossary extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.hasMany(models.GlossaryEntry, {
        foreignKey: "glossaryId",
        onDelete: "CASCADE",
      });
    }
  }
  Glossary.init(
    {
      name: DataTypes.STRING,
      type: DataTypes.ENUM("character", "location", "item", "concept"),
      language_notes: DataTypes.JSONB,
    },
    {
      sequelize,
      modelName: "Glossary",
    },
  );
  return Glossary;
};
