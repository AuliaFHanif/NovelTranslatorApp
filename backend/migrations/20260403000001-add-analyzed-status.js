"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add 'analyzed' status to Acts enum
    // In PostgreSQL, we can just add a new value to the enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_Acts_status" ADD VALUE 'analyzed';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Note: Cannot remove enum values in PostgreSQL, so this is a no-op
    // The 'analyzed' value will remain in the database schema
    console.log(
      'Note: Enum value "analyzed" cannot be removed from "enum_Acts_status" in PostgreSQL',
    );
  },
};
