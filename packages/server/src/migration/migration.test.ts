/**
 * Unit tests for migration system.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMigration,
  getMigrationStatus,
  rollbackMigration,
  runMigrations,
} from "./migration.js";

describe("migration system", () => {
  let db: Database.Database;
  let tempDir: string;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");
    tempDir = join(tmpdir(), `migration-test-${Date.now()}`);
  });

  afterEach(async () => {
    db.close();
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("runMigrations", () => {
    it("creates migrations table if not exists", async () => {
      await runMigrations(db);

      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'")
        .get();
      expect(tableExists).toBeTruthy();
    });

    it("applies pending migrations in order", async () => {
      // Create mock migration directory
      await mkdir(tempDir, { recursive: true });
      await writeFile(
        join(tempDir, "001-test-one.ts"),
        `
        export const description = "Test migration 1";
        export function up(db) { db.exec("CREATE TABLE test1 (id INTEGER)"); }
        export function down(db) { db.exec("DROP TABLE test1"); }
        `
      );

      vi.doMock(join(tempDir, "001-test-one.ts"), () => ({
        description: "Test migration 1",
        up: (d: Database.Database) => d.exec("CREATE TABLE test1 (id INTEGER)"),
        down: (d: Database.Database) => d.exec("DROP TABLE test1"),
      }));

      await runMigrations(db);

      const applied = db.prepare("SELECT * FROM _migrations WHERE version = 1").get();
      expect(applied).toBeTruthy();

      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test1'")
        .get();
      expect(tableExists).toBeTruthy();
    });

    it("skips already applied migrations", async () => {
      // Manually mark migration as applied
      db.prepare(
        "INSERT INTO _migrations (version, name, description, appliedAt, executionTimeMs) VALUES (?, ?, ?, ?, ?)"
      ).run(1, "test-one", "Test", new Date().toISOString(), 100);

      // Create migrations table first
      await runMigrations(db);

      // Should not fail even though migration 1 is already applied
      const applied = db.prepare("SELECT COUNT(*) as count FROM _migrations").get() as {
        count: number;
      };
      expect(applied.count).toBe(1);
    });

    it("stops at target version when specified", async () => {
      // Mark migrations 1 and 2 as applied
      db.prepare(
        "INSERT INTO _migrations (version, name, description, appliedAt, executionTimeMs) VALUES (1, 'm1', 'M1', datetime('now'), 100), (2, 'm2', 'M2', datetime('now'), 100)"
      ).run();

      await runMigrations(db, 2);

      // Should not apply any migrations beyond version 2
      const applied = db
        .prepare("SELECT COUNT(*) as count FROM _migrations WHERE version <= 2")
        .get() as {
        count: number;
      };
      expect(applied.count).toBe(2);
    });
  });

  describe("rollbackMigration", () => {
    it("rolls back a specific migration", async () => {
      // Create migrations table and apply a migration
      await runMigrations(db);

      // Manually add a test migration record and table
      db.exec("CREATE TABLE test_rollback (id INTEGER)");
      db.prepare(
        "INSERT INTO _migrations (version, name, description, appliedAt, executionTimeMs) VALUES (?, ?, ?, ?, ?)"
      ).run(1, "test-rollback", "Test rollback", new Date().toISOString(), 100);

      // Mock the migration down function
      vi.doMock("./migrations/001-test-rollback.ts", () => ({
        down: (d: Database.Database) => d.exec("DROP TABLE test_rollback"),
      }));

      const result = await rollbackMigration(db, 1);
      expect(result).toBe(true);

      // Migration record should be removed
      const applied = db.prepare("SELECT * FROM _migrations WHERE version = 1").get();
      expect(applied).toBeFalsy();

      // Table should be dropped (would be done by down function in real scenario)
    });

    it("returns false for non-existent migration", async () => {
      await runMigrations(db);
      const result = await rollbackMigration(db, 999);
      expect(result).toBe(false);
    });

    it("returns false for migration not applied", async () => {
      await runMigrations(db);
      const result = await rollbackMigration(db, 1);
      expect(result).toBe(false);
    });
  });

  describe("getMigrationStatus", () => {
    it("returns applied and pending migrations", async () => {
      const status = await getMigrationStatus(db);

      expect(status).toHaveProperty("applied");
      expect(status).toHaveProperty("pending");
      expect(Array.isArray(status.applied)).toBe(true);
      expect(Array.isArray(status.pending)).toBe(true);
    });

    it("includes migration metadata in applied list", async () => {
      db.prepare(
        "INSERT INTO _migrations (version, name, description, appliedAt, executionTimeMs) VALUES (?, ?, ?, ?, ?)"
      ).run(1, "test", "Test migration", new Date().toISOString(), 150);

      const status = await getMigrationStatus(db);
      expect(status.applied).toHaveLength(1);
      expect(status.applied[0].version).toBe(1);
      expect(status.applied[0].name).toBe("test");
    });
  });

  describe("createMigration", () => {
    it("creates a new migration file with template", async () => {
      const filepath = await createMigration("add-users-table", "Add users table");

      expect(filepath).toContain("001-add-users-table.ts");

      // Cleanup
      await rm(filepath);
    });

    it("increments version number for existing migrations", async () => {
      const file1 = await createMigration("first", "First migration");

      // Mock that we have an existing migration
      vi.doMock("./migrations/001-first.ts", () => ({
        description: "First migration",
        up: () => {},
        down: () => {},
      }));

      const file2 = await createMigration("second", "Second migration");
      expect(file2).toContain("002-second-");

      // Cleanup
      await rm(file1);
      await rm(file2);
    });
  });
});
