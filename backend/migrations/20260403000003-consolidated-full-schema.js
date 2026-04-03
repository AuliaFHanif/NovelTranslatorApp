"use strict";

/**
 * Consolidated Fresh Schema Migration
 * Creates all tables from scratch with proper ordering and complete column definitions
 * Run: npx sequelize-cli db:migrate
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Drop all tables in reverse dependency order
      const tablesToDrop = [
        "TermAppearances",
        "ActDependencies",
        "PolishEdits",
        "Polishes",
        "GlossaryTerms",
        "Analysis",
        "SubActs",
        "Acts",
        "Chapters",
        "Series",
        "AIModels",
        "Genres",
      ];

      for (const table of tablesToDrop) {
        await queryInterface.sequelize.query(
          `DROP TABLE IF EXISTS "${table}" CASCADE;`,
          { transaction },
        );
      }

      // Drop all ENUM types created by previous migrations
      const enumsToDrop = [
        "enum_Genres_name",
        "enum_AIModels_provider",
        "enum_AIModels_purpose",
        "enum_Series_language",
        "enum_Chapters_status",
        "enum_Acts_status",
        "enum_Acts_segmentSource",
        "enum_Analysis_scope",
        "enum_GlossaryTerms_type",
        "enum_GlossaryTerms_status",
        "enum_Polishes_scope",
        "enum_ActDependencies_dependencyType",
      ];

      for (const enumType of enumsToDrop) {
        await queryInterface.sequelize.query(
          `DROP TYPE IF EXISTS "${enumType}" CASCADE;`,
          { transaction },
        );
      }

      // 1. GENRE - No dependencies
      await queryInterface.createTable(
        "Genres",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
          },
          description: {
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
        },
        { transaction },
      );

      // 2. AIMODEL - No dependencies
      await queryInterface.createTable(
        "AIModels",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
          },
          modelId: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          provider: {
            type: Sequelize.ENUM("lm-studio", "openai", "claude", "other"),
            defaultValue: "lm-studio",
          },
          purpose: {
            type: Sequelize.ENUM(
              "segmentation",
              "translation",
              "analysis",
              "polish",
            ),
            allowNull: true,
          },
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          isActive: {
            type: Sequelize.BOOLEAN,
            defaultValue: true,
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      // 3. SERIES - No dependencies
      await queryInterface.createTable(
        "Series",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          title: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          language: {
            type: Sequelize.ENUM("ja", "zh", "en"),
            defaultValue: "ja",
          },
          genre: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          description: {
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
        },
        { transaction },
      );

      // 4. CHAPTER - Depends on Series
      await queryInterface.createTable(
        "Chapters",
        {
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
          },
          number: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          title: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          rawText: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          finalText: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          status: {
            type: Sequelize.ENUM("pending", "processing", "ready", "complete"),
            defaultValue: "pending",
          },
          strategyProfile: {
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
        },
        { transaction },
      );

      // 5. ACT - Depends on Chapter
      await queryInterface.createTable(
        "Acts",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          chapterId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: "Chapters",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          sequence: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          label: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          rawText: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          tokenCount: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
          },
          segmentationDepth: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
          },
          segmentSource: {
            type: Sequelize.ENUM("ai", "fallback", "manual"),
            defaultValue: "ai",
          },
          status: {
            type: Sequelize.ENUM(
              "pending",
              "processing",
              "segmented",
              "analyzed",
              "translating",
              "complete",
              "error",
            ),
            defaultValue: "pending",
          },
          translatedText: {
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
        },
        { transaction },
      );

      // 6. SUBACT - Depends on Act
      await queryInterface.createTable(
        "SubActs",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          actId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: "Acts",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          sequence: {
            type: Sequelize.INTEGER,
            allowNull: false,
          },
          rawText: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          translatedText: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          tokenCount: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
          },
          charCount: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      // 7. ANALYSIS - Depends on Act
      await queryInterface.createTable(
        "Analysis",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          actId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            unique: true,
            references: {
              model: "Acts",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          anatomyProfile: {
            type: Sequelize.JSONB,
            allowNull: false,
          },
          scope: {
            type: Sequelize.ENUM("act", "subact"),
            defaultValue: "act",
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      // 8. GLOSSARYTERM - Depends on Series
      await queryInterface.createTable(
        "GlossaryTerms",
        {
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
          },
          canonicalForm: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          termJa: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          termZh: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          termEn: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          type: {
            type: Sequelize.ENUM(
              "character",
              "location",
              "organization",
              "item",
              "concept",
              "technique",
            ),
            allowNull: true,
          },
          definition: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          metadata: {
            type: Sequelize.JSONB,
            allowNull: true,
            defaultValue: {},
          },
          status: {
            type: Sequelize.ENUM("pending", "approved", "rejected"),
            defaultValue: "pending",
          },
          confidence: {
            type: Sequelize.FLOAT,
            defaultValue: 0.5,
          },
          approvedAt: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          approvedBy: {
            type: Sequelize.STRING,
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
        },
        { transaction },
      );

      // 9. TERMAPPEARANCE - Depends on GlossaryTerm, Act, SubAct
      await queryInterface.createTable(
        "TermAppearances",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          termId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: "GlossaryTerms",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          actId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: "Acts",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          subActId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: "SubActs",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          contextSnippet: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          confidence: {
            type: Sequelize.FLOAT,
            defaultValue: 1.0,
          },
          frequency: {
            type: Sequelize.INTEGER,
            defaultValue: 1,
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      // 10. POLISH - Depends on Act, SubAct
      await queryInterface.createTable(
        "Polishes",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          actId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: "Acts",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          subActId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: "SubActs",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          scope: {
            type: Sequelize.ENUM("act", "subact"),
            allowNull: false,
            defaultValue: "act",
          },
          modelUsed: {
            type: Sequelize.STRING,
            allowNull: true,
          },
          originalText: {
            type: Sequelize.TEXT,
            allowNull: false,
            comment: "Snapshot of the text before this polish was applied",
          },
          polishedText: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          isSelected: {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      // 11. POLISHEDIT - Depends on Polish, Act
      await queryInterface.createTable(
        "PolishEdits",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          actId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: "Acts",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          polishId: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: "Polishes",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          original: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          replacement: {
            type: Sequelize.TEXT,
            allowNull: false,
          },
          reason: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          applied: {
            type: Sequelize.BOOLEAN,
            defaultValue: false,
          },
          modelUsed: {
            type: Sequelize.STRING,
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
        },
        { transaction },
      );

      // 12. ACTDEPENDENCY - Depends on Act (self-referencing)
      await queryInterface.createTable(
        "ActDependencies",
        {
          id: {
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
            type: Sequelize.INTEGER,
          },
          actId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: "Acts",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          dependsOnActId: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: "Acts",
              key: "id",
            },
            onDelete: "CASCADE",
          },
          dependencyType: {
            type: Sequelize.ENUM(
              "translation_sequence",
              "context_summary",
              "glossary_inheritance",
              "split_from",
            ),
            defaultValue: "translation_sequence",
          },
          createdAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
          updatedAt: {
            allowNull: false,
            type: Sequelize.DATE,
          },
        },
        { transaction },
      );

      // Create indexes for performance
      await queryInterface.addIndex("Chapters", ["seriesId"], { transaction });
      await queryInterface.addIndex("Acts", ["chapterId"], { transaction });
      await queryInterface.addIndex("Acts", ["status"], { transaction });
      await queryInterface.addIndex("SubActs", ["actId"], { transaction });
      await queryInterface.addIndex("Analysis", ["actId"], { transaction });
      await queryInterface.addIndex("GlossaryTerms", ["seriesId"], {
        transaction,
      });
      await queryInterface.addIndex("GlossaryTerms", ["status"], {
        transaction,
      });
      await queryInterface.addIndex("TermAppearances", ["termId"], {
        transaction,
      });
      await queryInterface.addIndex("TermAppearances", ["actId"], {
        transaction,
      });
      await queryInterface.addIndex("TermAppearances", ["subActId"], {
        transaction,
      });
      await queryInterface.addIndex("Polishes", ["actId"], { transaction });
      await queryInterface.addIndex("Polishes", ["subActId"], { transaction });
      await queryInterface.addIndex("PolishEdits", ["actId"], { transaction });
      await queryInterface.addIndex("ActDependencies", ["actId"], {
        transaction,
      });
      await queryInterface.addIndex("ActDependencies", ["dependsOnActId"], {
        transaction,
      });

      await transaction.commit();
      console.log("[Migration] Fresh schema created successfully");
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const tablesToDrop = [
        "TermAppearances",
        "ActDependencies",
        "PolishEdits",
        "Polishes",
        "GlossaryTerms",
        "Analysis",
        "SubActs",
        "Acts",
        "Chapters",
        "Series",
        "AIModels",
        "Genres",
      ];

      for (const table of tablesToDrop) {
        await queryInterface.sequelize.query(
          `DROP TABLE IF EXISTS "${table}" CASCADE;`,
          { transaction },
        );
      }

      // Drop all ENUM types
      const enumsToDrop = [
        "enum_Genres_name",
        "enum_AIModels_provider",
        "enum_AIModels_purpose",
        "enum_Series_language",
        "enum_Chapters_status",
        "enum_Acts_status",
        "enum_Acts_segmentSource",
        "enum_Analysis_scope",
        "enum_GlossaryTerms_type",
        "enum_GlossaryTerms_status",
        "enum_Polishes_scope",
        "enum_ActDependencies_dependencyType",
      ];

      for (const enumType of enumsToDrop) {
        await queryInterface.sequelize.query(
          `DROP TYPE IF EXISTS "${enumType}" CASCADE;`,
          { transaction },
        );
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
