/**
 * Migration data seeding support.
 *
 * Provides utilities for seeding initial data during migrations,
 * including support for idempotent operations, reference data,
 * and test data generation.
 */

import type Database from "better-sqlite3";

/** Seed data entry */
export interface SeedData<T = Record<string, any>> {
  table: string;
  data: T[];
  uniqueKeys?: string[]; // Columns that define uniqueness
  skipDuplicates?: boolean; // Skip rows that would violate constraints
}

/** Seed operation result */
export interface SeedResult {
  table: string;
  inserted: number;
  skipped: number;
  errors: string[];
}

/**
 * Seed data into a table with conflict handling.
 *
 * @param db - Database instance
 * @param table - Table name
 * @param data - Array of data objects to insert
 * @param options - Seeding options
 * @returns Seed result with counts
 */
export function seedData<T extends Record<string, any>>(
  db: Database.Database,
  table: string,
  data: T[],
  options: {
    skipDuplicates?: boolean;
    uniqueKeys?: string[];
    onConflict?: "ignore" | "replace" | "update";
  } = {}
): SeedResult {
  const { skipDuplicates = true, onConflict = "ignore" } = options;
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  if (data.length === 0) {
    return { table, inserted: 0, skipped: 0, errors: [] };
  }

  // Build column names from first data object
  const columns = Object.keys(data[0]);
  const placeholders = columns.map(() => "?").join(", ");
  const columnList = columns.join(", ");

  // Prepare appropriate statement based on conflict handling
  let sql: string;
  switch (onConflict) {
    case "replace":
      sql = `INSERT OR REPLACE INTO ${table} (${columnList}) VALUES (${placeholders})`;
      break;
    case "update":
      // For UPDATE, we need to use INSERT OR REPLACE with a different approach
      // SQLite doesn't have ON CONFLICT UPDATE in all versions
      sql = `INSERT OR REPLACE INTO ${table} (${columnList}) VALUES (${placeholders})`;
      break;
    case "ignore":
    default:
      sql = `INSERT OR IGNORE INTO ${table} (${columnList}) VALUES (${placeholders})`;
      break;
  }

  const stmt = db.prepare(sql);

  for (const row of data) {
    try {
      const values = columns.map((col) => (row as any)[col]);
      const result = stmt.run(...values);

      if (result.changes > 0) {
        inserted++;
      } else if (skipDuplicates) {
        skipped++;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${JSON.stringify(row)}: ${error}`);
    }
  }

  return { table, inserted, skipped, errors };
}

/**
 * Seed reference data (static lookup tables).
 *
 * Reference data is typically small, static datasets like
 * status codes, categories, or configuration options.
 *
 * @param db - Database instance
 * @param seeds - Array of seed data entries
 * @returns Array of seed results
 */
export function seedReferenceData(db: Database.Database, seeds: SeedData[]): SeedResult[] {
  const results: SeedResult[] = [];

  for (const seed of seeds) {
    const result = seedData(db, seed.table, seed.data, {
      skipDuplicates: seed.skipDuplicates ?? true,
      uniqueKeys: seed.uniqueKeys,
    });
    results.push(result);
  }

  return results;
}

/**
 * Check if reference data needs seeding.
 *
 * @param db - Database instance
 * @param table - Table name
 * @param minCount - Minimum expected rows for a "seeded" table
 * @returns True if table needs seeding
 */
export function needsSeeding(db: Database.Database, table: string, minCount = 1): boolean {
  try {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as
      | { count: number }
      | undefined;
    return !result || result.count < minCount;
  } catch {
    return true;
  }
}

/**
 * Upsert single row (insert or update if exists).
 *
 * @param db - Database instance
 * @param table - Table name
 * @param data - Data object to insert/update
 * @param uniqueColumns - Columns that determine uniqueness
 * @returns True if row was inserted or updated
 */
export function upsertRow(
  db: Database.Database,
  table: string,
  data: Record<string, any>,
  uniqueColumns: string[]
): boolean {
  const columns = Object.keys(data);
  const values = columns.map((col) => data[col]);
  const placeholders = columns.map(() => "?").join(", ");
  const columnList = columns.join(", ");

  // Build WHERE clause for unique columns
  const whereClause = uniqueColumns.map((col) => `${col} = ?`).join(" AND ");
  const whereValues = uniqueColumns.map((col) => data[col]);

  // Check if row exists
  const existsStmt = db.prepare(`SELECT 1 FROM ${table} WHERE ${whereClause}`);
  const exists = existsStmt.get(...whereValues);

  if (exists) {
    // Update existing row
    const updateClause = columns
      .filter((col) => !uniqueColumns.includes(col))
      .map((col) => `${col} = ?`)
      .join(", ");

    if (updateClause) {
      const updateValues = columns
        .filter((col) => !uniqueColumns.includes(col))
        .map((col) => data[col]);

      const updateStmt = db.prepare(`UPDATE ${table} SET ${updateClause} WHERE ${whereClause}`);
      updateStmt.run(...updateValues, ...whereValues);
    }
    return true;
  } else {
    // Insert new row
    const insertStmt = db.prepare(`INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`);
    const result = insertStmt.run(...values);
    return result.changes > 0;
  }
}

/**
 * Seed configuration data (key-value pairs).
 *
 * Creates a simple key-value configuration table if it doesn't exist
 * and seeds it with initial configuration.
 *
 * @param db - Database instance
 * @param tableName - Name of the configuration table
 * @param config - Configuration object to seed
 * @param options - Table creation options
 * @returns Seed result
 */
export function seedConfig(
  db: Database.Database,
  tableName: string,
  config: Record<string, string | number | boolean>,
  options: {
    keyColumn?: string;
    valueColumn?: string;
    createIfNotExists?: boolean;
  } = {}
): SeedResult {
  const { keyColumn = "key", valueColumn = "value", createIfNotExists = true } = options;

  // Create table if needed
  if (createIfNotExists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        ${keyColumn} TEXT PRIMARY KEY,
        ${valueColumn} TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Convert config object to array format
  const data = Object.entries(config).map(([key, value]) => ({
    [keyColumn]: key,
    [valueColumn]: String(value),
  }));

  return seedData(db, tableName, data, { skipDuplicates: true });
}

/**
 * Bulk seed from JSON file content.
 *
 * @param db - Database instance
 * @param table - Table name
 * @param jsonData - JSON string or parsed object
 * @returns Seed result
 */
export function seedFromJSON(
  db: Database.Database,
  table: string,
  jsonData: string | Record<string, any> | Record<string, any>[]
): SeedResult {
  let data: Record<string, any>[];

  if (typeof jsonData === "string") {
    const parsed = JSON.parse(jsonData);
    data = Array.isArray(parsed) ? parsed : [parsed];
  } else if (Array.isArray(jsonData)) {
    data = jsonData;
  } else {
    data = [jsonData];
  }

  return seedData(db, table, data, { skipDuplicates: true });
}

/**
 * Generate seed data for testing.
 *
 * Creates mock data based on a template factory function.
 *
 * @param db - Database instance
 * @param table - Table name
 * @param count - Number of rows to generate
 * @param factory - Function that generates data for a row
 * @returns Seed result
 */
export function generateSeedData<T extends Record<string, any>>(
  db: Database.Database,
  table: string,
  count: number,
  factory: (index: number) => T
): SeedResult {
  const data: T[] = [];

  for (let i = 0; i < count; i++) {
    data.push(factory(i));
  }

  return seedData(db, table, data);
}

/**
 * Transactional seeding with rollback on error.
 *
 * All seeding operations are performed in a single transaction.
 * If any operation fails, all changes are rolled back.
 *
 * @param db - Database instance
 * @param seeds - Array of seed data entries
 * @returns Array of seed results or throws on error
 */
export function seedTransaction(db: Database.Database, seeds: SeedData[]): SeedResult[] {
  return db.transaction(() => {
    return seedReferenceData(db, seeds);
  })();
}

/**
 * Reset and reseed a table (for testing).
 *
 * Drops all data from a table and reseeds it with fresh data.
 *
 * @param db - Database instance
 * @param table - Table name
 * @param data - Data to seed
 * @param options - Options including disable foreign keys
 * @returns Seed result
 */
export function reseedTable<T extends Record<string, any>>(
  db: Database.Database,
  table: string,
  data: T[],
  options: { disableForeignKeys?: boolean; resetAutoincrement?: boolean } = {}
): SeedResult {
  const { disableForeignKeys = true, resetAutoincrement = true } = options;

  return db.transaction(() => {
    // Disable foreign key constraints if requested
    if (disableForeignKeys) {
      db.pragma("foreign_keys = OFF");
    }

    try {
      // Clear existing data
      db.prepare(`DELETE FROM ${table}`).run();

      // Reset autoincrement if requested
      if (resetAutoincrement) {
        db.prepare(`DELETE FROM sqlite_sequence WHERE name=?`).run(table);
      }

      // Seed fresh data
      return seedData(db, table, data);
    } finally {
      // Re-enable foreign keys
      if (disableForeignKeys) {
        db.pragma("foreign_keys = ON");
      }
    }
  })();
}
