/**
 * Demonstration test for middleware database fixtures.
 *
 * This file shows how to use the test database fixtures for middleware integration testing.
 * Run with: npm test middleware-fixtures-demo
 */

import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import {
  createAuthTestDatabase,
  createAuthorizationTestDatabase,
  createPasswordResetTestDatabase,
  createRateLimitTestDatabase,
  createTestDatabaseWithFixtures,
  resetToScenario,
  assertSecurityTableRowCount,
  assertSecurityTableEmpty,
  getSecurityTableRows,
  withTestTransaction,
  setupMiddlewareTestDatabase,
} from "./middleware-helpers.js";
import { setSecurityDb, loadApiKeyRegistry } from "../../security/security-db.js";

describe("Middleware Fixtures Demo", () => {
  describe("Basic Usage", () => {
    it("should create a test database with standard fixtures", async () => {
      const db = await createTestDatabaseWithFixtures();

      // Should have 5 API keys from standard fixtures
      assertSecurityTableRowCount(db, "api_key_registry", 5);
      assertSecurityTableRowCount(db, "password_reset_tokens", 3);
      assertSecurityTableRowCount(db, "rate_limit_bans", 3);

      db.close();
    });

    it("should create an auth-specific test database", async () => {
      const db = await createAuthTestDatabase();

      // Should have exactly 1 read-only API key
      assertSecurityTableRowCount(db, "api_key_registry", 1);

      const rows = getSecurityTableRows(db, "api_key_registry");
      expect(rows[0]!.scope).toBe("read");

      db.close();
    });

    it("should create an authorization test database", async () => {
      const db = await createAuthorizationTestDatabase();

      // Should have 3 keys: read, write, admin
      assertSecurityTableRowCount(db, "api_key_registry", 3);

      const rows = getSecurityTableRows(db, "api_key_registry");
      const scopes = rows.map((r) => r.scope);
      expect(scopes).toContain("read");
      expect(scopes).toContain("write");
      expect(scopes).toContain("admin");

      db.close();
    });

    it("should create a password reset test database", async () => {
      const db = await createPasswordResetTestDatabase();

      // Should have API keys + reset tokens + rate limits
      assertSecurityTableRowCount(db, "api_key_registry", 3);
      assertSecurityTableRowCount(db, "password_reset_tokens", 3);
      assertSecurityTableRowCount(db, "password_reset_attempts", 2);

      db.close();
    });

    it("should create a rate limit test database", async () => {
      const db = await createRateLimitTestDatabase();

      // Should have API keys + bans + trusted IPs
      assertSecurityTableRowCount(db, "api_key_registry", 1);
      assertSecurityTableRowCount(db, "rate_limit_bans", 3);
      assertSecurityTableRowCount(db, "trusted_ips", 3);

      db.close();
    });
  });

  describe("Scenario Reset", () => {
    let db: import("better-sqlite3").Database;

    beforeEach(async () => {
      db = await createTestDatabaseWithFixtures();
    });

    it("should reset to a specific scenario", () => {
      // Start with standard fixtures (5 keys)
      assertSecurityTableRowCount(db, "api_key_registry", 5);

      // Reset to auth scenario (1 key)
      resetToScenario(db, "auth");
      assertSecurityTableRowCount(db, "api_key_registry", 1);

      // Reset to authorization scenario (3 keys)
      resetToScenario(db, "authorization");
      assertSecurityTableRowCount(db, "api_key_registry", 3);
    });

    it("should clear and reload fixtures cleanly", () => {
      // Initial state
      assertSecurityTableRowCount(db, "api_key_registry", 5);

      // Reset to same scenario (should be idempotent)
      resetToScenario(db, "standard");
      assertSecurityTableRowCount(db, "api_key_registry", 5);

      // Different scenarios should load correctly
      resetToScenario(db, "rate-limit");
      assertSecurityTableRowCount(db, "rate_limit_bans", 3);
    });

    afterEach(() => {
      db.close();
    });
  });

  describe("Transactional Testing", () => {
    let db: import("better-sqlite3").Database;

    beforeEach(async () => {
      db = await createTestDatabaseWithFixtures();
    });

    it("should rollback changes after test transaction", () => {
      // Initial state
      assertSecurityTableRowCount(db, "api_key_registry", 5);

      // Changes within transaction should not persist
      withTestTransaction(db, () => {
        db.prepare("DELETE FROM security_api_key_registry").run();
        assertSecurityTableRowCount(db, "api_key_registry", 0);
      });

      // Transaction rolled back - data unchanged
      assertSecurityTableRowCount(db, "api_key_registry", 5);
    });

    it("should handle errors in test transactions", () => {
      const initialCount = 5;

      expect(() => {
        withTestTransaction(db, () => {
          db.prepare("INSERT INTO security_api_key_registry (key_id, key_hash, key_salt, scope, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)").run(
            "new_key",
            "hash",
            "salt",
            "read",
            Date.now(),
            Date.now() + 86400000
          );

          // Throw an error - should rollback
          throw new Error("Test error");
        });
      }).toThrow("Test error");

      // Should still have 5 keys (insert was rolled back)
      assertSecurityTableRowCount(db, "api_key_registry", initialCount);
    });

    afterEach(() => {
      db.close();
    });
  });

  describe("Integration with Security DB Layer", () => {
    let db: import("better-sqlite3").Database;

    beforeEach(async () => {
      db = await createAuthorizationTestDatabase();
      setSecurityDb(db);
    });

    it("should load API keys from fixtures", () => {
      const keys = loadApiKeyRegistry();

      expect(keys).toHaveLength(3);

      const readKey = keys.find((k) => k.key.scope === "read");
      expect(readKey).toBeDefined();
      expect(readKey!.key.keyId).toBe("test_read_key_123");

      const writeKey = keys.find((k) => k.key.scope === "write");
      expect(writeKey).toBeDefined();
      expect(writeKey!.key.keyId).toBe("test_write_key_456");

      const adminKey = keys.find((k) => k.key.scope === "admin");
      expect(adminKey).toBeDefined();
      expect(adminKey!.key.keyId).toBe("test_admin_key_789");
    });

    it("should handle scenarios with different fixture sets", () => {
      // Start with authorization scenario
      let keys = loadApiKeyRegistry();
      expect(keys).toHaveLength(3);

      // Switch to password reset scenario
      resetToScenario(db, "password-reset");
      keys = loadApiKeyRegistry();
      expect(keys).toHaveLength(3); // Still has 3 keys

      // Switch to auth scenario
      resetToScenario(db, "auth");
      keys = loadApiKeyRegistry();
      expect(keys).toHaveLength(1); // Now has 1 key
    });

    afterEach(() => {
      db.close();
      setSecurityDb(null as unknown as Database.Database);
    });
  });

  describe("Lifecycle Management", () => {
    it("should use setupMiddlewareTestDatabase helper", async () => {
      const testDb = setupMiddlewareTestDatabase();

      // Setup with auth scenario
      await testDb.setup("auth");
      assertSecurityTableRowCount(testDb.getDb(), "api_key_registry", 1);

      // Can switch scenarios
      await testDb.setup("authorization");
      assertSecurityTableRowCount(testDb.getDb(), "api_key_registry", 3);

      // Teardown cleans up
      testDb.teardown();

      // Subsequent setup calls create fresh database
      await testDb.setup("rate-limit");
      assertSecurityTableRowCount(testDb.getDb(), "rate_limit_bans", 3);

      testDb.teardown();
    });

    it("should throw error if getDb called before setup", () => {
      const testDb = setupMiddlewareTestDatabase();

      expect(() => testDb.getDb()).toThrow("Test database not initialized");

      testDb.teardown();
    });
  });

  describe("Assertion Helpers", () => {
    let db: import("better-sqlite3").Database;

    beforeEach(async () => {
      db = await createTestDatabaseWithFixtures();
    });

    it("should assert table row counts", () => {
      // Should not throw
      assertSecurityTableRowCount(db, "api_key_registry", 5);
      assertSecurityTableRowCount(db, "password_reset_tokens", 3);

      // Should throw
      expect(() => assertSecurityTableRowCount(db, "api_key_registry", 999)).toThrow(
        "Expected 999 rows in 'security_api_key_registry', but found 5"
      );
    });

    it("should assert table is empty", () => {
      // Clear the table
      db.prepare("DELETE FROM security_trusted_ips").run();

      // Should not throw
      assertSecurityTableEmpty(db, "trusted_ips");

      // Should throw
      expect(() => assertSecurityTableEmpty(db, "api_key_registry")).toThrow(
        "Expected 0 rows in 'security_api_key_registry', but found 5"
      );
    });

    it("should get all rows from table", () => {
      const rows = getSecurityTableRows(db, "rate_limit_bans");

      expect(rows).toHaveLength(3);
      expect(rows[0]!.identifier).toBeDefined();
      expect(rows[0]!.banned_until).toBeDefined();
    });

    afterEach(() => {
      db.close();
    });
  });

  describe("Complete Test Example", () => {
    let db: import("better-sqlite3").Database;

    beforeEach(async () => {
      db = await createAuthorizationTestDatabase();
      setSecurityDb(db);
    });

    it("should demonstrate a complete middleware integration test", () => {
      // 1. Load initial state
      const keys = loadApiKeyRegistry();
      expect(keys).toHaveLength(3);

      // 2. Verify specific keys exist
      const readKey = keys.find((k) => k.key.scope === "read");
      expect(readKey).toBeDefined();

      // 3. Test database state directly
      assertSecurityTableRowCount(db, "api_key_registry", 3);
      assertSecurityTableEmpty(db, "password_reset_tokens");

      // 4. Test transactional behavior
      withTestTransaction(db, () => {
        db.prepare("DELETE FROM security_api_key_registry WHERE scope = 'read'").run();
        assertSecurityTableRowCount(db, "api_key_registry", 2);
      });

      // 5. Verify transaction rolled back
      assertSecurityTableRowCount(db, "api_key_registry", 3);

      // 6. Test scenario switching
      resetToScenario(db, "auth");
      const authKeys = loadApiKeyRegistry();
      expect(authKeys).toHaveLength(1);
      expect(authKeys[0]!.key.scope).toBe("read");
    });

    afterEach(() => {
      db.close();
      setSecurityDb(null as unknown as Database.Database);
    });
  });
});
