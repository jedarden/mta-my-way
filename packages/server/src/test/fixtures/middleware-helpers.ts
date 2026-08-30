/**
 * Helper utilities for loading and resetting middleware test fixtures.
 *
 * Provides convenience functions for common testing patterns:
 * - Creating test databases with pre-seeded middleware data
 * - Resetting database state between tests
 * - Creating scenario-specific fixture sets
 * - Managing test database lifecycle
 */

import Database from "better-sqlite3";
import { createInMemoryDatabase, createTestDatabase, runMigrations } from "../database.js";
import {
  clearSecurityFixtures,
  seedAccountLockoutFixtures,
  seedAuthorizationFixtures,
  seedMinimalAuthFixtures,
  seedPasswordResetFixtures,
  seedRateLimitFixtures,
  seedSecurityEventFixtures,
  seedStandardSecurityFixtures,
} from "./security.js";

// ── Test Database Creation ───────────────────────────────────────────────────────

/**
 * Create an in-memory test database with all migrations applied and standard fixtures loaded.
 *
 * This is the fastest option for unit tests - completely in-memory, no disk I/O.
 * The database is destroyed when the connection is closed.
 *
 * @returns Database instance with standard security fixtures
 */
export async function createTestDatabaseWithFixtures(): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  seedStandardSecurityFixtures(db);
  return db;
}

/**
 * Create a file-based test database with all migrations applied and standard fixtures loaded.
 *
 * Use this when you need to inspect the database state after tests or when testing
 * persistence-related features. The returned cleanup function removes the database file.
 *
 * @param name - Optional database name (default: "test-middleware.db")
 * @returns Database instance with standard security fixtures and cleanup function
 */
export async function createFileBasedTestDatabaseWithFixtures(
  name = "test-middleware.db"
): Promise<{ db: Database.Database; cleanup: () => void }> {
  const { db, cleanup } = createTestDatabase(name);
  await runMigrations(db);
  seedStandardSecurityFixtures(db);
  return { db, cleanup };
}

/**
 * Create a fresh test database with no fixtures (empty schema only).
 *
 * Use this when tests need complete control over initial data state.
 *
 * @returns Database instance with migrations applied but no data
 */
export async function createEmptyTestDatabase(): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  return db;
}

// ── Scenario-Specific Database Creation ───────────────────────────────────────────

/**
 * Create a test database pre-configured for authentication tests.
 *
 * Seeds minimal auth fixtures (single valid API key) for basic
 * authentication testing without complex state.
 */
export async function createAuthTestDatabase(): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  seedMinimalAuthFixtures(db);
  return db;
}

/**
 * Create a test database pre-configured for authorization/RBAC tests.
 *
 * Seeds multiple API keys with different scopes (read, write, admin)
 * for testing permission checks and role-based access control.
 */
export async function createAuthorizationTestDatabase(): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  seedAuthorizationFixtures(db);
  return db;
}

/**
 * Create a test database pre-configured for password reset flow tests.
 *
 * Seeds valid/expired/used password reset tokens plus rate limiting data
 * for testing the complete password reset workflow.
 */
export async function createPasswordResetTestDatabase(): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  seedPasswordResetFixtures(db);
  return db;
}

/**
 * Create a test database pre-configured for rate limiting tests.
 *
 * Seeds banned IPs, trusted IPs, and violation history for testing
 * rate limit enforcement and ban logic.
 */
export async function createRateLimitTestDatabase(): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  seedRateLimitFixtures(db);
  return db;
}

/**
 * Create a test database pre-configured for security event tests.
 *
 * Seeds security events, notification history, preferences, and templates
 * for testing event correlation and notification delivery.
 */
export async function createSecurityEventTestDatabase(): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  seedSecurityEventFixtures(db);
  return db;
}

/**
 * Create a test database pre-configured for account lockout tests.
 *
 * Seeds locked accounts, password history, and lockout reasons for
 * testing account lockout scenarios.
 */
export async function createAccountLockoutTestDatabase(): Promise<Database.Database> {
  const db = createInMemoryDatabase();
  await runMigrations(db);
  seedAccountLockoutFixtures(db);
  return db;
}

// ── Database Reset Utilities ─────────────────────────────────────────────────────

/**
 * Reset all security fixture tables to empty state.
 *
 * Useful in test beforeEach blocks to ensure clean state between tests.
 *
 * @param db - Database instance to reset
 */
export function resetSecurityFixtures(db: Database.Database): void {
  clearSecurityFixtures(db);
}

/**
 * Reset all security fixture tables and re-seed with standard fixtures.
 *
 * Useful when tests modify the database and you need to restore the
 * initial state.
 *
 * @param db - Database instance to reset and re-seed
 */
export function restoreStandardSecurityFixtures(db: Database.Database): void {
  clearSecurityFixtures(db);
  seedStandardSecurityFixtures(db);
}

/**
 * Clear and re-seed a specific fixture scenario.
 *
 * @param db - Database instance to reset
 * @param scenario - Name of fixture scenario to load
 */
export function resetToScenario(
  db: Database.Database,
  scenario:
    | "auth"
    | "authorization"
    | "password-reset"
    | "rate-limit"
    | "security-events"
    | "account-lockout"
    | "standard"
): void {
  clearSecurityFixtures(db);

  switch (scenario) {
    case "auth":
      seedMinimalAuthFixtures(db);
      break;
    case "authorization":
      seedAuthorizationFixtures(db);
      break;
    case "password-reset":
      seedPasswordResetFixtures(db);
      break;
    case "rate-limit":
      seedRateLimitFixtures(db);
      break;
    case "security-events":
      seedSecurityEventFixtures(db);
      break;
    case "account-lockout":
      seedAccountLockoutFixtures(db);
      break;
    case "standard":
      seedStandardSecurityFixtures(db);
      break;
  }
}

// ── Test Lifecycle Utilities ─────────────────────────────────────────────────────

/**
 * Create a test database setup object for use in test lifecycle hooks.
 *
 * This pattern is useful for Vitest/ Jest tests:
 *
 * ```ts
 * describe("My Middleware Tests", () => {
 *   const testDb = setupMiddlewareTestDatabase();
 *
 *   beforeEach(async () => {
 *     await testDb.setup();
 *   });
 *
 *   afterEach(() => {
 *     testDb.teardown();
 *   });
 * });
 * ```
 */
export function setupMiddlewareTestDatabase() {
  let db: Database.Database | null = null;
  let cleanup: (() => void) | null = null;

  return {
    /**
     * Setup a new test database with standard fixtures.
     * Call this in beforeEach() or at the start of your test.
     */
    async setup(scenario?: Parameters<typeof resetToScenario>[1]): Promise<Database.Database> {
      if (db) {
        // If database already exists, just reset to the desired scenario
        if (cleanup) {
          resetToScenario(db, scenario ?? "standard");
        }
        return db;
      }

      // Create new database
      db = createInMemoryDatabase();
      await runMigrations(db);

      if (scenario) {
        resetToScenario(db, scenario);
      } else {
        seedStandardSecurityFixtures(db);
      }

      return db;
    },

    /**
     * Teardown the test database.
     * Call this in afterEach() or at the end of your test.
     */
    teardown(): void {
      if (db) {
        try {
          db.close();
        } catch {
          // Already closed
        }
        db = null;
      }
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },

    /**
     * Get the current database instance.
     * Throws if setup() hasn't been called.
     */
    getDb(): Database.Database {
      if (!db) {
        throw new Error("Test database not initialized. Call setup() first.");
      }
      return db;
    },
  };
}

// ── Assertion Helpers ────────────────────────────────────────────────────────────

/**
 * Assert that a security table has the expected number of rows.
 *
 * @param db - Database instance
 * @param tableName - Name of the security table (without 'security_' prefix)
 * @param expectedCount - Expected row count
 */
export function assertSecurityTableRowCount(
  db: Database.Database,
  tableName: string,
  expectedCount: number
): void {
  const fullTableName = `security_${tableName}`;
  const result = db.prepare(`SELECT COUNT(*) as count FROM ${fullTableName}`).get() as {
    count: number;
  };

  if (result.count !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} rows in '${fullTableName}', but found ${result.count}`
    );
  }
}

/**
 * Assert that a security table is empty.
 *
 * @param db - Database instance
 * @param tableName - Name of the security table (without 'security_' prefix)
 */
export function assertSecurityTableEmpty(db: Database.Database, tableName: string): void {
  assertSecurityTableRowCount(db, tableName, 0);
}

/**
 * Get all rows from a security table for inspection in tests.
 *
 * @param db - Database instance
 * @param tableName - Name of the security table (without 'security_' prefix)
 * @returns Array of row objects
 */
export function getSecurityTableRows(
  db: Database.Database,
  tableName: string
): Array<Record<string, unknown>> {
  const fullTableName = `security_${tableName}`;
  return db.prepare(`SELECT * FROM ${fullTableName}`).all() as Array<Record<string, unknown>>;
}

// ── Transactional Test Utilities ───────────────────────────────────────────────────

/**
 * Execute a callback within a database transaction, automatically rolling back.
 *
 * This is useful for tests that should not modify the actual database state:
 *
 * ```ts
 * test("should not modify database on error", async () => {
 *   const db = await createTestDatabaseWithFixtures();
 *
 *   await withTestTransaction(db, () => {
 *     // Perform operations that would modify the database
 *     db.prepare("INSERT ...").run();
 *     throw new Error("Something went wrong");
 *   });
 *
 *   // Database state is unchanged despite the error
 *   assertSecurityTableRowCount(db, "api_key_registry", 5);
 * });
 * ```
 *
 * @param db - Database instance
 * @param callback - Function to execute within the transaction
 */
export function withTestTransaction<T>(db: Database.Database, callback: () => T): T {
  return db.transaction(callback)();
}

/**
 * Execute a callback within a SAVEPOINT, allowing partial rollback.
 *
 * Unlike a full transaction, this can be nested within existing transactions.
 *
 * @param db - Database instance
 * @param callback - Function to execute within the savepoint
 */
export function withSavepoint<T>(db: Database.Database, callback: () => T): T {
  db.exec("SAVEPOINT test_savepoint");
  try {
    const result = callback();
    db.exec("RELEASE SAVEPOINT test_savepoint");
    return result;
  } catch (error) {
    db.exec("ROLLBACK TO SAVEPOINT test_savepoint");
    db.exec("RELEASE SAVEPOINT test_savepoint");
    throw error;
  }
}

// ── Export All Security Fixture Functions ──────────────────────────────────────────

export {
  clearSecurityFixtures,
  seedAccountLockoutFixtures,
  seedAuthorizationFixtures,
  seedMinimalAuthFixtures,
  seedPasswordResetFixtures,
  seedRateLimitFixtures,
  seedSecurityEventFixtures,
  seedStandardSecurityFixtures,
} from "./security.js";
