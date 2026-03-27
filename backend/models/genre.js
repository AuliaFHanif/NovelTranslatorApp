"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Genre extends Model {
    static associate(models) {
      // Associate with Series if needed
    }
  }

  Genre.init(
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
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Genre",
      tableName: "Genres",
    },
  );

  return Genre;
};
