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
      this.belongsTo(models.Act, {
        as: "ParentAct",
        foreignKey: "parentActId",
      });
      this.belongsTo(models.Act, {
        as: "GlossaryScopeAct",
        foreignKey: "glossaryScopeId",
      });
      this.belongsTo(models.Act, {
        as: "DependsOnAct",
        foreignKey: "dependsOnActId",
      });
      this.hasMany(models.Act, {
        as: "ChildSplits",
        foreignKey: "parentActId",
      });
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
      label: DataTypes.STRING,
      rawActText: DataTypes.TEXT,
      parentActId: DataTypes.INTEGER,
      splitIndex: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      glossaryScopeId: DataTypes.INTEGER,
      dependsOnActId: DataTypes.INTEGER,
      status: {
        type: DataTypes.ENUM(
          "pending",
          "ready",
          "profiled",
          "translated",
          "complete",
          "blocked",
        ),
        allowNull: false,
        defaultValue: "pending",
      },
      boundaryStart: DataTypes.INTEGER,
      boundaryEnd: DataTypes.INTEGER,
      tokenCount: DataTypes.INTEGER,
      source: {
        type: DataTypes.ENUM("ai", "fallback"),
        allowNull: false,
        defaultValue: "fallback",
      },
      pass1Analysis: DataTypes.TEXT,
      pass2Draft: DataTypes.TEXT,
      pass3Final: DataTypes.TEXT,
      currentPass: {
        type: DataTypes.ENUM("idle", "pass1_done", "pass2_done", "pass3_done"),
        allowNull: false,
        defaultValue: "idle",
      },
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
