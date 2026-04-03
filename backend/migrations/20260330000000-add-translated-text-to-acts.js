'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Acts', 'translatedText', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Raw translated output from LLM (including reasoning)'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Acts', 'translatedText');
  }
};
