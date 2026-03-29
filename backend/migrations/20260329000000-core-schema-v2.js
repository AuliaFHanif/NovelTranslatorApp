'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // ==========================================
    // 1. SERIES TABLE
    // ==========================================
    await queryInterface.createTable('Series', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      language: {
        type: Sequelize.ENUM('ja', 'zh'),
        allowNull: false,
        comment: 'Source language: ja=Japanese, zh=Chinese'
      },
      genre: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // ==========================================
    // 2. CHAPTERS TABLE
    // ==========================================
    await queryInterface.createTable('Chapters', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      seriesId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Series',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Chapter sequence number within series'
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      rawText: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Phase 1: Raw input text'
      },
      finalText: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Phase 5: Final translated output'
      },
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'ready', 'complete'),
        defaultValue: 'pending',
        comment: 'pending=Phase1 done, processing=Phase2-4, ready=Phase5, complete=approved'
      },
      strategyProfile: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Aggregated translation strategy from all acts'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Unique constraint: one chapter number per series
    await queryInterface.addIndex('Chapters', ['seriesId', 'number'], {
      unique: true,
      name: 'chapters_series_number_unique'
    });

    await queryInterface.addIndex('Chapters', ['seriesId']);
    await queryInterface.addIndex('Chapters', ['status']);

    // ==========================================
    // 3. ACTS TABLE (FLAT - NO HIERARCHY)
    // ==========================================
    await queryInterface.createTable('Acts', {
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
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Continuous order: 1, 2, 3, 4 (NOT 1, 2, 2A, 2B)'
      },
      label: {
        type: Sequelize.STRING(10),
        allowNull: false,
        comment: 'Display label only: "1", "2", "2A", "2B", "3"'
      },
      rawText: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Segmented text content from Phase 2'
      },
      tokenCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Estimated token count for splitting decisions'
      },
      segmentSource: {
        type: Sequelize.ENUM('ai', 'fallback', 'manual'),
        allowNull: true,
        comment: 'How this act was segmented'
      },
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'ready', 'complete'),
        defaultValue: 'pending',
        comment: 'pending=Phase2 done, processing=Phase3-4, ready=Phase5, complete=approved'
      },
      anatomyProfile: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Phase 3: Linguistic and narrative analysis results'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Unique constraint: one sequence per chapter
    await queryInterface.addIndex('Acts', ['chapterId', 'sequence'], {
      unique: true,
      name: 'acts_chapter_sequence_unique'
    });

    await queryInterface.addIndex('Acts', ['chapterId']);
    await queryInterface.addIndex('Acts', ['status']);

    // ==========================================
    // 4. GLOSSARY TERMS TABLE
    // ==========================================
    await queryInterface.createTable('GlossaryTerms', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      seriesId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Series',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      canonicalForm: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Primary display form of the term'
      },
      termJa: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Japanese form (if applicable)'
      },
      termZh: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Chinese form (if applicable)'
      },
      termEn: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'English translation (REQUIRED)'
      },
      type: {
        type: Sequelize.ENUM('character', 'location', 'item', 'concept', 'technique'),
        allowNull: false,
        comment: 'Category of the term'
      },
      definition: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional detailed definition'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Variants, pronunciation, aliases, etc.'
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending',
        comment: 'Workflow status for human review'
      },
      approvedAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      approvedBy: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'User ID who approved'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('GlossaryTerms', ['seriesId', 'canonicalForm'], {
      name: 'glossary_series_canonical_idx'
    });

    await queryInterface.addIndex('GlossaryTerms', ['seriesId', 'type'], {
      name: 'glossary_series_type_idx'
    });

    await queryInterface.addIndex('GlossaryTerms', ['seriesId']);
    await queryInterface.addIndex('GlossaryTerms', ['status']);

    // ==========================================
    // 5. TERM APPEARANCES (LINKING TABLE)
    // ==========================================
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
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      actId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Acts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contextSentence: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'The sentence where term appeared'
      },
      contextPosition: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Character position in act text'
      },
      extractedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      confidence: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
        comment: 'AI confidence score 0-1'
      }
    });

    // Unique: one appearance record per term per act
    await queryInterface.addIndex('TermAppearances', ['termId', 'actId'], {
      unique: true,
      name: 'appearances_term_act_unique'
    });

    await queryInterface.addIndex('TermAppearances', ['termId']);
    await queryInterface.addIndex('TermAppearances', ['actId']);

    // ==========================================
    // 6. ACT DEPENDENCIES (EXPLICIT CHAINS)
    // ==========================================
    await queryInterface.createTable('ActDependencies', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      actId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Acts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'The act that has the dependency (e.g., 1B)'
      },
      dependsOnActId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Acts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'The prerequisite act (e.g., 1A)'
      },
      dependencyType: {
        type: Sequelize.ENUM('translation_sequence', 'context_summary', 'glossary_inheritance'),
        defaultValue: 'translation_sequence',
        comment: 'Why this dependency exists'
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Unique: one dependency type per act pair
    await queryInterface.addIndex('ActDependencies', ['actId', 'dependsOnActId'], {
      unique: true,
      name: 'dependencies_act_prereq_unique'
    });

    await queryInterface.addIndex('ActDependencies', ['actId']);
    await queryInterface.addIndex('ActDependencies', ['dependsOnActId']);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop in reverse order (respect foreign keys)
    await queryInterface.dropTable('ActDependencies');
    await queryInterface.dropTable('TermAppearances');
    await queryInterface.dropTable('GlossaryTerms');
    await queryInterface.dropTable('Acts');
    await queryInterface.dropTable('Chapters');
    await queryInterface.dropTable('Series');
  }
};
