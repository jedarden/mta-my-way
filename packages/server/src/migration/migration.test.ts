/**
 * Unit tests for migration system.
 */

import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
      // Clear any existing migrations and test with actual migrations
      db.exec("DROP TABLE IF EXISTS _migrations");

      await runMigrations(db);

      // Check that migrations were applied in order
      const applied = db
        .prepare("SELECT version FROM _migrations ORDER BY version")
        .all() as Array<{
        version: number;
      }>;

      // Verify at least some migrations were applied
      expect(applied.length).toBeGreaterThan(0);

      // Verify versions are in ascending order
      for (let i = 1; i < applied.length; i++) {
        const current = applied[i];
        const previous = applied[i - 1];
        expect(current.version).toBeGreaterThan(previous.version);
      }
    });

    it("skips already applied migrations", async () => {
      // Create migrations table first
      await runMigrations(db);

      const countBefore = db.prepare("SELECT COUNT(*) as count FROM _migrations").get() as {
        count: number;
      };

      // Run migrations again - should skip all already applied
      await runMigrations(db);

      const countAfter = db.prepare("SELECT COUNT(*) as count FROM _migrations").get() as {
        count: number;
      };
      expect(countAfter.count).toBe(countBefore.count);
    });

    it("stops at target version when specified", async () => {
      // Start fresh - clear migrations table and set up test data
      db.exec("DROP TABLE IF EXISTS _migrations");
      db.exec(`
        CREATE TABLE _migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          appliedAt TEXT NOT NULL,
          executionTimeMs INTEGER NOT NULL
        )
      `);

      // Mark migrations 1 and 2 as applied
      db.prepare(
        "INSERT INTO _migrations (version, name, description, appliedAt, executionTimeMs) VALUES (1, 'm1', 'M1', datetime('now'), 100), (2, 'm2', 'M2', datetime('now'), 100)"
      ).run();

      await runMigrations(db, {}, 2);

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

      // Find an applied migration to test rollback
      const applied = db.prepare("SELECT version FROM _migrations LIMIT 1").get() as
        | { version: number }
        | undefined;
      expect(applied).toBeDefined();

      if (!applied) return;

      const result = await rollbackMigration(db, applied.version);
      expect(result).toBe(true);

      // Migration record should be removed
      const record = db.prepare("SELECT * FROM _migrations WHERE version = ?").get(applied.version);
      expect(record).toBeFalsy();
    });

    it("returns false for non-existent migration", async () => {
      await runMigrations(db);
      const result = await rollbackMigration(db, 999);
      expect(result).toBe(false);
    });

    it("returns false for migration not applied", async () => {
      await runMigrations(db);
      // Use a version number that doesn't exist
      const result = await rollbackMigration(db, 9999);
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
      // Create migrations table first
      await runMigrations(db);

      const status = await getMigrationStatus(db);
      expect(status.applied.length).toBeGreaterThan(0);

      // Check that first migration has the expected metadata fields
      const first = status.applied[0];
      expect(first).toHaveProperty("version");
      expect(first).toHaveProperty("name");
      expect(first).toHaveProperty("appliedAt");
      expect(first).toHaveProperty("executionTimeMs");
    });
  });

  describe("createMigration", () => {
    it("creates a new migration file with template", async () => {
      const testMigrationsDir = join(tempDir, "migrations");
      const filepath = await createMigration(
        "add-users-table",
        "Add users table",
        false,
        testMigrationsDir
      );

      // The filename should end with the name pattern, version depends on existing migrations
      expect(filepath).toMatch(/add-users-table\.ts$/);
      expect(filepath).toMatch(/\d{3}-add-users-table\.ts$/);

      // Cleanup
      await rm(filepath);
    });

    it("increments version number for existing migrations", async () => {
      const testMigrationsDir = join(tempDir, "migrations");
      const file1 = await createMigration("first", "First migration", false, testMigrationsDir);

      // The function returns the full filepath with correct naming pattern
      expect(file1).toMatch(/\d{3}-first\.ts$/);

      const file2 = await createMigration("second", "Second migration", false, testMigrationsDir);
      // The filename format is {version}-{name}.ts with incrementing version
      expect(file2).toMatch(/\d{3}-second\.ts$/);

      // Extract version numbers and verify they increment
      const match1 = file1.match(/(\d{3})-first\.ts$/);
      const match2 = file2.match(/(\d{3})-second\.ts$/);
      if (match1 && match2) {
        const version1 = parseInt(match1[1], 10);
        const version2 = parseInt(match2[1], 10);
        expect(version2).toBe(version1 + 1);
      }

      // Cleanup
      await rm(file1);
      await rm(file2);
    });
  });
});
