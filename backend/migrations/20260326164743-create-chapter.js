"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Chapters", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      seriesId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Series",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        validate: {
          min: { args: 1, msg: "Chapter number must be at least 1" },
        },
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true,
        defaultValue: "Untitled",
      },
      rawText: {
        type: Sequelize.TEXT,
        allowNull: false,
        validate: { notEmpty: { msg: "Raw text cannot be empty" } },
      },
      finalText: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
    // Unique constraint: (seriesId, number)
    await queryInterface.addConstraint("Chapters", {
      fields: ["seriesId", "number"],
      type: "unique",
      name: "unique_series_chapter_number",
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "Chapters",
      "unique_series_chapter_number",
    );
    await queryInterface.dropTable("Chapters");
  },
};
