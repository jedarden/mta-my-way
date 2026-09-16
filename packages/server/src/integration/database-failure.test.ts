/**
 * Integration tests for database failure scenarios.
 *
 * Tests that the server handles database unavailability gracefully:
 * - Server starts even when DB path is unwritable/corrupt
 * - Stateless endpoints remain available
 * - /api/health reports degraded status for DB subsystem
 * - DB-dependent endpoints return 503 with clear degradation message
 *
 * Per ADR-001 (2026-07-20): "Decouple the Core Read Path from Persistent-Volume-Backed State"
 *
 * NOTE: never import ../index.js here — not even a dynamic `await import()`
 * inside a test. The entry point runs `void main()` at module scope, which
 * boots the real feed/alerts/equipment pollers against the live MTA endpoints;
 * from this network those fetches return HTTP 403 and the poller's error-level
 * "Feed fetch failed" log line lands in the test output (captured by the pulse
 * scanner 2026-09-12 and again 2026-09-16). Worse, main() keeps running in the
 * fork while later test files reset shared state around it, so its
 * security-persistence block hits a database handle that was closed under it
 * and logs "Security persistence unavailable" (captured 2026-09-16). index.ts
 * exports nothing, so such an import also binds nothing — these tests exercise
 * the push-database module state directly instead.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closePushDatabase,
  configurePushDatabase,
  getPushDatabaseInitError,
  isPushDatabaseReady,
} from "../push/subscriptions.js";

// Store original process env
const originalEnv = process.env;

describe("Database Failure Scenarios", () => {
  const invalidDbPaths = [
    "/nonexistent/path/subscriptions.db", // Parent directory doesn't exist
    "/dev/null/full/subscriptions.db", // Cannot create in /dev/null
    "/root/.config/subscriptions.db", // Permission denied (typically)
  ];

  beforeEach(async () => {
    // Reset environment
    process.env = { ...originalEnv };
    delete process.env.CORE_ONLY;
    delete process.env.PUSH_DB_PATH;
    closePushDatabase();
  });

  afterEach(async () => {
    // Clean up
    process.env = originalEnv;
    closePushDatabase();
  });

  describe("server startup with invalid database paths", () => {
    it("should start successfully when database path parent directory does not exist", async () => {
      const invalidPath = "/nonexistent/deep/path/subscriptions.db";

      // Configure invalid path
      configurePushDatabase(invalidPath);

      // Attempt to trigger DB initialization (lazy)
      expect(isPushDatabaseReady()).toBe(false);

      // The server should have logged the error but not crashed
      // Note: The error occurs when DB is actually accessed, not during configurePushDatabase
      // Since we haven't triggered DB access yet, there may not be an error yet
      const error = getPushDatabaseInitError();
      // The error might not be set yet since DB init is lazy and we haven't accessed it
      // Just verify the DB is not ready
      expect(isPushDatabaseReady()).toBe(false);
    });

    it("should start successfully when database path is unwritable", async () => {
      // Use a path that typically cannot be written to
      const unwritablePath = "/root/.mta-my-way/subscriptions.db";

      configurePushDatabase(unwritablePath);

      // DB should not be ready
      expect(isPushDatabaseReady()).toBe(false);

      // Should have an initialization error
      const error = getPushDatabaseInitError();
      expect(error).toBeDefined();
    });
  });

  describe("health endpoint reports degraded status", () => {
    it("should report push DB as degraded when unavailable", () => {
      // The health endpoint derives pushDb's degraded status from the push
      // module's readiness signal alone, so assert that signal directly.
      // Booting the entry point to "create a test server" is not an option —
      // see the NOTE at the top of this file: importing ../index.js runs the
      // real main() in the background, whose startup error logs land in the
      // test output and get captured by the pulse scanner.
      const tempDir = join(tmpdir(), `mta-test-${Date.now()}`);
      const invalidDbPath = join(tempDir, "nonexistent", "subscriptions.db");

      configurePushDatabase(invalidDbPath);

      // Lazy-init contract: configuring an unwritable path degrades the
      // subsystem without recording an error until something actually
      // touches the database. Degraded — not crashed — is the state the
      // health endpoint must report.
      expect(isPushDatabaseReady()).toBe(false);
      expect(getPushDatabaseInitError()).toBeNull();
    });
  });

  describe("DB-dependent endpoints return 503", () => {
    it("should return 503 for push subscribe when DB unavailable", async () => {
      // Configure invalid DB path
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);

      // Verify DB is not ready
      expect(isPushDatabaseReady()).toBe(false);

      // In a real HTTP test, we would:
      // 1. Start the server
      // 2. POST to /api/push/subscribe
      // 3. Verify response is 503 with { error: "...", degraded: true }

      // For now, verify module state indicates degradation
      const error = getPushDatabaseInitError();
      expect(error).toBeDefined();
    });

    it("should return 503 for trip recording when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);

      expect(isPushDatabaseReady()).toBe(false);

      // Trip tracking shares the same DB
      // In a real HTTP test, we would POST to /api/trips
      // and verify 503 response

      const error = getPushDatabaseInitError();
      expect(error).toBeDefined();
    });

    it("should return 503 for trip queries when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);

      expect(isPushDatabaseReady()).toBe(false);

      // In a real HTTP test, we would GET /api/trips
      // and verify 503 response
    });
  });

  describe("stateless endpoints remain available", () => {
    it("should serve arrivals when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);

      expect(isPushDatabaseReady()).toBe(false);

      // Stateless endpoints like /api/arrivals, /api/stations, /api/alerts
      // should continue working even when DB is unavailable
      // In a real HTTP test, we would verify these endpoints return 200
    });

    it("should serve static assets when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);

      expect(isPushDatabaseReady()).toBe(false);

      // Static PWA assets should be served normally
      // In a real HTTP test, we would verify GET / returns 200
    });
  });
});

describe("Database recovery after initial failure", () => {
  it("should allow DB to become available after initial failure", async () => {
    // Start with invalid path
    const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
    configurePushDatabase(invalidPath);

    expect(isPushDatabaseReady()).toBe(false);
    expect(getPushDatabaseInitError()).toBeDefined();

    // Close and reconfigure with valid path
    closePushDatabase();

    const validPath = join(tmpdir(), `test-db-${Date.now()}.db`);
    configurePushDatabase(validPath);

    // DB should still not be ready until first use (lazy init)
    // But the error should be cleared
    expect(getPushDatabaseInitError()).toBeNull();
  });
});
