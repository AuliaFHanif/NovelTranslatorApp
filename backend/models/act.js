"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Act extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.belongsTo(models.Chapter, { foreignKey: "chapterId" });
      this.hasMany(models.GlossaryEntry, {
        foreignKey: "scopeId",
        scope: "act",
      });
    }
  }
  Act.init(
    {
      chapterId: DataTypes.INTEGER,
      order: DataTypes.INTEGER,
      rawActText: DataTypes.TEXT,
      pass1Analysis: DataTypes.TEXT,
      pass2Draft: DataTypes.TEXT,
      pass3Final: DataTypes.TEXT,
      currentPass: DataTypes.ENUM(
        "idle",
        "pass1_done",
        "pass2_done",
        "pass3_done",
      ),
      lastRunAt: DataTypes.DATE,
      llmMeta: DataTypes.JSONB,
    },
    {
      sequelize,
      modelName: "Act",
    },
  );
  return Act;
};
