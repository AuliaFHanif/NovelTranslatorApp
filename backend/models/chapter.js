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
      status: {
        type: DataTypes.ENUM("paste", "architect", "ready"),
        allowNull: false,
        defaultValue: "paste",
      },
      translationStatus: {
        type: DataTypes.ENUM("idle", "pass1_done", "pass2_done", "pass3_done"),
        allowNull: false,
        defaultValue: "idle",
      },
      lastTranslatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      modelName: "Chapter",
    },
  );
  return Chapter;
};
