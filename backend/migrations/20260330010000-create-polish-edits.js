'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('PolishEdits', {
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
      original: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      replacement: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      applied: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      modelUsed: {
        type: Sequelize.STRING,
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

    await queryInterface.addIndex('PolishEdits', ['actId']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('PolishEdits');
  }
};
