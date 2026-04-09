/**
 * SQL identifier validation helpers.
 *
 * Provides utilities for validating SQL identifiers (table names, column names)
 * to prevent SQL injection attacks when building dynamic SQL queries.
 *
 * SQLite identifier rules:
 * - Must start with a letter or underscore
 * - Can contain letters, digits, and underscores
 * - Can be quoted with square brackets [], backticks ``, or double quotes ""
 * - Reserved keywords cannot be used as identifiers unless quoted
 *
 * This module enforces strict validation to prevent injection attacks.
 */

/**
 * Valid SQL identifier pattern.
 * - Must start with a letter (a-z, A-Z) or underscore (_)
 * - Can contain letters, digits (0-9), and underscores
 * - Maximum length of 128 characters (SQLite default limit)
 *
 * This pattern does NOT allow quoted identifiers or special characters
 * to prevent injection attempts.
 */
const SQL_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/;

/**
 * SQL reserved keywords that cannot be used as identifiers without quoting.
 * This is a subset of SQLite's reserved keywords for common operations.
 */
const SQL_RESERVED_KEYWORDS = new Set([
  // SQLite keywords
  "ABORT",
  "ACTION",
  "ADD",
  "AFTER",
  "ALL",
  "ALTER",
  "ANALYZE",
  "AND",
  "AS",
  "ASC",
  "ATTACH",
  "AUTOINCREMENT",
  "BEFORE",
  "BEGIN",
  "BETWEEN",
  "BY",
  "CASCADE",
  "CASE",
  "CAST",
  "CHECK",
  "COLLATE",
  "COLUMN",
  "COMMIT",
  "CONFLICT",
  "CONSTRAINT",
  "CREATE",
  "CROSS",
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "DATABASE",
  "DEFAULT",
  "DEFERRABLE",
  "DEFERRED",
  "DELETE",
  "DESC",
  "DETACH",
  "DISTINCT",
  "DROP",
  "EACH",
  "ELSE",
  "END",
  "ESCAPE",
  "EXCEPT",
  "EXCLUSIVE",
  "EXISTS",
  "EXPLAIN",
  "FAIL",
  "FOR",
  "FOREIGN",
  "FROM",
  "FULL",
  "GLOB",
  "GROUP",
  "HAVING",
  "IF",
  "IGNORE",
  "IMMEDIATE",
  "IN",
  "INDEX",
  "INDEXED",
  "INITIALLY",
  "INNER",
  "INSERT",
  "INSTEAD",
  "INTERSECT",
  "INTO",
  "IS",
  "ISNULL",
  "JOIN",
  "KEY",
  "LEFT",
  "LIKE",
  "LIMIT",
  "MATCH",
  "NATURAL",
  "NO",
  "NOT",
  "NOTNULL",
  "NULL",
  "OF",
  "OFFSET",
  "ON",
  "OR",
  "ORDER",
  "OUTER",
  "PLAN",
  "PRAGMA",
  "PRIMARY",
  "QUERY",
  "RAISE",
  "RECURSIVE",
  "REFERENCES",
  "REGEXP",
  "REINDEX",
  "RELEASE",
  "RENAME",
  "REPLACE",
  "RESTRICT",
  "RIGHT",
  "ROLLBACK",
  "ROW",
  "ROWS",
  "SAVEPOINT",
  "SELECT",
  "SET",
  "TABLE",
  "TEMP",
  "TEMPORARY",
  "THEN",
  "TO",
  "TRANSACTION",
  "TRIGGER",
  "UNION",
  "UNIQUE",
  "UPDATE",
  "USING",
  "VACUUM",
  "VALUES",
  "VIEW",
  "VIRTUAL",
  "WHEN",
  "WHERE",
  "WITH",
  "WITHOUT",
]);

/**
 * Validate a SQL identifier (table name, column name, etc.).
 *
 * @param identifier - The identifier to validate
 * @returns True if the identifier is safe to use in SQL queries
 *
 * @example
 * ```ts
 * if (!validateSqlIdentifier("users")) {
 *   throw new Error("Invalid table name");
 * }
 * ```
 */
export function validateSqlIdentifier(identifier: string): boolean {
  // Check against pattern
  if (!SQL_IDENTIFIER_PATTERN.test(identifier)) {
    return false;
  }

  // Check if it's a reserved keyword (case-insensitive)
  const upperIdentifier = identifier.toUpperCase();
  if (SQL_RESERVED_KEYWORDS.has(upperIdentifier)) {
    return false;
  }

  // Additional safety checks
  // - No SQL comments
  if (identifier.includes("--") || identifier.includes("/*") || identifier.includes("*/")) {
    return false;
  }

  // - No semicolons (statement separator)
  if (identifier.includes(";")) {
    return false;
  }

  // - No quotes (could be used for injection)
  if (identifier.includes("'") || identifier.includes('"') || identifier.includes("`")) {
    return false;
  }

  // - No square brackets (SQLite identifier quoting)
  if (identifier.includes("[") || identifier.includes("]")) {
    return false;
  }

  // - No whitespace (could be used to separate tokens)
  if (/\s/.test(identifier)) {
    return false;
  }

  return true;
}

/**
 * Validate multiple SQL identifiers.
 *
 * @param identifiers - Array of identifiers to validate
 * @returns Object with validation result and any invalid identifiers
 *
 * @example
 * ```ts
 * const result = validateSqlIdentifiers(["users", "id", "name"]);
 * if (!result.valid) {
 *   throw new Error(`Invalid identifiers: ${result.invalid.join(", ")}`);
 * }
 * ```
 */
export function validateSqlIdentifiers(identifiers: string[]): {
  valid: boolean;
  invalid: string[];
} {
  const invalid: string[] = [];

  for (const identifier of identifiers) {
    if (!validateSqlIdentifier(identifier)) {
      invalid.push(identifier);
    }
  }

  return {
    valid: invalid.length === 0,
    invalid,
  };
}

/**
 * Sanitize a SQL identifier by throwing an error if invalid.
 * This is a convenience function for use in code that needs to fail fast.
 *
 * @param identifier - The identifier to validate
 * @param identifierType - Type of identifier (for error messages)
 * @throws Error if the identifier is invalid
 *
 * @example
 * ```ts
 * sanitizeSqlIdentifier(tableName, "table name");
 * // Throws Error if invalid with descriptive message
 * ```
 */
export function sanitizeSqlIdentifier(
  identifier: string,
  identifierType: string = "identifier"
): string {
  if (!validateSqlIdentifier(identifier)) {
    throw new Error(
      `Invalid SQL ${identifierType}: "${identifier}". ` +
        `SQL identifiers must start with a letter or underscore, ` +
        `contain only letters, digits, and underscores, ` +
        `and not be a reserved SQL keyword.`
    );
  }

  return identifier;
}

/**
 * Validate a table name.
 * Alias for sanitizeSqlIdentifier with a specific type.
 *
 * @param tableName - The table name to validate
 * @throws Error if the table name is invalid
 */
export function validateTableName(tableName: string): string {
  return sanitizeSqlIdentifier(tableName, "table name");
}

/**
 * Validate a column name.
 * Alias for sanitizeSqlIdentifier with a specific type.
 *
 * @param columnName - The column name to validate
 * @throws Error if the column name is invalid
 */
export function validateColumnName(columnName: string): string {
  return sanitizeSqlIdentifier(columnName, "column name");
}

/**
 * Build a comma-separated list of validated column names.
 * Useful for SELECT queries and INSERT statements.
 *
 * @param columnNames - Array of column names to validate and join
 * @returns Comma-separated list of validated column names
 * @throws Error if any column name is invalid
 *
 * @example
 * ```ts
 * const columns = buildColumnList(["id", "name", "email"]);
 * // Returns: "id, name, email"
 * ```
 */
export function buildColumnList(columnNames: string[]): string {
  const validated = columnNames.map((name) => validateColumnName(name));
  return validated.join(", ");
}

/**
 * Build a placeholder list for parameterized queries.
 * Returns a string like "(?, ?, ?)" for the given count.
 *
 * @param count - Number of placeholders needed
 * @returns String of comma-separated question marks
 *
 * @example
 * ```ts
 * const placeholders = buildPlaceholderList(3);
 * // Returns: "(?, ?, ?)"
 * ```
 */
export function buildPlaceholderList(count: number): string {
  if (count < 0) {
    throw new Error("Placeholder count must be non-negative");
  }
  return `(${Array(count).fill("?").join(", ")})`;
}
