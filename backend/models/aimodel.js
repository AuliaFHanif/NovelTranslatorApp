"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class AIModel extends Model {
    static associate(models) {
      // Define associations here if needed
    }
  }

  AIModel.init(
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      modelId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      provider: {
        type: DataTypes.ENUM("lm-studio", "openai", "claude", "other"),
        allowNull: false,
        defaultValue: "lm-studio",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
    },
    {
      sequelize,
      modelName: "AIModel",
      tableName: "AIModels",
    },
  );

  return AIModel;
};
