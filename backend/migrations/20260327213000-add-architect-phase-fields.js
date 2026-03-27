"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "Acts" DROP CONSTRAINT IF EXISTS "Acts_chapterId_key";',
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "Acts" DROP CONSTRAINT IF EXISTS "Acts_order_key";',
    );

    await queryInterface.changeColumn("Acts", "chapterId", {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "Chapters",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.changeColumn("Acts", "order", {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await queryInterface.addColumn("Chapters", "status", {
      type: Sequelize.ENUM("paste", "architect", "ready"),
      allowNull: false,
      defaultValue: "paste",
    });

    await queryInterface.addColumn("Acts", "label", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn("Acts", "parentActId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Acts",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.addColumn("Acts", "splitIndex", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn("Acts", "glossaryScopeId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Acts",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.addColumn("Acts", "dependsOnActId", {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: "Acts",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });

    await queryInterface.addColumn("Acts", "status", {
      type: Sequelize.ENUM(
        "pending",
        "ready",
        "profiled",
        "translated",
        "complete",
        "blocked",
      ),
      allowNull: false,
      defaultValue: "pending",
    });

    await queryInterface.addColumn("Acts", "boundaryStart", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn("Acts", "boundaryEnd", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn("Acts", "tokenCount", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn("Acts", "source", {
      type: Sequelize.ENUM("ai", "fallback"),
      allowNull: false,
      defaultValue: "fallback",
    });

    await queryInterface.addConstraint("Acts", {
      fields: ["chapterId", "order", "splitIndex"],
      type: "unique",
      name: "unique_acts_chapter_order_split",
    });

    await queryInterface.addIndex(
      "Acts",
      ["chapterId", "order", "splitIndex"],
      {
        name: "idx_acts_chapter_order_split",
      },
    );

    await queryInterface.addIndex("Acts", ["parentActId"], {
      name: "idx_acts_parent_act_id",
    });

    await queryInterface.addIndex("Acts", ["glossaryScopeId"], {
      name: "idx_acts_glossary_scope_id",
    });

    await queryInterface.addIndex("Acts", ["dependsOnActId"], {
      name: "idx_acts_depends_on_act_id",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex("Acts", "idx_acts_depends_on_act_id");
    await queryInterface.removeIndex("Acts", "idx_acts_glossary_scope_id");
    await queryInterface.removeIndex("Acts", "idx_acts_parent_act_id");
    await queryInterface.removeIndex("Acts", "idx_acts_chapter_order_split");
    await queryInterface.removeConstraint(
      "Acts",
      "unique_acts_chapter_order_split",
    );

    await queryInterface.removeColumn("Acts", "source");
    await queryInterface.removeColumn("Acts", "tokenCount");
    await queryInterface.removeColumn("Acts", "boundaryEnd");
    await queryInterface.removeColumn("Acts", "boundaryStart");
    await queryInterface.removeColumn("Acts", "status");
    await queryInterface.removeColumn("Acts", "dependsOnActId");
    await queryInterface.removeColumn("Acts", "glossaryScopeId");
    await queryInterface.removeColumn("Acts", "splitIndex");
    await queryInterface.removeColumn("Acts", "parentActId");
    await queryInterface.removeColumn("Acts", "label");
    await queryInterface.removeColumn("Chapters", "status");

    await queryInterface.changeColumn("Acts", "chapterId", {
      type: Sequelize.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: "Chapters",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });

    await queryInterface.changeColumn("Acts", "order", {
      type: Sequelize.INTEGER,
      allowNull: false,
      unique: true,
    });

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Acts_source";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Acts_status";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_Chapters_status";',
    );
  },
};
