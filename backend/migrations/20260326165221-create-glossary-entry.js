"use strict";
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("GlossaryEntries", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      glossaryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Glossaries",
          key: "id",
        },
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      },
      scope: {
        type: Sequelize.ENUM("series", "chapter", "act"),
        allowNull: false,
      },
      scopeId: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      term_ja: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      term_zh: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      term_en: {
        type: Sequelize.STRING(255),
        allowNull: false,
        validate: { notEmpty: { msg: "English term cannot be empty" } },
      },
      definition: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
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
    // Index for tiered lookups: glossaryId, scope, scopeId
    await queryInterface.addIndex(
      "GlossaryEntries",
      ["glossaryId", "scope", "scopeId"],
      {
        name: "idx_glossary_scope_lookup",
      },
    );
    // Index for term searches
    await queryInterface.addIndex("GlossaryEntries", ["term_ja", "term_zh"], {
      name: "idx_glossary_term_search",
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex(
      "GlossaryEntries",
      "idx_glossary_scope_lookup",
    );
    await queryInterface.removeIndex(
      "GlossaryEntries",
      "idx_glossary_term_search",
    );
    await queryInterface.dropTable("GlossaryEntries");
  },
};
