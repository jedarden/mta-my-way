/**
 * Migration validation helpers.
 *
 * Provides utilities for validating data before and after migrations,
 * including table structure checks, data integrity checks, and safe
 * transformation patterns.
 */

import type Database from "better-sqlite3";

/** Table column information */
export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/** Table index information */
export interface IndexInfo {
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Check if a table exists in the database.
 *
 * @param db - Database instance
 * @param tableName - Name of the table to check
 * @returns True if table exists
 */
export function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(tableName);
  return !!result;
}

/**
 * Get column information for a table.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @returns Array of column information
 */
export function getTableColumns(db: Database.Database, tableName: string): ColumnInfo[] {
  return db.pragma(`table_info(${tableName})`) as ColumnInfo[];
}

/**
 * Get index information for a table.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @returns Array of index information
 */
export function getTableIndexes(db: Database.Database, tableName: string): IndexInfo[] {
  const indexes = db
    .prepare(
      "SELECT name, unique, origin, partial FROM sqlite_master WHERE type='index' AND tbl_name=?"
    )
    .all(tableName) as IndexInfo[];
  return indexes;
}

/**
 * Check if a column exists in a table.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @param columnName - Name of the column
 * @returns True if column exists
 */
export function columnExists(
  db: Database.Database,
  tableName: string,
  columnName: string
): boolean {
  const columns = getTableColumns(db, tableName);
  return columns.some((col) => col.name === columnName);
}

/**
 * Check if an index exists.
 *
 * @param db - Database instance
 * @param indexName - Name of the index
 * @returns True if index exists
 */
export function indexExists(db: Database.Database, indexName: string): boolean {
  const result = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
    .get(indexName);
  return !!result;
}

/**
 * Validate table has expected columns.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @param expectedColumns - Array of column names that should exist
 * @returns Validation result
 */
export function validateTableColumns(
  db: Database.Database,
  tableName: string,
  expectedColumns: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tableExists(db, tableName)) {
    errors.push(`Table '${tableName}' does not exist`);
    return { valid: false, errors, warnings };
  }

  const columns = getTableColumns(db, tableName);
  const columnNames = new Set(columns.map((c) => c.name));

  for (const col of expectedColumns) {
    if (!columnNames.has(col)) {
      errors.push(`Column '${col}' does not exist in table '${tableName}'`);
    }
  }

  // Check for unexpected columns
  for (const col of columnNames) {
    if (!expectedColumns.includes(col) && !col.startsWith("_")) {
      warnings.push(`Unexpected column '${col}' in table '${tableName}'`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate data integrity with a custom check function.
 *
 * @param db - Database instance
 * @param check - Function that performs the validation check
 * @returns Validation result
 */
export function validateData(
  db: Database.Database,
  check: (db: Database.Database) => { valid: boolean; errors: string[]; warnings?: string[] }
): ValidationResult {
  try {
    const result = check(db);
    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings ?? [],
    };
  } catch (err) {
    return {
      valid: false,
      errors: [`Validation check failed: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
}

/**
 * Check for foreign key violations.
 *
 * @param db - Database instance
 * @returns Array of violation descriptions
 */
export function checkForeignKeyViolations(db: Database.Database): string[] {
  const violations: string[] = [];

  try {
    const fkResult = db.pragma("foreign_key_check");
    if (fkResult && fkResult.length > 0) {
      for (const row of fkResult as any[]) {
        violations.push(
          `FK violation: table=${row.table}, rowid=${row.rowid}, parent=${row.parent}, fkid=${row.fkid}`
        );
      }
    }
  } catch {
    // Foreign key checks may not be enabled
  }

  return violations;
}

/**
 * Validate row count is within expected range.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @param minRows - Minimum expected rows (inclusive)
 * @param maxRows - Maximum expected rows (inclusive, optional)
 * @returns Validation result
 */
export function validateRowCount(
  db: Database.Database,
  tableName: string,
  minRows = 0,
  maxRows?: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tableExists(db, tableName)) {
    errors.push(`Table '${tableName}' does not exist`);
    return { valid: false, errors, warnings };
  }

  const result = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as {
    count: number;
  };
  const count = result.count;

  if (count < minRows) {
    errors.push(`Table '${tableName}' has ${count} rows, expected at least ${minRows}`);
  }

  if (maxRows !== undefined && count > maxRows) {
    warnings.push(`Table '${tableName}' has ${count} rows, expected at most ${maxRows}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate no duplicate values in a column.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @param columnName - Name of the column to check
 * @returns Validation result
 */
export function validateNoDuplicates(
  db: Database.Database,
  tableName: string,
  columnName: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tableExists(db, tableName)) {
    errors.push(`Table '${tableName}' does not exist`);
    return { valid: false, errors, warnings };
  }

  if (!columnExists(db, tableName, columnName)) {
    errors.push(`Column '${columnName}' does not exist in table '${tableName}'`);
    return { valid: false, errors, warnings };
  }

  const result = db
    .prepare(
      `SELECT COUNT(*) - COUNT(DISTINCT ${columnName}) as duplicates FROM ${tableName} WHERE ${columnName} IS NOT NULL`
    )
    .get() as { duplicates: number };

  if (result.duplicates > 0) {
    errors.push(
      `Table '${tableName}' has ${result.duplicates} duplicate values in column '${columnName}'`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate all NOT NULL columns have values.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @returns Validation result
 */
export function validateNotNullColumns(db: Database.Database, tableName: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!tableExists(db, tableName)) {
    errors.push(`Table '${tableName}' does not exist`);
    return { valid: false, errors, warnings };
  }

  const columns = getTableColumns(db, tableName);
  const notNullColumns = columns.filter((c) => c.notnull === 1 && c.pk === 0);

  for (const col of notNullColumns) {
    const result = db
      .prepare(`SELECT COUNT(*) as null_count FROM ${tableName} WHERE ${col.name} IS NULL`)
      .get() as { null_count: number };

    if (result.null_count > 0) {
      errors.push(
        `Column '${col.name}' in table '${tableName}' has ${result.null_count} NULL values but is NOT NULL`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Create a combined validation from multiple validators.
 *
 * @param validators - Array of validation functions
 * @returns Combined validation function
 */
export function combineValidators(
  ...validators: Array<(db: Database.Database) => ValidationResult>
): (db: Database.Database) => ValidationResult {
  return (db: Database.Database) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const validator of validators) {
      const result = validator(db);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    return { valid: errors.length === 0, errors, warnings };
  };
}

/**
 * Safe data transformation helper.
 *
 * Performs a transformation in batches with error handling and rollback capability.
 *
 * @param db - Database instance
 * @param tableName - Name of the table
 * @param transform - Function to transform each row
 * @param batchSize - Number of rows to process per batch
 * @returns Number of rows transformed
 */
export function safeTransform(
  db: Database.Database,
  tableName: string,
  transform: (row: any) => void,
  batchSize = 1000
): number {
  if (!tableExists(db, tableName)) {
    throw new Error(`Table '${tableName}' does not exist`);
  }

  // Get primary key column
  const columns = getTableColumns(db, tableName);
  const pkColumn = columns.find((c) => c.pk > 0);
  if (!pkColumn) {
    throw new Error(`Table '${tableName}' has no primary key`);
  }

  const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
  let transformed = 0;

  // Process in batches
  for (let offset = 0; offset < count.count; offset += batchSize) {
    const rows = db.prepare(`SELECT * FROM ${tableName} LIMIT ${batchSize} OFFSET ${offset}`).all();

    db.transaction(() => {
      for (const row of rows) {
        try {
          transform(row);
          transformed++;
        } catch (err) {
          throw new Error(
            `Failed to transform row with ${pkColumn.name}=${row[pkColumn.name]}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    })();
  }

  return transformed;
}
