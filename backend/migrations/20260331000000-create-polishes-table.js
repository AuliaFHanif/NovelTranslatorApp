'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Polishes', {
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
        onDelete: 'CASCADE'
      },
      modelUsed: {
        type: Sequelize.STRING,
        allowNull: true
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      editCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      appliedCount: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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
    }, {
      timestamps: true
    });

    // Add polishId to PolishEdits
    await queryInterface.addColumn('PolishEdits', 'polishId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Polishes',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addIndex('Polishes', ['actId']);
    await queryInterface.addIndex('PolishEdits', ['polishId']);
  },

  down: async (queryInterface, Sequelize) => {
    // Note: This order is important for FK constraints
    await queryInterface.removeColumn('PolishEdits', 'polishId');
    await queryInterface.dropTable('Polishes');
  }
};
