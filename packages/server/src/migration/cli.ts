#!/usr/bin/env node
/**
 * Data migration CLI tool for MTA My Way.
 *
 * Provides command-line interface for database migrations:
 * - Apply pending migrations
 * - Rollback migrations
 * - Check migration status
 * - Create new migrations
 * - Backup and restore
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { Command } from "commander";
import {
  cleanupOldBackups,
  createBackup,
  createMigration,
  getMigrationStatus,
  listBackups,
  restoreBackup,
  rollbackMigration,
  rollbackToVersion,
  runMigrations,
  validateDatabase,
} from "./migration.js";
import { seedReferenceData } from "./seeding.js";
import { getSeedDataForEnvironment } from "./seed-data.js";

const program = new Command();

/** Wraps an async Commander action handler to satisfy no-misused-promises. */
const asyncAction =
  <T extends unknown[]>(fn: (...args: T) => Promise<void>) =>
  (...args: T): void => {
    void fn(...args);
  };

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_DB_PATH = "./packages/server/data/database.db";
const _MIGRATIONS_DIR = "./packages/server/src/migration/migrations";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get database path from arguments or default.
 */
function getDbPath(path?: string): string {
  if (path) return resolve(path);
  return resolve(DEFAULT_DB_PATH);
}

/**
 * Open database connection.
 */
function openDatabase(path: string): Database.Database {
  if (!existsSync(path)) {
    console.error(`Database not found: ${path}`);
    console.error("Run with --init to create a new database");
    process.exit(1);
  }
  return new Database(path);
}

/**
 * Format milliseconds as human-readable duration.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ============================================================================
// Commands
// ============================================================================

program.name("mta-migrate").description("MTA My Way database migration CLI").version("1.0.0");

/**
 * Apply pending migrations.
 */
program
  .command("up")
  .description("Apply pending migrations")
  .option("-d, --db <path>", "Database path", DEFAULT_DB_PATH)
  .option("--dry-run", "Preview migrations without executing")
  .option("--backup", "Create backup before migration")
  .option("--force", "Skip validation errors")
  .option("--to <version>", "Migrate to specific version")
  .action(
    asyncAction(async (options) => {
      const dbPath = getDbPath(options.db);
      const db = openDatabase(dbPath);

      try {
        console.log(`Connecting to database: ${dbPath}`);

        if (options.backup) {
          console.log("Creating backup...");
          const backupPath = await createBackup(dbPath);
          console.log(`✓ Backup created: ${backupPath}`);
        }

        const targetVersion = options.to ? parseInt(options.to, 10) : undefined;
        const results = await runMigrations(
          db,
          {
            dryRun: options.dryRun ?? false,
            backup: false, // Already handled above
            force: options.force ?? false,
          },
          targetVersion
        );

        if (options.dryRun) {
          console.log("\nDry-run results:");
        } else {
          console.log("\nMigration results:");
        }

        let appliedCount = 0;
        let skippedCount = 0;

        for (const result of results) {
          if (result.applied) {
            console.log(
              `  ✓ Applied v${result.version}: ${result.name} (${formatDuration(result.executionTimeMs)})`
            );
            appliedCount++;
          } else if (result.skipped) {
            console.log(`  - Skipped v${result.version}: ${result.name}`);
            skippedCount++;
          } else if (result.error) {
            console.log(`  ✗ Failed v${result.version}: ${result.name}`);
            console.log(`    Error: ${result.error}`);
          }
        }

        console.log(`\nTotal: ${appliedCount} applied, ${skippedCount} skipped`);

        if (options.dryRun) {
          console.log("(dry-run mode - no changes were made)");
        }
      } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
      } finally {
        db.close();
      }
    })
  );

/**
 * Rollback migrations.
 */
program
  .command("down")
  .description("Rollback migrations")
  .option("-d, --db <path>", "Database path", DEFAULT_DB_PATH)
  .option("--to <version>", "Rollback to specific version")
  .option("--version <version>", "Rollback specific migration version")
  .option("--dry-run", "Preview rollback without executing")
  .action(
    asyncAction(async (options) => {
      const dbPath = getDbPath(options.db);
      const db = openDatabase(dbPath);

      try {
        console.log(`Connecting to database: ${dbPath}`);

        if (options.to) {
          const targetVersion = parseInt(options.to, 10);
          console.log(`Rolling back to version ${targetVersion}...`);

          const rolledBack = await rollbackToVersion(db, targetVersion, {
            dryRun: options.dryRun ?? false,
          });

          if (rolledBack.length === 0) {
            console.log("No migrations to rollback");
          } else {
            console.log(`Rolled back ${rolledBack.length} migration(s):`);
            for (const version of rolledBack) {
              console.log(`  ✓ Rolled back v${version}`);
            }
          }

          if (options.dryRun) {
            console.log("(dry-run mode - no changes were made)");
          }
        } else if (options.version) {
          const version = parseInt(options.version, 10);
          console.log(`Rolling back migration v${version}...`);

          const success = await rollbackMigration(db, version, {
            dryRun: options.dryRun ?? false,
          });

          if (success) {
            console.log(`✓ Rolled back v${version}`);
          } else {
            console.log(`Migration v${version} not found or already rolled back`);
          }

          if (options.dryRun) {
            console.log("(dry-run mode - no changes were made)");
          }
        } else {
          console.error("Either --to or --version must be specified");
          process.exit(1);
        }
      } catch (error) {
        console.error("Rollback failed:", error);
        process.exit(1);
      } finally {
        db.close();
      }
    })
  );

/**
 * Show migration status.
 */
program
  .command("status")
  .description("Show migration status")
  .option("-d, --db <path>", "Database path", DEFAULT_DB_PATH)
  .action(
    asyncAction(async (options) => {
      const dbPath = getDbPath(options.db);
      const db = openDatabase(dbPath);

      try {
        const status = await getMigrationStatus(db);

        console.log("Migration Status:");
        console.log(`  Current Version: ${status.currentVersion}`);
        console.log(`  Latest Version: ${status.latestVersion}`);
        console.log(`  Applied: ${status.applied.length}`);
        console.log(`  Pending: ${status.pending.length}`);

        if (status.applied.length > 0) {
          console.log("\nApplied Migrations:");
          for (const record of status.applied) {
            console.log(
              `  ✓ v${record.version}: ${record.name} (${formatDuration(record.executionTimeMs)})`
            );
          }
        }

        if (status.pending.length > 0) {
          console.log("\nPending Migrations:");
          for (const migration of status.pending) {
            console.log(`  - v${migration.version}: ${migration.description}`);
          }
        }

        if (status.pending.length === 0 && status.currentVersion > 0) {
          console.log("\n✓ Database is up to date");
        }
      } catch (error) {
        console.error("Failed to get status:", error);
        process.exit(1);
      } finally {
        db.close();
      }
    })
  );

/**
 * Create a new migration.
 */
program
  .command("create <name>")
  .description("Create a new migration file")
  .option("--description <text>", "Migration description")
  .option("--validation", "Include validation template")
  .action(
    asyncAction(async (name, options) => {
      const description = options.description ?? name;
      const filepath = await createMigration(name, description, options.validation ?? false);

      console.log(`✓ Migration created: ${filepath}`);
      console.log("\nNext steps:");
      console.log("  1. Edit the migration file to implement up() and down()");
      console.log("  2. Run tests: npm test -- migration.test.ts");
      console.log("  3. Apply migration: npm run migrate:up");
    })
  );

/**
 * Validate database.
 */
program
  .command("validate")
  .description("Validate database integrity")
  .option("-d, --db <path>", "Database path", DEFAULT_DB_PATH)
  .action(
    asyncAction(async (options) => {
      const dbPath = getDbPath(options.db);
      const db = openDatabase(dbPath);

      try {
        console.log(`Validating database: ${dbPath}`);

        const validation = validateDatabase(db);

        if (validation.valid) {
          console.log("✓ Database is valid");
        } else {
          console.error("✗ Database validation failed:");

          for (const error of validation.errors) {
            console.error(`  - ${error}`);
          }
        }

        if (validation.warnings.length > 0) {
          console.log("\nWarnings:");
          for (const warning of validation.warnings) {
            console.log(`  - ${warning}`);
          }
        }

        if (!validation.valid) {
          process.exit(1);
        }
      } catch (error) {
        console.error("Validation failed:", error);
        process.exit(1);
      } finally {
        db.close();
      }
    })
  );

/**
 * Backup management.
 */
program
  .command("backup")
  .description("Create a database backup")
  .option("-d, --db <path>", "Database path", DEFAULT_DB_PATH)
  .action(
    asyncAction(async (options) => {
      const dbPath = getDbPath(options.db);

      try {
        console.log(`Creating backup of: ${dbPath}`);
        const backupPath = await createBackup(dbPath);
        console.log(`✓ Backup created: ${backupPath}`);
      } catch (error) {
        console.error("Backup failed:", error);
        process.exit(1);
      }
    })
  );

program
  .command("restore <backup>")
  .description("Restore from backup")
  .option("-d, --db <path>", "Database path", DEFAULT_DB_PATH)
  .action(
    asyncAction(async (backupPath, options) => {
      const dbPath = getDbPath(options.db);

      try {
        console.log(`Restoring backup to: ${dbPath}`);
        await restoreBackup(backupPath, dbPath);
        console.log("✓ Backup restored successfully");
      } catch (error) {
        console.error("Restore failed:", error);
        process.exit(1);
      }
    })
  );

program
  .command("list-backups")
  .description("List available backups")
  .action(
    asyncAction(async () => {
      try {
        const backups = await listBackups();

        if (backups.length === 0) {
          console.log("No backups found");
          return;
        }

        console.log(`Found ${backups.length} backup(s):\n`);

        for (const backup of backups) {
          const sizeMB = (backup.size / 1024 / 1024).toFixed(2);
          const date = new Date(backup.created).toLocaleString();
          console.log(`  ${backup.path}`);
          console.log(`    Size: ${sizeMB} MB | Created: ${date}`);
        }
      } catch (error) {
        console.error("Failed to list backups:", error);
        process.exit(1);
      }
    })
  );

program
  .command("cleanup-backups")
  .description("Remove old backups")
  .option("--keep <count>", "Number of backups to keep", "10")
  .action(
    asyncAction(async (options) => {
      try {
        const keepCount = parseInt(options.keep, 10);
        console.log(`Cleaning up backups (keeping ${keepCount} most recent)...`);

        const deleted = await cleanupOldBackups(keepCount);

        if (deleted === 0) {
          console.log("No backups to delete");
        } else {
          console.log(`✓ Deleted ${deleted} old backup(s)`);
        }
      } catch (error) {
        console.error("Cleanup failed:", error);
        process.exit(1);
      }
    })
  );

/**
 * Initialize a new database.
 */
program
  .command("init")
  .description("Initialize a new database")
  .option("-d, --db <path>", "Database path", DEFAULT_DB_PATH)
  .action(
    asyncAction(async (options) => {
      const dbPath = getDbPath(options.db);

      if (existsSync(dbPath)) {
        console.error(`Database already exists: ${dbPath}`);
        console.error("Use --force to overwrite");
        process.exit(1);
      }

      try {
        console.log(`Creating database: ${dbPath}`);

        // Create directory if it doesn't exist
        const dir = resolve(dbPath, "..");
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }

        const db = new Database(dbPath);

        // Run migrations
        await runMigrations(db);

        console.log("✓ Database initialized successfully");
        console.log(`  Location: ${dbPath}`);
        console.log(`  Version: ${(await getMigrationStatus(db)).currentVersion}`);

        db.close();
      } catch (error) {
        console.error("Initialization failed:", error);
        process.exit(1);
      }
    })
  );

/**
 * Seed database with initial data.
 */
program
  .command("seed")
  .description("Seed database with initial data")
  .option("-d, --db <path>", "Database path", DEFAULT_DB_PATH)
  .option("-e, --env <environment>", "Environment (dev, test)", "dev")
  .option("--dry-run", "Preview seeding without executing")
  .action(
    asyncAction(async (options) => {
      const dbPath = getDbPath(options.db);
      const db = openDatabase(dbPath);

      try {
        const environment = (options.env ?? "dev") as "dev" | "test";
        console.log(`Seeding database for environment: ${environment}`);

        if (options.dryRun) {
          console.log("(dry-run mode - no changes will be made)");
        }

        const seedData = getSeedDataForEnvironment(environment);

        if (seedData.length === 0) {
          console.log("No seed data available for this environment");
          return;
        }

        if (options.dryRun) {
          console.log("\nSeed data preview:");
          for (const seed of seedData) {
            console.log(`  Table: ${seed.table}`);
            console.log(`    Rows: ${seed.data.length}`);
          }
          return;
        }

        const results = seedReferenceData(db, seedData);

        let totalInserted = 0;
        let totalSkipped = 0;
        let totalErrors = 0;

        console.log("\nSeeding results:");
        for (const result of results) {
          console.log(`  Table: ${result.table}`);
          console.log(`    Inserted: ${result.inserted}`);
          console.log(`    Skipped: ${result.skipped}`);
          if (result.errors.length > 0) {
            console.log(`    Errors: ${result.errors.length}`);
            totalErrors += result.errors.length;
            for (const error of result.errors) {
              console.log(`      - ${error}`);
            }
          }
          totalInserted += result.inserted;
          totalSkipped += result.skipped;
        }

        console.log(`\nTotal: ${totalInserted} inserted, ${totalSkipped} skipped`);

        if (totalErrors > 0) {
          console.error(`Seeding completed with ${totalErrors} error(s)`);
          process.exit(1);
        } else {
          console.log("✓ Seeding completed successfully");
        }
      } catch (error) {
        console.error("Seeding failed:", error);
        process.exit(1);
      } finally {
        db.close();
      }
    })
  );

// ============================================================================
// Parse and Execute
// ============================================================================

program.parseAsync().catch((error) => {
  console.error("Command failed:", error);
  process.exit(1);
});

// ============================================================================
// Helper Functions (Internal)
// ============================================================================

async function mkdir(path: string, options?: { recursive: boolean }): Promise<void> {
  const { mkdir } = await import("node:fs/promises");
  return mkdir(path, options);
}
