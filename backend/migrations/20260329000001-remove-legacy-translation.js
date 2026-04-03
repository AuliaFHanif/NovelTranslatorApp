'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if translation column exists before trying to remove it
    const tableDesc = await queryInterface.describeTable('Acts');
    if (tableDesc.translation) {
      await queryInterface.removeColumn('Acts', 'translation');
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Add it back in case of rollback
    await queryInterface.addColumn('Acts', 'translation', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Phase 5: Final translation output (legacy)'
    });
  }
};
