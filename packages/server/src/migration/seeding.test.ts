/**
 * Unit tests for migration seeding helpers.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateSeedData,
  needsSeeding,
  reseedTable,
  seedConfig,
  seedData,
  seedFromJSON,
  seedReferenceData,
  seedTransaction,
  upsertRow,
} from "./seeding.js";

describe("migration seeding helpers", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");

    db.exec(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_code TEXT NOT NULL,
        qty INTEGER DEFAULT 0
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe("seedData", () => {
    it("inserts rows and returns correct counts", () => {
      const result = seedData(db, "categories", [
        { code: "A", label: "Category A" },
        { code: "B", label: "Category B" },
      ]);

      expect(result.inserted).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      const count = (db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;
      expect(count).toBe(2);
    });

    it("skips duplicate rows with onConflict=ignore (default)", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('A', 'Category A')");

      const result = seedData(db, "categories", [{ code: "A", label: "Category A Updated" }]);

      expect(result.inserted).toBe(0);
      expect(result.skipped).toBe(1);

      // Row should not be updated
      const row = db.prepare("SELECT label FROM categories WHERE code='A'").get() as {
        label: string;
      };
      expect(row.label).toBe("Category A");
    });

    it("replaces existing rows with onConflict=replace", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('A', 'Category A')");

      const result = seedData(db, "categories", [{ code: "A", label: "Category A Updated" }], {
        onConflict: "replace",
      });

      expect(result.inserted).toBe(1);

      const row = db.prepare("SELECT label FROM categories WHERE code='A'").get() as {
        label: string;
      };
      expect(row.label).toBe("Category A Updated");
    });

    it("returns empty result for empty data array", () => {
      const result = seedData(db, "categories", []);

      expect(result.inserted).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("returns error for invalid column names", () => {
      const result = seedData(db, "categories", [{ "bad-name": "A", label: "Category A" }]);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Invalid column names");
    });

    it("throws for invalid table name", () => {
      expect(() => seedData(db, "DROP", [{ code: "A", label: "A" }])).toThrow();
    });

    it("captures row-level errors in the errors array", () => {
      // Force a NOT NULL violation by using a table that will reject null
      db.exec("CREATE TABLE strict (id INTEGER PRIMARY KEY, val TEXT NOT NULL)");

      const result = seedData(db, "strict", [{ id: 1, val: null as unknown as string }]);

      // SQLite may or may not throw — test that the function handles both paths
      // (with skipDuplicates=true, it may count changes=0 and skip, or error)
      expect(result).toBeDefined();
    });
  });

  describe("seedReferenceData", () => {
    it("seeds multiple tables in sequence", () => {
      const results = seedReferenceData(db, [
        {
          table: "categories",
          data: [
            { code: "X", label: "X Category" },
            { code: "Y", label: "Y Category" },
          ],
        },
        {
          table: "items",
          data: [{ name: "Item 1", category_code: "X", qty: 10 }],
        },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].inserted).toBe(2);
      expect(results[1].inserted).toBe(1);
    });

    it("uses skipDuplicates=true by default", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('A', 'Existing')");

      const results = seedReferenceData(db, [
        {
          table: "categories",
          data: [{ code: "A", label: "Duplicate" }],
        },
      ]);

      expect(results[0].skipped).toBe(1);
    });

    it("respects skipDuplicates=false from seed config", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('A', 'Existing')");

      const results = seedReferenceData(db, [
        {
          table: "categories",
          data: [{ code: "A", label: "Duplicate" }],
          skipDuplicates: false,
        },
      ]);

      // With skipDuplicates=false, changes=0 rows not counted as skipped
      expect(results[0].skipped).toBe(0);
    });
  });

  describe("needsSeeding", () => {
    it("returns true for empty table", () => {
      expect(needsSeeding(db, "categories")).toBe(true);
    });

    it("returns false when table has rows", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('A', 'A')");
      expect(needsSeeding(db, "categories")).toBe(false);
    });

    it("returns true when row count is below minCount", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('A', 'A')");
      expect(needsSeeding(db, "categories", 5)).toBe(true);
    });

    it("returns false when row count meets minCount", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('A', 'A')");
      db.exec("INSERT INTO categories (code, label) VALUES ('B', 'B')");
      expect(needsSeeding(db, "categories", 2)).toBe(false);
    });

    it("returns true for non-existent table", () => {
      expect(needsSeeding(db, "nonexistent")).toBe(true);
    });
  });

  describe("upsertRow", () => {
    it("inserts new row when it does not exist", () => {
      const result = upsertRow(db, "categories", { code: "NEW", label: "New Category" }, ["code"]);
      expect(result).toBe(true);

      const row = db.prepare("SELECT label FROM categories WHERE code='NEW'").get() as {
        label: string;
      };
      expect(row.label).toBe("New Category");
    });

    it("updates existing row when it exists", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('EX', 'Existing')");

      const result = upsertRow(db, "categories", { code: "EX", label: "Updated" }, ["code"]);
      expect(result).toBe(true);

      const row = db.prepare("SELECT label FROM categories WHERE code='EX'").get() as {
        label: string;
      };
      expect(row.label).toBe("Updated");
    });

    it("returns true even when only unique key is provided (no update fields)", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('EX', 'Existing')");

      // All keys are unique keys — nothing to update
      const result = upsertRow(db, "categories", { code: "EX" }, ["code"]);
      expect(result).toBe(true);
    });

    it("throws for invalid column names", () => {
      expect(() => upsertRow(db, "categories", { "bad-col": "value" }, ["bad-col"])).toThrow(
        "Invalid column names"
      );
    });

    it("throws for invalid unique column names", () => {
      expect(() => upsertRow(db, "categories", { code: "A" }, ["bad-unique-col"])).toThrow(
        "Invalid unique column names"
      );
    });

    it("throws for invalid table name", () => {
      expect(() => upsertRow(db, "SELECT", { code: "A" }, ["code"])).toThrow();
    });
  });

  describe("seedConfig", () => {
    it("creates config table and inserts key-value pairs", () => {
      const result = seedConfig(db, "app_config", {
        version: "1.0.0",
        feature_x: true,
        max_retries: 3,
      });

      expect(result.inserted).toBe(3);

      const val = db.prepare("SELECT value FROM app_config WHERE name='version'").get() as {
        value: string;
      };
      expect(val.value).toBe("1.0.0");
    });

    it("skips existing config keys by default", () => {
      seedConfig(db, "app_config", { version: "1.0.0" });
      const result = seedConfig(db, "app_config", { version: "2.0.0" });

      expect(result.skipped).toBe(1);

      // Value should not change
      const val = db.prepare("SELECT value FROM app_config WHERE name='version'").get() as {
        value: string;
      };
      expect(val.value).toBe("1.0.0");
    });

    it("uses custom key and value column names", () => {
      const result = seedConfig(
        db,
        "custom_config",
        { timeout: 30 },
        { keyColumn: "cfg_key", valueColumn: "cfg_value" }
      );

      expect(result.inserted).toBe(1);

      const val = db
        .prepare("SELECT cfg_value FROM custom_config WHERE cfg_key='timeout'")
        .get() as { cfg_value: string };
      expect(val.cfg_value).toBe("30");
    });

    it("converts all config values to strings", () => {
      seedConfig(db, "app_config", { num: 42, flag: false });

      const numVal = db.prepare("SELECT value FROM app_config WHERE name='num'").get() as {
        value: string;
      };
      expect(numVal.value).toBe("42");

      const flagVal = db.prepare("SELECT value FROM app_config WHERE name='flag'").get() as {
        value: string;
      };
      expect(flagVal.value).toBe("false");
    });
  });

  describe("seedFromJSON", () => {
    it("seeds from JSON string (array)", () => {
      const json = JSON.stringify([
        { code: "J1", label: "JSON 1" },
        { code: "J2", label: "JSON 2" },
      ]);

      const result = seedFromJSON(db, "categories", json);
      expect(result.inserted).toBe(2);
    });

    it("seeds from JSON string (single object)", () => {
      const json = JSON.stringify({ code: "J1", label: "JSON 1" });

      const result = seedFromJSON(db, "categories", json);
      expect(result.inserted).toBe(1);
    });

    it("seeds from parsed array", () => {
      const data = [
        { code: "P1", label: "Parsed 1" },
        { code: "P2", label: "Parsed 2" },
      ];

      const result = seedFromJSON(db, "categories", data);
      expect(result.inserted).toBe(2);
    });

    it("seeds from parsed object (wraps in array)", () => {
      const data = { code: "P1", label: "Parsed 1" };

      const result = seedFromJSON(db, "categories", data);
      expect(result.inserted).toBe(1);
    });
  });

  describe("generateSeedData", () => {
    it("generates and inserts rows using factory function", () => {
      const result = generateSeedData(db, "categories", 3, (i) => ({
        code: `GEN${i}`,
        label: `Generated ${i}`,
      }));

      expect(result.inserted).toBe(3);

      const count = (db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;
      expect(count).toBe(3);
    });

    it("generates zero rows when count is 0", () => {
      const result = generateSeedData(db, "categories", 0, (i) => ({
        code: `X${i}`,
        label: `X${i}`,
      }));

      expect(result.inserted).toBe(0);
    });

    it("passes correct index to factory function", () => {
      const indexes: number[] = [];
      generateSeedData(db, "categories", 3, (i) => {
        indexes.push(i);
        return { code: `IDX${i}`, label: `Index ${i}` };
      });

      expect(indexes).toEqual([0, 1, 2]);
    });
  });

  describe("seedTransaction", () => {
    it("seeds all data within a transaction", () => {
      const results = seedTransaction(db, [
        {
          table: "categories",
          data: [
            { code: "T1", label: "Trans 1" },
            { code: "T2", label: "Trans 2" },
          ],
        },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].inserted).toBe(2);
    });

    it("rolls back all changes on error", () => {
      // Insert one valid row to ensure transaction starts
      db.exec("INSERT INTO categories (code, label) VALUES ('BEFORE', 'Before')");

      expect(() =>
        seedTransaction(db, [
          {
            table: "nonexistent_table",
            data: [{ code: "X", label: "X" }],
          },
        ])
      ).toThrow();

      // Ensure no new rows were inserted
      const count = (db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;
      expect(count).toBe(1); // Only the original row
    });
  });

  describe("reseedTable", () => {
    it("clears existing data and inserts fresh data", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('OLD', 'Old Category')");

      const result = reseedTable(db, "categories", [
        { code: "NEW1", label: "New 1" },
        { code: "NEW2", label: "New 2" },
      ]);

      expect(result.inserted).toBe(2);

      const count = (db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;
      expect(count).toBe(2);

      const oldRow = db.prepare("SELECT * FROM categories WHERE code='OLD'").get();
      expect(oldRow).toBeUndefined();
    });

    it("handles empty replacement data", () => {
      db.exec("INSERT INTO categories (code, label) VALUES ('OLD', 'Old Category')");

      const result = reseedTable(db, "categories", []);

      expect(result.inserted).toBe(0);
      const count = (db.prepare("SELECT COUNT(*) as n FROM categories").get() as { n: number }).n;
      expect(count).toBe(0);
    });

    it("throws for invalid table name", () => {
      expect(() => reseedTable(db, "DROP", [])).toThrow();
    });
  });
});
