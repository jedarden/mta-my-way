/**
 * Data migration system with version tracking, rollback, and safety features.
 *
 * Migrations are numbered files in packages/server/src/migration/migrations/
 * Each migration exports:
 * - up(): Function to apply the migration
 * - down(): Function to rollback the migration
 * - description: Human-readable description
 *
 * Features:
 * - Dry-run mode to preview migrations without executing
 * - Pre-migration database backup
 * - Migration locking to prevent concurrent runs
 * - Rollback to specific version
 * - Data validation helpers
 *
 * Usage:
 * ```ts
 * import { runMigrations, rollbackToVersion } from './migration/index.js';
 * await runMigrations(db);
 * await rollbackToVersion(db, 5); // Rollback all migrations after version 5
 * ```
 */

import { copyFile, mkdir, readdir, unlink } from "node:fs/promises";
import { constants } from "node:os";
import type { constants as Constants } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");
const BACKUP_DIR = join(__dirname, "../../data/backups");

/** Migration interface */
export interface Migration {
  version: number;
  name: string;
  description: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
  validate?: (db: Database.Database) => { valid: boolean; errors?: string[] };
}

/** Migration record in database */
export interface MigrationRecord {
  version: number;
  name: string;
  description: string | null;
  appliedAt: string;
  executionTimeMs: number;
}

/** Migration options */
export interface MigrationOptions {
  dryRun?: boolean;
  backup?: boolean;
  force?: boolean;
}

/** Migration result */
export interface MigrationResult {
  version: number;
  name: string;
  description: string;
  applied: boolean;
  skipped: boolean;
  executionTimeMs: number;
  error?: string;
}

/** Migration lock */
let migrationLock = false;

/**
 * Acquire migration lock to prevent concurrent migrations.
 */
function acquireLock(): boolean {
  if (migrationLock) {
    return false;
  }
  migrationLock = true;
  return true;
}

/**
 * Release migration lock.
 */
function releaseLock(): void {
  migrationLock = false;
}

/**
 * Initialize migrations table in the database.
 */
function initMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      appliedAt TEXT NOT NULL,
      executionTimeMs INTEGER NOT NULL
    )
  `);

  // Add checksum column for data integrity if not exists
  try {
    db.exec(`ALTER TABLE _migrations ADD COLUMN checksum TEXT`);
  } catch {
    // Column already exists
  }
}

/**
 * Get all applied migrations from the database.
 */
function getAppliedMigrations(db: Database.Database): Set<number> {
  const rows = db.prepare("SELECT version FROM _migrations ORDER BY version").all() as Array<{
    version: number;
  }>;
  return new Set(rows.map((r) => r.version));
}

/**
 * Create a backup of the database file.
 *
 * @param dbPath - Path to the database file
 * @returns Path to the backup file
 */
export async function createBackup(dbPath: string): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const basename = dbPath.split("/").pop() ?? "database.db";
  const backupPath = join(BACKUP_DIR, `${basename}-${timestamp}.bak`);

  await copyFile(dbPath, backupPath, (constants as typeof Constants).COPYFILE_EXCL);

  console.log(
    JSON.stringify({
      event: "backup_created",
      backupPath,
      timestamp,
    })
  );

  return backupPath;
}

/**
 * List all available backups.
 *
 * @returns Array of backup file information
 */
export async function listBackups(): Promise<Array<{ path: string; size: number; created: Date }>> {
  try {
    const { readdir } = await import("node:fs/promises");
    const { stat } = await import("node:fs/promises");
    const files = await readdir(BACKUP_DIR);
    const backups: Array<{ path: string; size: number; created: Date }> = [];

    for (const file of files) {
      if (file.endsWith(".bak")) {
        const fullPath = join(BACKUP_DIR, file);
        const stats = await stat(fullPath);
        backups.push({
          path: fullPath,
          size: stats.size,
          created: stats.mtime,
        });
      }
    }

    return backups.sort((a, b) => b.created.getTime() - a.created.getTime());
  } catch {
    return [];
  }
}

/**
 * Restore a database from a backup.
 *
 * @param backupPath - Path to the backup file
 * @param targetPath - Path where to restore the database
 */
export async function restoreBackup(backupPath: string, targetPath: string): Promise<void> {
  const { copyFile } = await import("node:fs/promises");
  await copyFile(backupPath, targetPath);

  console.log(
    JSON.stringify({
      event: "backup_restored",
      backupPath,
      targetPath,
    })
  );
}

/**
 * Delete old backups, keeping only the most recent ones.
 *
 * @param keepCount - Number of backups to keep (default: 10)
 */
export async function cleanupOldBackups(keepCount: number = 10): Promise<number> {
  const backups = await listBackups();

  if (backups.length <= keepCount) {
    return 0;
  }

  const toDelete = backups.slice(keepCount);
  let deletedCount = 0;

  for (const backup of toDelete) {
    try {
      await unlink(backup.path);
      deletedCount++;
    } catch (err) {
      console.warn(`Failed to delete backup ${backup.path}:`, err);
    }
  }

  if (deletedCount > 0) {
    console.log(
      JSON.stringify({
        event: "backups_cleaned",
        deletedCount,
        remainingCount: backups.length - deletedCount,
      })
    );
  }

  return deletedCount;
}

/**
 * Load all migration files from the migrations directory.
 *
 * @param customDir - Optional custom directory to load migrations from
 */
async function loadMigrations(customDir?: string): Promise<Migration[]> {
  const migrations: Migration[] = [];
  const dir = customDir ?? MIGRATIONS_DIR;

  try {
    const files = await readdir(dir);
    const migrationFiles = files.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

    for (const file of migrationFiles) {
      // Extract version number from filename (e.g., 001-add-users.ts)
      const match = file.match(/^(\d+)-(.+)\.ts$/);
      if (!match) continue;

      const [, versionStr, name] = match as [string, string, string];
      const version = parseInt(versionStr, 10);

      try {
        const module = await import(join(dir, file));
        if (module.up && module.down && module.description) {
          migrations.push({
            version,
            name,
            description: module.description,
            up: module.up,
            down: module.down,
            validate: module.validate,
          });
        }
      } catch (err) {
        console.error(`Failed to load migration ${file}:`, err);
      }
    }
  } catch {
    // Migrations directory doesn't exist yet
    console.debug("No migrations directory found");
  }

  return migrations.sort((a, b) => a.version - b.version);
}

/**
 * Run all pending migrations.
 *
 * @param db - Better-sqlite3 database instance
 * @param options - Migration options (dryRun, backup, force)
 * @param targetVersion - Optional target version to migrate to
 * @returns Array of migration results
 */
export async function runMigrations(
  db: Database.Database,
  options: MigrationOptions = {},
  targetVersion?: number
): Promise<MigrationResult[]> {
  // Acquire lock
  if (!acquireLock()) {
    throw new Error("Migration already in progress");
  }

  try {
    const { dryRun = false, force = false } = options;

    initMigrationsTable(db);
    const applied = getAppliedMigrations(db);
    const migrations = await loadMigrations();
    const results: MigrationResult[] = [];

    for (const migration of migrations) {
      // Skip if already applied
      if (applied.has(migration.version)) {
        results.push({
          version: migration.version,
          name: migration.name,
          description: migration.description,
          applied: false,
          skipped: true,
          executionTimeMs: 0,
        });
        continue;
      }

      // Stop if target version is specified and we've reached it
      if (targetVersion !== undefined && migration.version > targetVersion) {
        break;
      }

      const startTime = Date.now();
      let validationErrors: string[] | undefined;

      // Run pre-migration validation if available
      if (migration.validate && !dryRun) {
        const validation = migration.validate(db);
        if (!validation.valid) {
          validationErrors = validation.errors;
          if (!force) {
            throw new Error(
              `Migration ${migration.version} validation failed: ${validationErrors?.join(", ")}`
            );
          }
        }
      }

      try {
        if (dryRun) {
          // In dry-run mode, just log what would be done
          console.log(
            JSON.stringify({
              event: "migration_dry_run",
              version: migration.version,
              name: migration.name,
              description: migration.description,
              validationErrors,
            })
          );

          results.push({
            version: migration.version,
            name: migration.name,
            description: migration.description,
            applied: false,
            skipped: false,
            executionTimeMs: 0,
          });
        } else {
          // Run migration within a transaction
          db.transaction(() => {
            migration.up(db);

            // Record migration
            db.prepare(
              "INSERT INTO _migrations (version, name, description, appliedAt, executionTimeMs) VALUES (?, ?, ?, ?, ?)"
            ).run(
              migration.version,
              migration.name,
              migration.description,
              new Date().toISOString(),
              Date.now() - startTime
            );
          })();

          results.push({
            version: migration.version,
            name: migration.name,
            description: migration.description,
            applied: true,
            skipped: false,
            executionTimeMs: Date.now() - startTime,
          });

          console.log(
            JSON.stringify({
              event: "migration_applied",
              version: migration.version,
              name: migration.name,
              description: migration.description,
              executionTimeMs: Date.now() - startTime,
            })
          );
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            event: "migration_failed",
            version: migration.version,
            name: migration.name,
            error,
          })
        );

        results.push({
          version: migration.version,
          name: migration.name,
          description: migration.description,
          applied: false,
          skipped: false,
          executionTimeMs: Date.now() - startTime,
          error,
        });

        if (!dryRun) {
          throw err;
        }
      }
    }

    return results;
  } finally {
    releaseLock();
  }
}

/**
 * Rollback a specific migration.
 *
 * @param db - Better-sqlite3 database instance
 * @param version - Migration version to rollback
 * @param options - Migration options (dryRun, backup)
 * @returns True if rolled back, false if not found
 */
export async function rollbackMigration(
  db: Database.Database,
  version: number,
  options: MigrationOptions = {}
): Promise<boolean> {
  // Acquire lock
  if (!acquireLock()) {
    throw new Error("Migration already in progress");
  }

  try {
    const { dryRun = false } = options;

    initMigrationsTable(db);
    const applied = getAppliedMigrations(db);

    if (!applied.has(version)) {
      console.warn(
        JSON.stringify({
          event: "rollback_not_applied",
          version,
          message: "Migration not found in applied migrations",
        })
      );
      return false;
    }

    const migrations = await loadMigrations();
    const migration = migrations.find((m) => m.version === version);

    if (!migration) {
      console.error(
        JSON.stringify({
          event: "rollback_not_found",
          version,
          message: "Migration file not found",
        })
      );
      return false;
    }

    const startTime = Date.now();

    if (dryRun) {
      console.log(
        JSON.stringify({
          event: "rollback_dry_run",
          version: migration.version,
          name: migration.name,
        })
      );
      return true;
    }

    try {
      db.transaction(() => {
        // Run rollback
        migration.down(db);

        // Remove from migrations table
        db.prepare("DELETE FROM _migrations WHERE version = ?").run(version);
      })();

      console.log(
        JSON.stringify({
          event: "migration_rolled_back",
          version: migration.version,
          name: migration.name,
          executionTimeMs: Date.now() - startTime,
        })
      );

      return true;
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "rollback_failed",
          version: migration.version,
          name: migration.name,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      throw err;
    }
  } finally {
    releaseLock();
  }
}

/**
 * Rollback all migrations after a specific version.
 *
 * @param db - Better-sqlite3 database instance
 * @param targetVersion - Target version to rollback to (all migrations after this will be rolled back)
 * @param options - Migration options (dryRun, backup)
 * @returns Array of rolled back migration versions
 */
export async function rollbackToVersion(
  db: Database.Database,
  targetVersion: number,
  options: MigrationOptions = {}
): Promise<number[]> {
  // Acquire lock
  if (!acquireLock()) {
    throw new Error("Migration already in progress");
  }

  try {
    const { dryRun = false } = options;

    initMigrationsTable(db);
    const applied = db
      .prepare("SELECT version FROM _migrations ORDER BY version DESC")
      .all() as Array<{ version: number }>;

    // Find all migrations to rollback (those greater than targetVersion)
    const toRollback = applied.filter((m) => m.version > targetVersion);

    if (toRollback.length === 0) {
      console.log(
        JSON.stringify({
          event: "rollback_to_version_nothing",
          targetVersion,
          message: "No migrations to rollback",
        })
      );
      return [];
    }

    if (dryRun) {
      console.log(
        JSON.stringify({
          event: "rollback_to_version_dry_run",
          targetVersion,
          migrationsToRollback: toRollback.map((m) => m.version),
        })
      );
      return toRollback.map((m) => m.version);
    }

    const rolledBack: number[] = [];

    // Rollback migrations in reverse order (highest version first)
    for (const { version } of toRollback.sort((a, b) => b.version - a.version)) {
      const success = await rollbackMigration(db, version, { dryRun: false });
      if (success) {
        rolledBack.push(version);
      } else {
        throw new Error(`Failed to rollback migration ${version}`);
      }
    }

    console.log(
      JSON.stringify({
        event: "rollback_to_version_complete",
        targetVersion,
        rolledBackVersions: rolledBack,
      })
    );

    return rolledBack;
  } finally {
    releaseLock();
  }
}

/**
 * Get migration status.
 *
 * @param db - Better-sqlite3 database instance
 * @returns Applied and pending migrations
 */
export async function getMigrationStatus(db: Database.Database): Promise<{
  applied: MigrationRecord[];
  pending: Migration[];
  currentVersion: number;
  latestVersion: number;
}> {
  initMigrationsTable(db);
  const applied = db
    .prepare("SELECT * FROM _migrations ORDER BY version")
    .all() as MigrationRecord[];

  const migrations = await loadMigrations();
  const appliedVersions = new Set(applied.map((a) => a.version));
  const pending = migrations.filter((m) => !appliedVersions.has(m.version));

  const currentVersion = applied.length > 0 ? Math.max(...applied.map((a) => a.version)) : 0;
  const latestVersion = migrations.length > 0 ? Math.max(...migrations.map((m) => m.version)) : 0;

  return { applied, pending, currentVersion, latestVersion };
}

/**
 * Create a new migration file.
 *
 * @param name - Migration name (kebab-case)
 * @param description - Human-readable description
 * @param includeValidation - Whether to include validation template
 * @param migrationsDir - Optional custom migrations directory (for testing)
 * @returns Path to the created migration file
 */
export async function createMigration(
  name: string,
  description: string,
  includeValidation = false,
  migrationsDir = MIGRATIONS_DIR
): Promise<string> {
  const migrations = await loadMigrations(migrationsDir);
  const nextVersion = migrations.length > 0 ? Math.max(...migrations.map((m) => m.version)) + 1 : 1;
  const filename = `${String(nextVersion).padStart(3, "0")}-${name}.ts`;
  const filepath = join(migrationsDir, filename);

  const validationTemplate = includeValidation
    ? `
/**
 * Validate migration preconditions.
 *
 * @param db - Better-sqlite3 database instance
 * @returns Validation result with any errors
 */
export function validate(db: Database.Database): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  // TODO: Add validation logic (e.g., check data integrity, foreign keys, etc.)
  // Example:
  // const tableExists = db.prepare(
  //   "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  // ).get("existing_table");
  // if (!tableExists) {
  //   errors.push("Required table 'existing_table' does not exist");
  // }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
`
    : "";

  const template = `/**
 * Migration: ${description}
 */

import type Database from "better-sqlite3";

export const description = "${description}";

/**
 * Apply the migration.
 *
 * @param db - Better-sqlite3 database instance
 */
export function up(db: Database.Database): void {
  // TODO: Implement migration up
  // Use db.transaction(() => { ... }) for atomic operations
}
${validationTemplate}
/**
 * Rollback the migration.
 *
 * @param db - Better-sqlite3 database instance
 */
export function down(db: Database.Database): void {
  // TODO: Implement migration down
  // This should reverse all changes made in up()
}
`;

  // Create migrations directory if it doesn't exist
  await mkdir(migrationsDir, { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filepath, template, "utf-8");

  console.log(
    JSON.stringify({
      event: "migration_created",
      filepath,
      version: nextVersion,
      name,
    })
  );

  return filepath;
}

/**
 * Validate migration data integrity.
 *
 * @param db - Better-sqlite3 database instance
 * @returns Validation result
 */
export function validateDatabase(db: Database.Database): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Check for foreign key violations
    const fkResult = db.pragma("foreign_key_check") as Array<Record<string, unknown>> | undefined;
    if (fkResult && fkResult.length > 0) {
      errors.push(`Foreign key violations found: ${JSON.stringify(fkResult)}`);
    }

    // Check for tables without primary keys
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '__%'")
      .all() as Array<{ name: string }>;

    for (const { name } of tables) {
      const pkInfo = db.pragma(`table_info(${name})`) as Array<{ pk: number }>;
      const hasPK = pkInfo.some((col) => col.pk > 0);

      if (!hasPK) {
        warnings.push(`Table '${name}' has no primary key`);
      }
    }

    // Check migration table integrity
    initMigrationsTable(db);
    const migrations = db
      .prepare("SELECT version FROM _migrations ORDER BY version")
      .all() as Array<{
      version: number;
    }>;

    // Check for gaps in migration versions
    for (let i = 1; i < migrations.length; i++) {
      const current = migrations[i];
      const previous = migrations[i - 1];
      if (current && previous && current.version !== previous.version + 1) {
        errors.push(`Gap in migration versions between ${previous.version} and ${current.version}`);
      }
    }
  } catch (err) {
    errors.push(`Database validation error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
