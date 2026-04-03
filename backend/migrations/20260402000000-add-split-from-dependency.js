"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add split_from as a new dependency type for linking split acts
     * This allows 4a and 4b to be linked together and share analysis
     */
    return queryInterface.sequelize.query(
      `ALTER TYPE "enum_ActDependencies_dependencyType" ADD VALUE 'split_from'`,
      { raw: true },
    );
  },

  async down(queryInterface, Sequelize) {
    /**
     * Note: PostgreSQL ENUM types cannot have values removed directly.
     * To rollback this migration, you would need to:
     * 1. Create a new ENUM type without 'split_from'
     * 2. Alter the column to use the new ENUM type
     * 3. Drop the old ENUM type
     *
     * This is complex, so for now we leave this as a one-way migration.
     */
    console.log("Note: Cannot remove ENUM value. This is a one-way migration.");
  },
};
