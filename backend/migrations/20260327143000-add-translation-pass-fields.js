"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Acts", "pass1Analysis", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("Acts", "pass2Draft", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("Acts", "pass3Final", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("Acts", "currentPass", {
      type: Sequelize.ENUM("idle", "pass1_done", "pass2_done", "pass3_done"),
      allowNull: false,
      defaultValue: "idle",
    });

    await queryInterface.addColumn("Acts", "lastRunAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn("Acts", "llmMeta", {
      type: Sequelize.JSONB,
      allowNull: true,
    });

    await queryInterface.addColumn("Chapters", "translationStatus", {
      type: Sequelize.ENUM("idle", "pass1_done", "pass2_done", "pass3_done"),
      allowNull: false,
      defaultValue: "idle",
    });

    await queryInterface.addColumn("Chapters", "lastTranslatedAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Chapters", "lastTranslatedAt");
    await queryInterface.removeColumn("Chapters", "translationStatus");

    await queryInterface.removeColumn("Acts", "llmMeta");
    await queryInterface.removeColumn("Acts", "lastRunAt");
    await queryInterface.removeColumn("Acts", "currentPass");
    await queryInterface.removeColumn("Acts", "pass3Final");
    await queryInterface.removeColumn("Acts", "pass2Draft");
    await queryInterface.removeColumn("Acts", "pass1Analysis");

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Acts_currentPass";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Chapters_translationStatus";',
    );
  },
};
