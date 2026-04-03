"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add missing columns to TermAppearances table
    const table = await queryInterface.describeTable("TermAppearances");

    if (!table.contextSnippet) {
      await queryInterface.addColumn("TermAppearances", "contextSnippet", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    if (!table.confidence) {
      await queryInterface.addColumn("TermAppearances", "confidence", {
        type: Sequelize.FLOAT,
        defaultValue: 1.0,
      });
    }

    if (!table.frequency) {
      await queryInterface.addColumn("TermAppearances", "frequency", {
        type: Sequelize.INTEGER,
        defaultValue: 1,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("TermAppearances");

    if (table.contextSnippet) {
      await queryInterface.removeColumn("TermAppearances", "contextSnippet");
    }

    if (table.confidence) {
      await queryInterface.removeColumn("TermAppearances", "confidence");
    }

    if (table.frequency) {
      await queryInterface.removeColumn("TermAppearances", "frequency");
    }
  },
};
