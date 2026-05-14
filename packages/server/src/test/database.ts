/**
 * Test utilities for database operations.
 */

import Database from "better-sqlite3";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Create an in-memory database for testing.
 *
 * @returns Database instance
 */
export function createInMemoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  return db;
}

/**
 * Create a file-based test database in a temporary directory.
 *
 * @param name - Database name
 * @returns Database instance with file path
 */
export function createTestDatabase(name: string = "test.db"): {
  db: Database.Database;
  path: string;
  cleanup: () => void;
} {
  const testDir = join(tmpdir(), `mta-my-way-test-${process.pid}`);
  const dbPath = join(testDir, name);

  // Create test directory if it doesn't exist
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const cleanup = () => {
    db.close();
    if (existsSync(dbPath)) {
      rmSync(dbPath);
    }
    if (existsSync(testDir)) {
      try {
        rmSync(testDir, { recursive: true });
      } catch {
        // Directory not empty, skip cleanup
      }
    }
  };

  return { db, path: dbPath, cleanup };
}

/**
 * Seed test data into a database.
 *
 * @param db - Database instance
 * @param tables - Object mapping table names to arrays of row data
 */
export function seedTestData(
  db: Database.Database,
  tables: Record<string, Array<Record<string, unknown>>>
): void {
  for (const [tableName, rows] of Object.entries(tables)) {
    if (rows.length === 0) continue;

    const columns = Object.keys(rows[0]!);
    const placeholders = columns.map(() => "?").join(", ");
    const columnNames = columns.join(", ");

    const insert = db.prepare(
      `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`
    );

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        const values = columns.map((col) => row[col]);
        insert.run(...values);
      }
    });

    insertMany(rows);
  }
}

/**
 * Clear test data from a database.
 *
 * @param db - Database instance
 * @param tables - Array of table names to clear
 */
export function clearTestData(db: Database.Database, tables: string[]): void {
  for (const table of tables) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

/**
 * Assert table exists in database.
 */
export function assertTableExists(db: Database.Database, tableName: string): void {
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  if (!result) {
    throw new Error(`Table '${tableName}' does not exist`);
  }
}

/**
 * Assert column exists in table.
 */
export function assertColumnExists(
  db: Database.Database,
  tableName: string,
  columnName: string
): void {
  const columns = db.pragma(`table_info(${tableName})`) as Array<{ name: string }>;
  const exists = columns.some((col) => col.name === columnName);
  if (!exists) {
    throw new Error(`Column '${columnName}' does not exist in table '${tableName}'`);
  }
}

/**
 * Assert row count in table.
 */
export function assertRowCount(
  db: Database.Database,
  tableName: string,
  expectedCount: number
): void {
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as {
    count: number;
  };
  if (result.count !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} rows in '${tableName}', but found ${result.count}`
    );
  }
}

/**
 * Get row count for a table.
 */
export function getRowCount(db: Database.Database, tableName: string): number {
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as {
    count: number;
  };
  return result.count;
}

/**
 * Assert value exists in table.
 */
export function assertValueExists(
  db: Database.Database,
  tableName: string,
  column: string,
  value: unknown
): void {
  const result = db
    .prepare(`SELECT 1 FROM ${tableName} WHERE ${column} = ? LIMIT 1`)
    .get(value);
  if (!result) {
    throw new Error(
      `Value ${JSON.stringify(value)} not found in column '${column}' of table '${tableName}'`
    );
  }
}

/**
 * Get all rows from a table.
 */
export function getAllRows(
  db: Database.Database,
  tableName: string
): Array<Record<string, unknown>> {
  return db.prepare(`SELECT * FROM ${tableName}`).all() as Array<
    Record<string, unknown>
  >;
}

/**
 * Run migrations on test database.
 */
export async function runMigrations(db: Database.Database): Promise<void> {
  const { runMigrations: run } = await import("../migration/index.js");
  await run(db);
}

/**
 * Create a fresh test database with migrations applied.
 */
export async function createFreshTestDatabase(): Promise<{
  db: Database.Database;
  cleanup: () => void;
}> {
  const { db, cleanup } = createTestDatabase();
  await runMigrations(db);
  return { db, cleanup };
}
