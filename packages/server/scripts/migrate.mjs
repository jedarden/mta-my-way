#!/usr/bin/env node
/**
 * Migration CLI tool.
 *
 * Usage:
 *   node scripts/migrate.mjs status
 *   node scripts/migrate.mjs up [--dry-run] [--backup]
 *   node scripts/migrate.mjs down <version> [--dry-run]
 *   node scripts/migrate.mjs rollback <version> [--dry-run]
 *   node scripts/migrate.mjs create <name> <description> [--validate]
 *   node scripts/migrate.mjs validate
 *   node scripts/migrate.mjs backup
 *   node scripts/migrate.mjs restore <backup-path>
 *   node scripts/migrate.mjs backups
 *   node scripts/migrate.mjs cleanup [--keep=10]
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = dirname(__dirname);

// Import migration functions - need to use dynamic import for ESM
async function importMigrations() {
  const migrationPath = join(SERVER_DIR, "dist", "migration", "migration.js");
  const { default: dynamicImport } = await import(migrationPath);
  return dynamicImport;
}

// Default database path
const DEFAULT_DB_PATH = join(SERVER_DIR, "..", "data", "subscriptions.db");

/**
 * Parse command line arguments.
 */
function parseCliArgs(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      backup: { type: "boolean", default: false },
      validate: { type: "boolean", default: false },
      keep: { type: "string", default: "10" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  return { values, positionals };
}

/**
 * Show help message.
 */
function showHelp() {
  console.log(`
MTA My Way Migration CLI

Usage:
  node scripts/migrate.mjs <command> [options]

Commands:
  status                    Show migration status (current version, pending migrations)
  up [options]              Run all pending migrations
  down <version> [options]  Rollback to a specific version
  rollback <version>        Rollback a specific migration
  create <name> <desc>      Create a new migration file
  validate                  Validate database integrity
  backup                    Create a database backup
  restore <path>            Restore from backup
  backups                   List all backups
  cleanup [options]         Clean up old backups

Options:
  --dry-run                 Preview changes without executing
  --backup                  Create backup before running migrations
  --validate                Include validation in new migration
  --keep=<n>                Number of backups to keep (default: 10)
  -h, --help                Show this help message

Examples:
  node scripts/migrate.mjs status
  node scripts/migrate.mjs up
  node scripts/migrate.mjs up --dry-run
  node scripts/migrate.mjs up --backup
  node scripts/migrate.mjs rollback 16
  node scripts/migrate.mjs down 15
  node scripts/migrate.mjs create add-index "Add index on users table"
  node scripts/migrate.mjs validate
  node scripts/migrate.mjs backup
  node scripts/migrate.mjs cleanup --keep=5
`);
}

/**
 * Get database path from environment or default.
 */
function getDbPath() {
  return process.env.PUSH_DB_PATH || DEFAULT_DB_PATH;
}

/**
 * Initialize database connection.
 */
function initDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

/**
 * Main CLI entry point.
 */
async function main() {
  const args = process.argv.slice(2);
  const { values, positionals } = parseCliArgs(args);

  if (values.help || positionals.length === 0) {
    showHelp();
    process.exit(positionals.length === 0 ? 1 : 0);
  }

  const command = positionals[0];
  const dbPath = getDbPath();

  console.error(
    JSON.stringify({
      event: "migrate_cli_start",
      command,
      dbPath,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    // Import migration module from dist
    const {
      runMigrations,
      rollbackMigration,
      rollbackToVersion,
      getMigrationStatus,
      createMigration,
      validateDatabase,
      createBackup,
      restoreBackup,
      listBackups,
      cleanupOldBackups,
    } = await import(join(SERVER_DIR, "dist", "migration", "index.js"));

    let db;

    switch (command) {
      case "status": {
        db = initDatabase(dbPath);
        const status = await getMigrationStatus(db);

        console.log(
          JSON.stringify(
            {
              event: "migration_status",
              currentVersion: status.currentVersion,
              latestVersion: status.latestVersion,
              appliedCount: status.applied.length,
              pendingCount: status.pending.length,
              applied: status.applied,
              pending: status.pending.map((m) => ({
                version: m.version,
                name: m.name,
                description: m.description,
              })),
            },
            null,
            2
          )
        );

        db.close();
        break;
      }

      case "up": {
        db = initDatabase(dbPath);

        if (values.backup) {
          console.error(JSON.stringify({ event: "creating_backup" }));
          await createBackup(dbPath);
        }

        const results = await runMigrations(db, {
          dryRun: values.dryRun,
          backup: values.backup,
        });

        console.log(
          JSON.stringify(
            {
              event: "migrations_complete",
              dryRun: values.dryRun,
              results,
            },
            null,
            2
          )
        );

        db.close();
        break;
      }

      case "rollback": {
        if (positionals.length < 2) {
          console.error("Error: rollback command requires a version number");
          console.error("Usage: node scripts/migrate.mjs rollback <version>");
          process.exit(1);
        }

        const version = parseInt(positionals[1], 10);
        if (isNaN(version)) {
          console.error(`Error: Invalid version number: ${positionals[1]}`);
          process.exit(1);
        }

        db = initDatabase(dbPath);
        const success = await rollbackMigration(db, version, {
          dryRun: values.dryRun,
        });

        console.log(
          JSON.stringify(
            {
              event: "rollback_complete",
              version,
              success,
              dryRun: values.dryRun,
            },
            null,
            2
          )
        );

        db.close();
        break;
      }

      case "down": {
        if (positionals.length < 2) {
          console.error("Error: down command requires a target version number");
          console.error("Usage: node scripts/migrate.mjs down <target-version>");
          process.exit(1);
        }

        const targetVersion = parseInt(positionals[1], 10);
        if (isNaN(targetVersion)) {
          console.error(`Error: Invalid version number: ${positionals[1]}`);
          process.exit(1);
        }

        db = initDatabase(dbPath);
        const rolledBack = await rollbackToVersion(db, targetVersion, {
          dryRun: values.dryRun,
          backup: values.backup,
        });

        console.log(
          JSON.stringify(
            {
              event: "rollback_to_version_complete",
              targetVersion,
              rolledBackVersions: rolledBack,
              dryRun: values.dryRun,
            },
            null,
            2
          )
        );

        db.close();
        break;
      }

      case "create": {
        if (positionals.length < 3) {
          console.error("Error: create command requires name and description");
          console.error("Usage: node scripts/migrate.mjs create <name> <description>");
          process.exit(1);
        }

        const name = positionals[1];
        const description = positionals.slice(2).join(" ");

        const filepath = await createMigration(name, description, values.validate);

        console.log(
          JSON.stringify(
            {
              event: "migration_created",
              filepath,
              name,
              description,
            },
            null,
            2
          )
        );
        break;
      }

      case "validate": {
        db = initDatabase(dbPath);
        const validation = validateDatabase(db);

        console.log(
          JSON.stringify(
            {
              event: "validation_complete",
              valid: validation.valid,
              errors: validation.errors,
              warnings: validation.warnings,
            },
            null,
            2
          )
        );

        db.close();
        process.exit(validation.valid ? 0 : 1);
        break;
      }

      case "backup": {
        const backupPath = await createBackup(dbPath);

        console.log(
          JSON.stringify(
            {
              event: "backup_complete",
              backupPath,
              dbPath,
            },
            null,
            2
          )
        );
        break;
      }

      case "restore": {
        if (positionals.length < 2) {
          console.error("Error: restore command requires a backup path");
          console.error("Usage: node scripts/migrate.mjs restore <backup-path>");
          process.exit(1);
        }

        const backupPath = positionals[1];
        await restoreBackup(backupPath, dbPath);

        console.log(
          JSON.stringify(
            {
              event: "restore_complete",
              backupPath,
              dbPath,
            },
            null,
            2
          )
        );
        break;
      }

      case "backups": {
        const backups = await listBackups();

        console.log(
          JSON.stringify(
            {
              event: "backups_listed",
              count: backups.length,
              backups: backups.map((b) => ({
                path: b.path,
                size: b.size,
                created: b.created.toISOString(),
              })),
            },
            null,
            2
          )
        );
        break;
      }

      case "cleanup": {
        const keepCount = parseInt(values.keep, 10);
        const deleted = await cleanupOldBackups(keepCount);

        console.log(
          JSON.stringify(
            {
              event: "backups_cleanup_complete",
              deletedCount: deleted,
              keepCount,
            },
            null,
            2
          )
        );
        break;
      }

      default:
        console.error(`Error: Unknown command: ${command}`);
        console.error("Run 'node scripts/migrate.mjs --help' for usage information");
        process.exit(1);
    }

    console.error(
      JSON.stringify({
        event: "migrate_cli_success",
        command,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "migrate_cli_error",
        command,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      })
    );

    // Clean shutdown on error
    console.error(`Migration failed: ${error.message}`);
    process.exit(1);
  }
}

main();
