/**
 * Migration module exports.
 */

export {
  runMigrations,
  rollbackMigration,
  rollbackToVersion,
  getMigrationStatus,
  createMigration,
  createBackup,
  restoreBackup,
  listBackups,
  cleanupOldBackups,
  validateDatabase,
} from "./migration.js";
export type {
  Migration,
  MigrationRecord,
  MigrationOptions,
  MigrationResult,
} from "./migration.js";

export {
  tableExists,
  columnExists,
  indexExists,
  getTableColumns,
  getTableIndexes,
  validateTableColumns,
  validateData,
  validateRowCount,
  validateNoDuplicates,
  validateNotNullColumns,
  checkForeignKeyViolations,
  combineValidators,
  safeTransform,
} from "./validation.js";
export type {
  ColumnInfo,
  IndexInfo,
  ValidationResult,
} from "./validation.js";

export {
  seedData,
  seedReferenceData,
  seedConfig,
  seedFromJSON,
  seedTransaction,
  reseedTable,
  generateSeedData,
  upsertRow,
  needsSeeding,
} from "./seeding.js";
export type {
  SeedData,
  SeedResult,
} from "./seeding.js";
