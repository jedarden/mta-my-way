/**
 * SQL identifier validation tests.
 */

import { describe, expect, it } from "vitest";
import {
  buildColumnList,
  buildPlaceholderList,
  sanitizeSqlIdentifier,
  validateColumnName,
  validateSqlIdentifier,
  validateSqlIdentifiers,
  validateTableName,
} from "./sql-validator.js";

describe("SQL Identifier Validation", () => {
  describe("validateSqlIdentifier", () => {
    it("should accept valid identifiers", () => {
      expect(validateSqlIdentifier("users")).toBe(true);
      expect(validateSqlIdentifier("user_profiles")).toBe(true);
      expect(validateSqlIdentifier("id")).toBe(true);
      expect(validateSqlIdentifier("created_at")).toBe(true);
      expect(validateSqlIdentifier("is_active")).toBe(true);
      expect(validateSqlIdentifier("_private")).toBe(true);
      expect(validateSqlIdentifier("a")).toBe(true);
      expect(validateSqlIdentifier("Z")).toBe(true);
      expect(validateSqlIdentifier("table123")).toBe(true);
    });

    it("should reject identifiers starting with a digit", () => {
      expect(validateSqlIdentifier("123users")).toBe(false);
      expect(validateSqlIdentifier("1table")).toBe(false);
      expect(validateSqlIdentifier("9items")).toBe(false);
    });

    it("should reject identifiers with special characters", () => {
      expect(validateSqlIdentifier("user-name")).toBe(false);
      expect(validateSqlIdentifier("user.name")).toBe(false);
      expect(validateSqlIdentifier("user@name")).toBe(false);
      expect(validateSqlIdentifier("user name")).toBe(false);
      expect(validateSqlIdentifier("user;name")).toBe(false);
    });

    it("should reject identifiers with SQL injection patterns", () => {
      expect(validateSqlIdentifier("users; DROP TABLE users--")).toBe(false);
      expect(validateSqlIdentifier("users OR 1=1")).toBe(false);
      expect(validateSqlIdentifier("users' OR '1'='1")).toBe(false);
      expect(validateSqlIdentifier('users" OR "1"="1')).toBe(false);
      expect(validateSqlIdentifier("users` OR `1`=`1")).toBe(false);
      expect(validateSqlIdentifier("users] OR [1]=[1")).toBe(false);
      expect(validateSqlIdentifier("users/* comment */")).toBe(false);
      expect(validateSqlIdentifier("users-- comment")).toBe(false);
    });

    it("should reject SQL reserved keywords", () => {
      expect(validateSqlIdentifier("SELECT")).toBe(false);
      expect(validateSqlIdentifier("select")).toBe(false);
      expect(validateSqlIdentifier("INSERT")).toBe(false);
      expect(validateSqlIdentifier("insert")).toBe(false);
      expect(validateSqlIdentifier("UPDATE")).toBe(false);
      expect(validateSqlIdentifier("update")).toBe(false);
      expect(validateSqlIdentifier("DELETE")).toBe(false);
      expect(validateSqlIdentifier("delete")).toBe(false);
      expect(validateSqlIdentifier("DROP")).toBe(false);
      expect(validateSqlIdentifier("drop")).toBe(false);
      expect(validateSqlIdentifier("TABLE")).toBe(false);
      expect(validateSqlIdentifier("table")).toBe(false);
      expect(validateSqlIdentifier("WHERE")).toBe(false);
      expect(validateSqlIdentifier("where")).toBe(false);
      expect(validateSqlIdentifier("FROM")).toBe(false);
      expect(validateSqlIdentifier("from")).toBe(false);
    });

    it("should reject identifiers that are too long", () => {
      const longIdentifier = "a".repeat(129);
      expect(validateSqlIdentifier(longIdentifier)).toBe(false);
    });

    it("should accept identifiers at maximum length", () => {
      const maxIdentifier = "a".repeat(128);
      expect(validateSqlIdentifier(maxIdentifier)).toBe(true);
    });

    it("should reject empty strings", () => {
      expect(validateSqlIdentifier("")).toBe(false);
    });
  });

  describe("validateSqlIdentifiers", () => {
    it("should accept arrays of valid identifiers", () => {
      const result = validateSqlIdentifiers(["id", "name", "email", "created_at"]);
      expect(result.valid).toBe(true);
      expect(result.invalid).toEqual([]);
    });

    it("should reject arrays with invalid identifiers", () => {
      const result = validateSqlIdentifiers(["id", "user-name", "email", "123invalid"]);
      expect(result.valid).toBe(false);
      expect(result.invalid).toEqual(["user-name", "123invalid"]);
    });

    it("should reject arrays with reserved keywords", () => {
      const result = validateSqlIdentifiers(["id", "select", "email"]);
      expect(result.valid).toBe(false);
      expect(result.invalid).toEqual(["select"]);
    });

    it("should handle empty arrays", () => {
      const result = validateSqlIdentifiers([]);
      expect(result.valid).toBe(true);
      expect(result.invalid).toEqual([]);
    });
  });

  describe("sanitizeSqlIdentifier", () => {
    it("should return valid identifiers unchanged", () => {
      expect(sanitizeSqlIdentifier("users")).toBe("users");
      expect(sanitizeSqlIdentifier("user_profiles")).toBe("user_profiles");
    });

    it("should throw error for invalid identifiers", () => {
      expect(() => sanitizeSqlIdentifier("123users")).toThrow();
      expect(() => sanitizeSqlIdentifier("user-name")).toThrow();
      expect(() => sanitizeSqlIdentifier("users; DROP TABLE users")).toThrow();
      expect(() => sanitizeSqlIdentifier("SELECT")).toThrow();
    });

    it("should include identifier type in error message", () => {
      try {
        sanitizeSqlIdentifier("123users", "table name");
        throw new Error("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("table name");
      }
    });
  });

  describe("validateTableName", () => {
    it("should return valid table names unchanged", () => {
      expect(validateTableName("users")).toBe("users");
      expect(validateTableName("user_profiles")).toBe("user_profiles");
    });

    it("should throw error for invalid table names", () => {
      expect(() => validateTableName("123users")).toThrow();
      expect(() => validateTableName("users; DROP TABLE users")).toThrow();
      expect(() => validateTableName("table")).toThrow(); // reserved keyword
    });
  });

  describe("validateColumnName", () => {
    it("should return valid column names unchanged", () => {
      expect(validateColumnName("id")).toBe("id");
      expect(validateColumnName("created_at")).toBe("created_at");
    });

    it("should throw error for invalid column names", () => {
      expect(() => validateColumnName("123id")).toThrow();
      expect(() => validateColumnName("user-name")).toThrow();
      expect(() => validateColumnName("select")).toThrow(); // reserved keyword
    });
  });

  describe("buildColumnList", () => {
    it("should build comma-separated list of valid column names", () => {
      expect(buildColumnList(["id", "name", "email"])).toBe("id, name, email");
      expect(buildColumnList(["created_at", "updated_at"])).toBe("created_at, updated_at");
    });

    it("should throw error for invalid column names", () => {
      expect(() => buildColumnList(["id", "user-name"])).toThrow();
      expect(() => buildColumnList(["id", "select"])).toThrow();
    });

    it("should handle single column", () => {
      expect(buildColumnList(["id"])).toBe("id");
    });
  });

  describe("buildPlaceholderList", () => {
    it("should build placeholder list for positive counts", () => {
      expect(buildPlaceholderList(1)).toBe("(?)");
      expect(buildPlaceholderList(3)).toBe("(?, ?, ?)");
      expect(buildPlaceholderList(5)).toBe("(?, ?, ?, ?, ?)");
    });

    it("should build empty list for zero", () => {
      expect(buildPlaceholderList(0)).toBe("()");
    });

    it("should throw error for negative counts", () => {
      expect(() => buildPlaceholderList(-1)).toThrow("Placeholder count must be non-negative");
    });
  });

  describe("SQL Injection Prevention", () => {
    it("should prevent SQL injection in table names", () => {
      const maliciousInputs = [
        "users; DROP TABLE users--",
        "users OR 1=1--",
        "users' UNION SELECT * FROM passwords--",
        "(SELECT CASE WHEN (1=1) THEN 1 ELSE 1*(SELECT table_name FROM information_schema.tables) END)=1",
        "users; EXEC xp_cmdshell('dir')--",
        "users' OR '1'='1",
        'users" OR "1"="1',
        "users` OR `1`=`1",
        "users] OR [1]=[1",
        "users/**/OR/**/1=1",
        "users%20OR%201=1",
        "users\nOR\n1=1",
        "users\tOR\t1=1",
      ];

      for (const input of maliciousInputs) {
        expect(validateSqlIdentifier(input)).toBe(false);
      }
    });

    it("should prevent SQL injection in column names", () => {
      const maliciousInputs = [
        "password; DROP TABLE users--",
        "id OR 1=1--",
        "name' UNION SELECT * FROM passwords--",
        'email" OR "1"="1',
        "data` OR `1`=`1",
        "value] OR [1]=[1",
        "field/**/OR/**/1=1",
      ];

      for (const input of maliciousInputs) {
        expect(validateSqlIdentifier(input)).toBe(false);
      }
    });

    it("should prevent comment-based injection", () => {
      expect(validateSqlIdentifier("users--comment")).toBe(false);
      expect(validateSqlIdentifier("users/*comment*/")).toBe(false);
      expect(validateSqlIdentifier("users#comment")).toBe(false);
    });

    it("should prevent statement separator injection", () => {
      expect(validateSqlIdentifier("users;DROP")).toBe(false);
      expect(validateSqlIdentifier("users; DROP")).toBe(false);
      expect(validateSqlIdentifier("users;;DROP")).toBe(false);
    });
  });

  describe("Common Valid Identifiers", () => {
    it("should accept common database table names", () => {
      const commonTables = [
        "users",
        "user_profiles",
        "sessions",
        "posts",
        "comments",
        "likes",
        "notifications",
        "settings",
        "audit_logs",
        "api_keys",
        "subscriptions",
        "push_subscriptions",
        "trips",
        "commute_stats",
        "user_context",
        "context_transitions",
      ];

      for (const table of commonTables) {
        expect(validateSqlIdentifier(table)).toBe(true);
      }
    });

    it("should accept common database column names", () => {
      const commonColumns = [
        "id",
        "user_id",
        "name",
        "email",
        "password",
        "created_at",
        "updated_at",
        "deleted_at",
        "is_active",
        "is_deleted",
        "auth_token",
        "refresh_token",
        "expires_at",
        "origin_station_id",
        "destination_station_id",
        "departure_time",
        "arrival_time",
      ];

      for (const column of commonColumns) {
        expect(validateSqlIdentifier(column)).toBe(true);
      }
    });
  });

  describe("Reserved Keywords", () => {
    it("should reject common SQL reserved keywords", () => {
      const reservedKeywords = [
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "DROP",
        "CREATE",
        "ALTER",
        "TABLE",
        "INDEX",
        "WHERE",
        "FROM",
        "JOIN",
        "INNER",
        "OUTER",
        "LEFT",
        "RIGHT",
        "ON",
        "AND",
        "OR",
        "NOT",
        "NULL",
        "IS",
        "IN",
        "BETWEEN",
        "LIKE",
        "ORDER",
        "BY",
        "GROUP",
        "HAVING",
        "LIMIT",
        "OFFSET",
        "UNION",
        "DISTINCT",
        "EXISTS",
        "CASE",
        "WHEN",
        "THEN",
        "ELSE",
        "END",
        "AS",
        "ASC",
        "DESC",
        "PRIMARY",
        "FOREIGN",
        "KEY",
        "REFERENCES",
        "CONSTRAINT",
        "UNIQUE",
        "CHECK",
        "DEFAULT",
        "CASCADE",
        "TRIGGER",
        "VIEW",
        "PRAGMA",
        "TRANSACTION",
        "COMMIT",
        "ROLLBACK",
        "VACUUM",
        "ATTACH",
        "DETACH",
        "REINDEX",
        "ANALYZE",
      ];

      for (const keyword of reservedKeywords) {
        expect(validateSqlIdentifier(keyword)).toBe(false);
        expect(validateSqlIdentifier(keyword.toLowerCase())).toBe(false);
      }
    });
  });
});
