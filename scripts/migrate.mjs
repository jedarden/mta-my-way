#!/usr/bin/env node
/**
 * Migration CLI tool for MTA My Way.
 *
 * Provides command-line interface for database migrations including:
 * - Running pending migrations
 * - Rolling back migrations
 * - Creating new migration files
 * - Backup and restore
 * - Validation
 *
 * Usage:
 *   node scripts/migrate.mjs [command] [options]
 *
 * Commands:
 *   (none)           Run all pending migrations
 *   status           Show migration status
 *   up [version]     Run migrations up to version
 *   down <version>   Rollback a specific migration
 *   rollback <ver>   Rollback to a specific version
 *   create <name>    Create a new migration file
 *   validate         Validate database integrity
 *   backup           Create a database backup
 *   restore <file>   Restore from backup
 *   backups          List available backups
 *   cleanup [n]      Delete old backups (keep n, default: 10)
 *
 * Options:
 *   --dry-run        Preview changes without executing
 *   --force          Run even if validation fails
 *   --db <path>      Custom database path
 *   --no-backup      Skip automatic backup
 *   --help           Show this help message
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// Import migration functions from built TypeScript
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_MODULE = join(__dirname, "../packages/server/dist/migration/index.js");

// Dynamic import to support optional dependencies
let migrationModule;

async function loadMigrationModule() {
  if (!migrationModule) {
    migrationModule = await import(MIGRATION_MODULE);
  }
  return migrationModule;
}

// Default database path
const DEFAULT_DB_PATH = join(__dirname, "../packages/server/data/subscriptions.db");

/**
 * Parse command-line arguments.
 */
function parseArguments(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      db: { type: "string", default: DEFAULT_DB_PATH },
      "no-backup": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      validate: { type: "boolean", default: false },
    },
  });
  return { values, positionals };
}

/**
 * Show help message.
 */
function showHelp() {
  console.log(`
Migration CLI tool for MTA My Way

Usage:
  node scripts/migrate.mjs [command] [options]

Commands:
  (none)           Run all pending migrations
  status           Show migration status
  up [version]     Run migrations up to specific version
  down <version>   Rollback a specific migration
  rollback <ver>   Rollback to a specific version
  create <name>    Create a new migration file
  validate         Validate database integrity
  backup           Create a database backup
  restore <file>   Restore from backup
  backups          List available backups
  cleanup [n]      Delete old backups (keep n, default: 10)

Options:
  --dry-run        Preview changes without executing
  --force          Run even if validation fails
  --db <path>      Custom database path (default: packages/server/data/subscriptions.db)
  --no-backup      Skip automatic backup before migrations
  --help           Show this help message
  --validate       Include validation in new migration

Examples:
  node scripts/migrate.mjs                    # Run pending migrations
  node scripts/migrate.mjs status              # Show status
  node scripts/migrate.mjs up 5               # Run up to version 5
  node scripts/migrate.mjs rollback 10        # Rollback to version 10
  node scripts/migrate.mjs create add-users   # Create new migration
  node scripts/migrate.mjs backup             # Create backup
  node scripts/migrate.mjs --dry-run          # Preview migrations
`);
}

/**
 * Initialize database connection.
 */
async function initDatabase(dbPath) {
  const Database = await import("better-sqlite3");
  const db = new Database.default(dbPath);
  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");
  return db;
}

/**
 * Command: Run all pending migrations.
 */
async function cmdMigrate(db, options) {
  const { runMigrations } = await loadMigrationModule();

  console.log(JSON.stringify({ event: "migrate_start", dryRun: options.dryRun }));

  const results = await runMigrations(db, {
    dryRun: options.dryRun,
    force: options.force,
  });

  const applied = results.filter((r) => r.applied);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => r.error);

  console.log(
    JSON.stringify({
      event: "migrate_complete",
      applied: applied.length,
      skipped: skipped.length,
      failed: failed.length,
      results,
    })
  );

  if (failed.length > 0) {
    process.exit(1);
  }
}

/**
 * Command: Show migration status.
 */
async function cmdStatus(db) {
  const { getMigrationStatus } = await loadMigrationModule();

  const status = await getMigrationStatus(db);

  console.log(
    JSON.stringify(
      {
        event: "migration_status",
        currentVersion: status.currentVersion,
        latestVersion: status.latestVersion,
        appliedCount: status.applied.length,
        pendingCount: status.pending.length,
        applied: status.applied.map((a) => ({
          version: a.version,
          name: a.name,
          description: a.description,
          appliedAt: a.appliedAt,
          executionTimeMs: a.executionTimeMs,
        })),
        pending: status.pending.map((p) => ({
          version: p.version,
          name: p.name,
          description: p.description,
        })),
      },
      null,
      2
    )
  );
}

/**
 * Command: Run migrations up to a version.
 */
async function cmdUp(db, targetVersion, options) {
  const { runMigrations } = await loadMigrationModule();
  const version = targetVersion ? parseInt(targetVersion, 10) : undefined;

  console.log(
    JSON.stringify({
      event: "migrate_up",
      targetVersion: version,
      dryRun: options.dryRun,
    })
  );

  const results = await runMigrations(db, { dryRun: options.dryRun, force: options.force }, version);

  const applied = results.filter((r) => r.applied);

  console.log(
    JSON.stringify({
      event: "migrate_up_complete",
      applied: applied.length,
      targetVersion: version,
    })
  );
}

/**
 * Command: Rollback a specific migration.
 */
async function cmdDown(db, version, options) {
  const { rollbackMigration } = await loadMigrationModule();
  const targetVersion = parseInt(version, 10);

  console.log(
    JSON.stringify({
      event: "migrate_down",
      version: targetVersion,
      dryRun: options.dryRun,
    })
  );

  const success = await rollbackMigration(db, targetVersion, { dryRun: options.dryRun });

  if (success) {
    console.log(
      JSON.stringify({
        event: "migrate_down_complete",
        version: targetVersion,
      })
    );
  } else {
    console.log(
      JSON.stringify({
        event: "migrate_down_failed",
        version: targetVersion,
        reason: "Migration not found or not applied",
      })
    );
    process.exit(1);
  }
}

/**
 * Command: Rollback to a specific version.
 */
async function cmdRollback(db, targetVersion, options) {
  const { rollbackToVersion } = await loadMigrationModule();
  const version = parseInt(targetVersion, 10);

  console.log(
    JSON.stringify({
      event: "rollback_to_version",
      targetVersion: version,
      dryRun: options.dryRun,
    })
  );

  const rolledBack = await rollbackToVersion(db, version, { dryRun: options.dryRun });

  console.log(
    JSON.stringify({
      event: "rollback_complete",
      targetVersion: version,
      rolledBackCount: rolledBack.length,
      rolledBackVersions: rolledBack,
    })
  );
}

/**
 * Command: Create a new migration file.
 */
async function cmdCreate(name, options) {
  const { createMigration } = await loadMigrationModule();

  if (!name) {
    console.error("Error: Migration name is required");
    console.error("Usage: node scripts/migrate.mjs create <migration-name>");
    process.exit(1);
  }

  // Convert name to kebab-case if it contains spaces
  const migrationName = name.toLowerCase().replace(/\s+/g, "-");
  const description = name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  console.log(
    JSON.stringify({
      event: "create_migration",
      name: migrationName,
      description,
    })
  );

  const filepath = await createMigration(migrationName, description, options.validate);

  console.log(
    JSON.stringify({
      event: "migration_created",
      filepath,
    })
  );
}

/**
 * Command: Validate database integrity.
 */
async function cmdValidate(db) {
  const { validateDatabase } = await loadMigrationModule();

  console.log(JSON.stringify({ event: "validate_start" }));

  const result = validateDatabase(db);

  console.log(
    JSON.stringify({
      event: "validate_complete",
      valid: result.valid,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      errors: result.errors,
      warnings: result.warnings,
    })
  );

  if (!result.valid) {
    process.exit(1);
  }
}

/**
 * Command: Create a database backup.
 */
async function cmdBackup(db, dbPath) {
  const { createBackup } = await loadMigrationModule();

  console.log(
    JSON.stringify({
      event: "backup_start",
      database: dbPath,
    })
  );

  const backupPath = await createBackup(dbPath);

  console.log(
    JSON.stringify({
      event: "backup_complete",
      backupPath,
    })
  );
}

/**
 * Command: Restore from backup.
 */
async function cmdRestore(backupFile, dbPath) {
  const { restoreBackup } = await loadMigrationModule();

  if (!backupFile) {
    console.error("Error: Backup file path is required");
    console.error("Usage: node scripts/migrate.mjs restore <backup-file>");
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      event: "restore_start",
      backup: backupFile,
      target: dbPath,
    })
  );

  await restoreBackup(backupFile, dbPath);

  console.log(
    JSON.stringify({
      event: "restore_complete",
      backup: backupFile,
      target: dbPath,
    })
  );
}

/**
 * Command: List available backups.
 */
async function cmdBackups() {
  const { listBackups } = await loadMigrationModule();

  const backups = await listBackups();

  console.log(
    JSON.stringify({
      event: "backups_list",
      count: backups.length,
      backups: backups.map((b) => ({
        path: b.path,
        size: b.size,
        created: b.created.toISOString(),
      })),
    })
  );
}

/**
 * Command: Cleanup old backups.
 */
async function cmdCleanup(keepCount) {
  const { cleanupOldBackups } = await loadMigrationModule();
  const keep = keepCount ? parseInt(keepCount, 10) : 10;

  console.log(
    JSON.stringify({
      event: "cleanup_start",
      keepCount: keep,
    })
  );

  const deletedCount = await cleanupOldBackups(keep);

  console.log(
    JSON.stringify({
      event: "cleanup_complete",
      deletedCount,
      remainingCount: Math.max(0, keep - deletedCount),
    })
  );
}

/**
 * Main entry point.
 */
async function main() {
  const args = process.argv.slice(2);
  const { values, positionals } = parseArguments(args);

  if (values.help) {
    showHelp();
    return;
  }

  const [command, ...commandArgs] = positionals;

  try {
    let db;

    // Commands that don't require database connection
    if (command === "create") {
      await cmdCreate(commandArgs[0], values);
      return;
    }

    if (command === "backups") {
      await cmdBackups();
      return;
    }

    if (command === "restore") {
      await cmdRestore(commandArgs[0], values.db);
      return;
    }

    if (command === "cleanup") {
      await cmdCleanup(commandArgs[0]);
      return;
    }

    // Commands that require database connection
    try {
      db = await initDatabase(values.db);
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "database_init_error",
          error: err.message,
          dbPath: values.db,
        })
      );
      process.exit(1);
    }

    try {
      switch (command) {
        case "status":
          await cmdStatus(db);
          break;

        case "up":
          await cmdUp(db, commandArgs[0], values);
          break;

        case "down":
          if (!commandArgs[0]) {
            console.error("Error: Version number is required for 'down' command");
            process.exit(1);
          }
          await cmdDown(db, commandArgs[0], values);
          break;

        case "rollback":
          if (!commandArgs[0]) {
            console.error("Error: Target version is required for 'rollback' command");
            process.exit(1);
          }
          await cmdRollback(db, commandArgs[0], values);
          break;

        case "validate":
          await cmdValidate(db);
          break;

        case "backup":
          await cmdBackup(db, values.db);
          break;

        default:
          // No command specified - run pending migrations
          if (!command || command === "") {
            // Create backup before migrations unless disabled
            if (!values["no-backup"] && !values.dryRun) {
              try {
                await cmdBackup(db, values.db);
              } catch (err) {
                console.warn("Warning: Backup failed, proceeding with migrations:", err.message);
              }
            }
            await cmdMigrate(db, values);
          } else {
            console.error(`Unknown command: ${command}`);
            console.error('Run "node scripts/migrate.mjs --help" for usage');
            process.exit(1);
          }
      }
    } finally {
      if (db) {
        db.close();
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "error",
        command,
        error: err.message,
        stack: err.stack,
      })
    );
    process.exit(1);
  }
}

main();
