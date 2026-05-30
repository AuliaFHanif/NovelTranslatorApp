'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Dropping tables with CASCADE to ensure all foreign key constraints are handled
    // This is safe because we are intentionally removing the entire legacy translation pipeline
    const tables = [
      'ActDependencies',
      'TermAppearances',
      'PolishEdits',
      'Polishes',
      'Analysis',
      'SubActs',
      'Acts'
    ];

    for (const table of tables) {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
  },

  down: async (queryInterface, Sequelize) => {
    throw new Error('Rollback not supported for simplified schema refactor');
  }
};
