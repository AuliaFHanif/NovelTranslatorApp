'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create Scenes table (replaces Acts + SubActs)
    await queryInterface.createTable('Scenes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      chapterId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Chapters',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      sceneType: {
        type: Sequelize.ENUM('dialogue', 'action', 'transition', 'exposition', 'climax'),
        allowNull: true
      },
      // Content
      rawText: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      translatedText: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      finalText: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Metrics
      tokenCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      charCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      wordCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      // Status
      status: {
        type: Sequelize.ENUM('pending', 'segmented', 'analyzed', 'translated', 'polished', 'complete'),
        defaultValue: 'pending'
      },
      // Analysis & Polish (JSONB)
      analysis: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      polishEdits: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      contextSummary: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      glossaryTermIds: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        allowNull: true,
        defaultValue: []
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    // Indexes
    await queryInterface.addIndex('Scenes', ['chapterId', 'sequence'], {
      unique: true,
      name: 'scenes_chapter_sequence_unique'
    });
    await queryInterface.addIndex('Scenes', ['chapterId', 'status']);

    // Scene Dependencies
    await queryInterface.createTable('SceneDependencies', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      sceneId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Scenes',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      dependsOnSceneId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Scenes',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      dependencyType: {
        type: Sequelize.ENUM('translation_sequence', 'narrative_continuity', 'character_arc'),
        defaultValue: 'translation_sequence'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('SceneDependencies', ['sceneId', 'dependsOnSceneId'], {
      unique: true
    });

    // Recreate TermAppearances linking to Scenes
    await queryInterface.createTable('TermAppearances', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      termId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'GlossaryTerms',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      sceneId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Scenes',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      contextSnippet: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      confidence: {
        type: Sequelize.FLOAT,
        defaultValue: 1.0
      },
      frequency: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('TermAppearances', ['termId', 'sceneId'], {
      unique: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('TermAppearances');
    await queryInterface.dropTable('SceneDependencies');
    await queryInterface.dropTable('Scenes');
  }
};
