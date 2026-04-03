'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create Analysis table
    await queryInterface.createTable('Analysis', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      actId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: {
          model: 'Acts',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      anatomyProfile: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      scope: {
        type: Sequelize.ENUM('act', 'subact'),
        allowNull: false,
        defaultValue: 'act'
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

    // 2. Create SubActs table
    await queryInterface.createTable('SubActs', {
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
        onDelete: 'CASCADE'
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      rawText: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      translatedText: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tokenCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      charCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
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

    // 3. Update Acts table
    // Remove columns we'll move or refine
    // We keep translatedText as an aggregate but anatomyProfile moves to Analysis
    await queryInterface.removeColumn('Acts', 'anatomyProfile');
    
    // Add segmentationDepth
    await queryInterface.addColumn('Acts', 'segmentationDepth', {
      type: Sequelize.INTEGER,
      defaultValue: 0
    });

    // Update status ENUM (this is tricky in PG, usually requires dropping and recreating)
    // For simplicity in this dev environment, we'll just add the column if it doesn't exist or modify
    // But since we are using Sequelize migrations, we should try to be proper.
    // However, changing ENUM values in PG is hard. We can skip for now if the app layer handles it,
    // or use a more robust migration pattern.

    // 4. Update Polishes table
    await queryInterface.addColumn('Polishes', 'subActId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'SubActs',
        key: 'id'
      },
      onDelete: 'CASCADE'
    });
    await queryInterface.addColumn('Polishes', 'scope', {
      type: Sequelize.ENUM('act', 'subact'),
      allowNull: false,
      defaultValue: 'act'
    });
    await queryInterface.addColumn('Polishes', 'originalText', {
      type: Sequelize.TEXT,
      allowNull: true // Temporarily true for existing records
    });
    await queryInterface.renameColumn('Polishes', 'content', 'polishedText');
    await queryInterface.addColumn('Polishes', 'reason', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('Polishes', 'isSelected', {
      type: Sequelize.BOOLEAN,
      defaultValue: false
    });
    // Remove legacy columns if they exist
    // await queryInterface.removeColumn('Polishes', 'editCount');
    // await queryInterface.removeColumn('Polishes', 'appliedCount');
    // await queryInterface.removeColumn('Polishes', 'isActive');

    // 5. Update TermAppearances table
    await queryInterface.addColumn('TermAppearances', 'subActId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'SubActs',
        key: 'id'
      },
      onDelete: 'CASCADE'
    });
    // Make actId nullable
    await queryInterface.changeColumn('TermAppearances', 'actId', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    // 6. Update AIModels table
    await queryInterface.addColumn('AIModels', 'purpose', {
      type: Sequelize.ENUM('segmentation', 'translation', 'analysis', 'polish'),
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Inverse operations
    await queryInterface.dropTable('Analysis');
    await queryInterface.dropTable('SubActs');
    
    await queryInterface.addColumn('Acts', 'anatomyProfile', {
      type: Sequelize.JSONB,
      allowNull: true
    });
    await queryInterface.removeColumn('Acts', 'segmentationDepth');

    await queryInterface.removeColumn('Polishes', 'subActId');
    await queryInterface.removeColumn('Polishes', 'scope');
    await queryInterface.removeColumn('Polishes', 'originalText');
    await queryInterface.renameColumn('Polishes', 'polishedText', 'content');
    await queryInterface.removeColumn('Polishes', 'reason');
    await queryInterface.removeColumn('Polishes', 'isSelected');

    await queryInterface.removeColumn('TermAppearances', 'subActId');
    await queryInterface.changeColumn('TermAppearances', 'actId', {
      type: Sequelize.INTEGER,
      allowNull: false
    });

    await queryInterface.removeColumn('AIModels', 'purpose');
  }
};
