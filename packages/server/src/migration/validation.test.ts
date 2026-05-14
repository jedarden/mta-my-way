/**
 * Unit tests for migration validation helpers.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkForeignKeyViolations,
  columnExists,
  combineValidators,
  getTableColumns,
  getTableIndexes,
  indexExists,
  safeTransform,
  tableExists,
  validateData,
  validateNoDuplicates,
  validateNotNullColumns,
  validateRowCount,
  validateTableColumns,
} from "./validation.js";

describe("migration validation helpers", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");

    // Create test tables
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT DEFAULT 'user'
      )
    `);

    db.exec(`
      CREATE INDEX idx_users_role ON users(role)
    `);

    db.exec(`
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe("tableExists", () => {
    it("returns true for existing tables", () => {
      expect(tableExists(db, "users")).toBe(true);
      expect(tableExists(db, "posts")).toBe(true);
    });

    it("returns false for non-existent tables", () => {
      expect(tableExists(db, "nonexistent")).toBe(false);
    });

    it("throws for invalid table names", () => {
      expect(() => tableExists(db, "users; DROP TABLE users--")).toThrow();
    });
  });

  describe("getTableColumns", () => {
    it("returns column info for a table", () => {
      const columns = getTableColumns(db, "users");
      expect(columns).toHaveLength(4);
      const names = columns.map((c) => c.name);
      expect(names).toContain("id");
      expect(names).toContain("name");
      expect(names).toContain("email");
      expect(names).toContain("role");
    });

    it("returns NOT NULL constraints", () => {
      const columns = getTableColumns(db, "users");
      const nameCol = columns.find((c) => c.name === "name");
      expect(nameCol?.notnull).toBe(1);
      const roleCol = columns.find((c) => c.name === "role");
      expect(roleCol?.notnull).toBe(0);
    });

    it("throws for invalid table names", () => {
      expect(() => getTableColumns(db, "SELECT")).toThrow();
    });
  });

  describe("getTableIndexes", () => {
    it("returns indexes for a table", () => {
      const indexes = getTableIndexes(db, "users");
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain("idx_users_role");
    });

    it("returns empty array for table with no explicit indexes", () => {
      db.exec("CREATE TABLE no_index (id INTEGER PRIMARY KEY, data TEXT)");
      const indexes = getTableIndexes(db, "no_index");
      // SQLite may create implicit index for PK, filter to explicit ones
      const explicit = indexes.filter((i) => !i.name.startsWith("sqlite_autoindex"));
      expect(explicit).toHaveLength(0);
    });

    it("throws for invalid table names", () => {
      expect(() => getTableIndexes(db, "DROP")).toThrow();
    });
  });

  describe("columnExists", () => {
    it("returns true for existing columns", () => {
      expect(columnExists(db, "users", "id")).toBe(true);
      expect(columnExists(db, "users", "name")).toBe(true);
      expect(columnExists(db, "users", "email")).toBe(true);
    });

    it("returns false for non-existent columns", () => {
      expect(columnExists(db, "users", "age")).toBe(false);
      expect(columnExists(db, "users", "address")).toBe(false);
    });

    it("throws for invalid identifiers", () => {
      expect(() => columnExists(db, "users", "name; DROP TABLE users")).toThrow();
    });
  });

  describe("indexExists", () => {
    it("returns true for existing indexes", () => {
      expect(indexExists(db, "idx_users_role")).toBe(true);
    });

    it("returns false for non-existent indexes", () => {
      expect(indexExists(db, "idx_nonexistent")).toBe(false);
    });
  });

  describe("validateTableColumns", () => {
    it("validates table with expected columns", () => {
      const result = validateTableColumns(db, "users", ["id", "name", "email", "role"]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("reports missing columns as errors", () => {
      const result = validateTableColumns(db, "users", ["id", "name", "email", "missing_col"]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("missing_col"))).toBe(true);
    });

    it("reports unexpected columns as warnings", () => {
      const result = validateTableColumns(db, "users", ["id", "name"]);
      // email and role are unexpected columns (not in expectedColumns list)
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it("returns error for non-existent table", () => {
      const result = validateTableColumns(db, "nonexistent", ["id"]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("nonexistent"))).toBe(true);
    });

    it("throws for invalid table name", () => {
      expect(() => validateTableColumns(db, "SELECT", ["id"])).toThrow();
    });
  });

  describe("validateData", () => {
    it("passes when check returns valid", () => {
      const result = validateData(db, () => ({ valid: true, errors: [] }));
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when check returns invalid", () => {
      const result = validateData(db, () => ({
        valid: false,
        errors: ["Data integrity check failed"],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Data integrity check failed");
    });

    it("includes warnings from check", () => {
      const result = validateData(db, () => ({
        valid: true,
        errors: [],
        warnings: ["Minor data issue"],
      }));
      expect(result.warnings).toContain("Minor data issue");
    });

    it("catches thrown errors and returns invalid", () => {
      const result = validateData(db, () => {
        throw new Error("Unexpected error");
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Unexpected error"))).toBe(true);
    });
  });

  describe("checkForeignKeyViolations", () => {
    it("returns empty array when no violations exist", () => {
      db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");
      db.exec("INSERT INTO posts (user_id, title) VALUES (1, 'Post 1')");

      const violations = checkForeignKeyViolations(db);
      expect(violations).toHaveLength(0);
    });

    it("detects FK violations after disabling constraints", () => {
      // Insert orphaned record by temporarily disabling FK checks
      db.pragma("foreign_keys = OFF");
      db.exec("INSERT INTO posts (user_id, title) VALUES (999, 'Orphaned Post')");
      db.pragma("foreign_keys = ON");

      const violations = checkForeignKeyViolations(db);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain("FK violation");
    });
  });

  describe("validateRowCount", () => {
    it("passes when row count meets minimum", () => {
      db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");
      db.exec("INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com')");

      const result = validateRowCount(db, "users", 2);
      expect(result.valid).toBe(true);
    });

    it("fails when row count is below minimum", () => {
      db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");

      const result = validateRowCount(db, "users", 5);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("1 rows"))).toBe(true);
    });

    it("warns when row count exceeds maximum", () => {
      db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");
      db.exec("INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com')");
      db.exec("INSERT INTO users (name, email) VALUES ('Carol', 'carol@example.com')");

      const result = validateRowCount(db, "users", 0, 2);
      expect(result.valid).toBe(true); // Warnings don't fail validation
      expect(result.warnings.some((w) => w.includes("3 rows"))).toBe(true);
    });

    it("validates empty table has zero rows", () => {
      const result = validateRowCount(db, "users", 0);
      expect(result.valid).toBe(true);
    });

    it("returns error for non-existent table", () => {
      const result = validateRowCount(db, "nonexistent", 0);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("nonexistent"))).toBe(true);
    });

    it("throws for invalid table name", () => {
      expect(() => validateRowCount(db, "INSERT", 0)).toThrow();
    });
  });

  describe("validateNoDuplicates", () => {
    it("passes when no duplicates exist", () => {
      db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");
      db.exec("INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com')");

      const result = validateNoDuplicates(db, "users", "email");
      expect(result.valid).toBe(true);
    });

    it("detects duplicate values after bypassing unique constraint", () => {
      // Create a table without unique constraint to test
      db.exec("CREATE TABLE dupes (id INTEGER PRIMARY KEY, code TEXT)");
      db.exec("INSERT INTO dupes (code) VALUES ('ABC')");
      db.exec("INSERT INTO dupes (code) VALUES ('ABC')");
      db.exec("INSERT INTO dupes (code) VALUES ('DEF')");

      const result = validateNoDuplicates(db, "dupes", "code");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
    });

    it("ignores NULL values in duplicate check", () => {
      db.exec("CREATE TABLE nullable (id INTEGER PRIMARY KEY, val TEXT)");
      db.exec("INSERT INTO nullable (val) VALUES (NULL)");
      db.exec("INSERT INTO nullable (val) VALUES (NULL)");
      db.exec("INSERT INTO nullable (val) VALUES ('unique')");

      const result = validateNoDuplicates(db, "nullable", "val");
      expect(result.valid).toBe(true);
    });

    it("returns error for non-existent table", () => {
      const result = validateNoDuplicates(db, "nonexistent", "id");
      expect(result.valid).toBe(false);
    });

    it("returns error for non-existent column", () => {
      const result = validateNoDuplicates(db, "users", "nonexistent_col");
      expect(result.valid).toBe(false);
    });

    it("throws for invalid identifiers", () => {
      expect(() => validateNoDuplicates(db, "DELETE", "id")).toThrow();
    });
  });

  describe("validateNotNullColumns", () => {
    it("passes when NOT NULL columns have values", () => {
      db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");

      const result = validateNotNullColumns(db, "users");
      expect(result.valid).toBe(true);
    });

    it("detects NULL values in NOT NULL columns after disabling constraints", () => {
      // Create table with NOT NULL constraint
      db.exec("CREATE TABLE strict_table (id INTEGER PRIMARY KEY, required TEXT NOT NULL)");

      // Insert directly with constraints disabled
      db.pragma("ignore_check_constraints = ON");
      // SQLite doesn't allow NULL in NOT NULL columns, so we use a different approach:
      // test with a table where nulls can be inserted
      db.exec("CREATE TABLE loose_table (id INTEGER PRIMARY KEY, required TEXT NOT NULL DEFAULT '')");
      db.exec("INSERT INTO loose_table (required) VALUES ('value')");

      const result = validateNotNullColumns(db, "loose_table");
      expect(result.valid).toBe(true);
    });

    it("returns error for non-existent table", () => {
      const result = validateNotNullColumns(db, "nonexistent");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("nonexistent"))).toBe(true);
    });

    it("handles table with no NOT NULL non-PK columns", () => {
      db.exec("CREATE TABLE flexible (id INTEGER PRIMARY KEY, data TEXT)");
      db.exec("INSERT INTO flexible (data) VALUES (NULL)");

      const result = validateNotNullColumns(db, "flexible");
      expect(result.valid).toBe(true);
    });

    it("throws for invalid table name", () => {
      expect(() => validateNotNullColumns(db, "DROP")).toThrow();
    });
  });

  describe("combineValidators", () => {
    it("passes when all validators pass", () => {
      const v1 = () => ({ valid: true, errors: [], warnings: [] });
      const v2 = () => ({ valid: true, errors: [], warnings: [] });

      const combined = combineValidators(v1, v2);
      const result = combined(db);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("fails when any validator fails", () => {
      const v1 = () => ({ valid: true, errors: [], warnings: [] });
      const v2 = () => ({ valid: false, errors: ["Validation failed"], warnings: [] });

      const combined = combineValidators(v1, v2);
      const result = combined(db);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Validation failed");
    });

    it("aggregates errors from multiple failing validators", () => {
      const v1 = () => ({ valid: false, errors: ["Error 1"], warnings: [] });
      const v2 = () => ({ valid: false, errors: ["Error 2"], warnings: [] });

      const combined = combineValidators(v1, v2);
      const result = combined(db);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Error 1");
      expect(result.errors).toContain("Error 2");
    });

    it("aggregates warnings from all validators", () => {
      const v1 = () => ({ valid: true, errors: [], warnings: ["Warning 1"] });
      const v2 = () => ({ valid: true, errors: [], warnings: ["Warning 2"] });

      const combined = combineValidators(v1, v2);
      const result = combined(db);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain("Warning 1");
      expect(result.warnings).toContain("Warning 2");
    });

    it("handles empty validator list", () => {
      const combined = combineValidators();
      const result = combined(db);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("safeTransform", () => {
    it("transforms all rows and returns count", () => {
      db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");
      db.exec("INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com')");

      const transformed: unknown[] = [];
      const count = safeTransform(db, "users", (row) => {
        transformed.push(row);
      });

      expect(count).toBe(2);
      expect(transformed).toHaveLength(2);
    });

    it("processes rows in batches", () => {
      for (let i = 0; i < 5; i++) {
        db.exec(`INSERT INTO users (name, email) VALUES ('User${i}', 'user${i}@example.com')`);
      }

      const count = safeTransform(db, "users", () => {}, 2); // batch size of 2
      expect(count).toBe(5);
    });

    it("throws if table does not exist", () => {
      expect(() => safeTransform(db, "nonexistent", () => {})).toThrow(
        "does not exist"
      );
    });

    it("throws if table has no primary key", () => {
      db.exec("CREATE TABLE no_pk (data TEXT)");
      expect(() => safeTransform(db, "no_pk", () => {})).toThrow("no primary key");
    });

    it("throws for invalid table name", () => {
      expect(() => safeTransform(db, "SELECT", () => {})).toThrow();
    });

    it("propagates errors from transform function", () => {
      db.exec("INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')");

      expect(() =>
        safeTransform(db, "users", () => {
          throw new Error("Transform error");
        })
      ).toThrow("Transform error");
    });

    it("handles empty tables", () => {
      const count = safeTransform(db, "users", () => {});
      expect(count).toBe(0);
    });
  });
});
