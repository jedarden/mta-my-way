/**
 * Data migration system with version tracking and rollback support.
 *
 * Migrations are numbered files in packages/server/src/migration/migrations/
 * Each migration exports:
 * - up(): Function to apply the migration
 * - down(): Function to rollback the migration
 * - description: Human-readable description
 *
 * Usage:
 * ```ts
 * import { runMigrations, rollbackMigration } from './migration/index.js';
 * await runMigrations(db);
 * await rollbackMigration(db, 1);
 * ```
 */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

/** Migration interface */
export interface Migration {
  version: number;
  name: string;
  description: string;
  up: (db: Database.Database) => void;
  down: (db: Database.Database) => void;
}

/** Migration record in database */
interface MigrationRecord {
  version: number;
  name: string;
  appliedAt: string;
  executionTimeMs: number;
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
 * Load all migration files from the migrations directory.
 */
async function loadMigrations(): Promise<Migration[]> {
  const migrations: Migration[] = [];

  try {
    const files = await readdir(MIGRATIONS_DIR);
    const migrationFiles = files.filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

    for (const file of migrationFiles) {
      // Extract version number from filename (e.g., 001-add-users.ts)
      const match = file.match(/^(\d+)-(.+)\.ts$/);
      if (!match) continue;

      const [, versionStr, name] = match;
      const version = parseInt(versionStr, 10);

      try {
        const module = await import(join(MIGRATIONS_DIR, file));
        if (module.up && module.down && module.description) {
          migrations.push({
            version,
            name,
            description: module.description,
            up: module.up,
            down: module.down,
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
 * @param targetVersion - Optional target version to migrate to
 * @returns Array of applied migrations
 */
export async function runMigrations(
  db: Database.Database,
  targetVersion?: number
): Promise<MigrationRecord[]> {
  initMigrationsTable(db);
  const applied = getAppliedMigrations(db);
  const migrations = await loadMigrations();
  const appliedRecords: MigrationRecord[] = [];

  for (const migration of migrations) {
    // Skip if already applied
    if (applied.has(migration.version)) {
      continue;
    }

    // Stop if target version is specified and we've reached it
    if (targetVersion !== undefined && migration.version > targetVersion) {
      break;
    }

    const startTime = Date.now();

    try {
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

      appliedRecords.push({
        version: migration.version,
        name: migration.name,
        appliedAt: new Date().toISOString(),
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
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "migration_failed",
          version: migration.version,
          name: migration.name,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      throw err;
    }
  }

  return appliedRecords;
}

/**
 * Rollback a specific migration.
 *
 * @param db - Better-sqlite3 database instance
 * @param version - Migration version to rollback
 * @returns True if rolled back, false if not found
 */
export async function rollbackMigration(db: Database.Database, version: number): Promise<boolean> {
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
}> {
  initMigrationsTable(db);
  const applied = db
    .prepare("SELECT * FROM _migrations ORDER BY version")
    .all() as MigrationRecord[];

  const migrations = await loadMigrations();
  const appliedVersions = new Set(applied.map((a) => a.version));
  const pending = migrations.filter((m) => !appliedVersions.has(m.version));

  return { applied, pending };
}

/**
 * Create a new migration file.
 *
 * @param name - Migration name (kebab-case)
 * @param description - Human-readable description
 * @returns Path to the created migration file
 */
export async function createMigration(name: string, description: string): Promise<string> {
  const migrations = await loadMigrations();
  const nextVersion = migrations.length > 0 ? Math.max(...migrations.map((m) => m.version)) + 1 : 1;
  const filename = `${String(nextVersion).padStart(3, "0")}-${name}.ts`;
  const filepath = join(MIGRATIONS_DIR, filename);

  const template = `/**
 * Migration: ${description}
 */

import Database from "better-sqlite3";

export const description = "${description}";

export function up(db: Database.Database): void {
  // TODO: Implement migration up
}

export function down(db: Database.Database): void {
  // TODO: Implement migration down
}
`;

  // Create migrations directory if it doesn't exist
  await import("node:fs/promises").then(({ writeFile, mkdir }) =>
    mkdir(MIGRATIONS_DIR, { recursive: true }).then(() => writeFile(filepath, template))
  );

  return filepath;
}
