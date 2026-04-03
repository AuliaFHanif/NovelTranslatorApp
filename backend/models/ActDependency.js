"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class ActDependency extends Model {
    static associate(models) {
      // The act that has the dependency (e.g., Act 1B)
      if (models.Act) {
        ActDependency.belongsTo(models.Act, {
          foreignKey: "actId",
          as: "Dependent",
        });

        // The prerequisite act (e.g., Act 1A)
        ActDependency.belongsTo(models.Act, {
          foreignKey: "dependsOnActId",
          as: "Prerequisite",
        });
      }
    }
  }

  ActDependency.init(
    {
      actId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Acts",
          key: "id",
        },
      },
      dependsOnActId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Acts",
          key: "id",
        },
      },
      dependencyType: {
        type: DataTypes.ENUM(
          "translation_sequence",
          "context_summary",
          "glossary_inheritance",
          "split_from",
        ),
        defaultValue: "translation_sequence",
      },
    },
    {
      sequelize,
      modelName: "ActDependency",
      tableName: "ActDependencies",
      timestamps: true,
      indexes: [
        { unique: true, fields: ["actId", "dependsOnActId"] },
        { fields: ["actId"] },
        { fields: ["dependsOnActId"] },
      ],
    },
  );

  return ActDependency;
};
