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
import { createApp } from "../app.js";
import {
  closePushDatabase,
  configurePushDatabase,
  getPushDatabaseInitError,
  initPushDatabase,
  isPushDatabaseReady,
} from "../push/subscriptions.js";

import {
  TEST_STATIONS,
  cleanupAllState,
  createTestUserCredentials,
  requestWithCsrf,
} from "./test-helpers.js";
const originalCoreOnly = process.env.CORE_ONLY;
const originalPushDbPath = process.env.PUSH_DB_PATH;
const createTestApp = () => createApp(TEST_STATIONS, {}, {}, {}, "/nonexistent/dist");

beforeEach(async () => {
  await cleanupAllState();
  delete process.env.CORE_ONLY;
  delete process.env.PUSH_DB_PATH;
  closePushDatabase();
});

afterEach(async () => {
  await cleanupAllState();
  closePushDatabase();
  if (originalCoreOnly === undefined) {
    delete process.env.CORE_ONLY;
  } else {
    process.env.CORE_ONLY = originalCoreOnly;
  }
  if (originalPushDbPath === undefined) {
    delete process.env.PUSH_DB_PATH;
  } else {
    process.env.PUSH_DB_PATH = originalPushDbPath;
  }
});

describe("Database Failure Scenarios", () => {
  describe("server startup with invalid database paths", () => {
    it("should start successfully when database path parent directory does not exist", async () => {
      const invalidPath = "/nonexistent/deep/path/subscriptions.db";

      initPushDatabase(invalidPath);
      expect(isPushDatabaseReady(), "push DB should reject a missing parent directory").toBe(false);
      expect(
        getPushDatabaseInitError(),
        "missing parent directory should record a DB error"
      ).toBeInstanceOf(Error);
      const res = await createTestApp().request("/healthz");
      expect(res.status, "GET /healthz should remain available after push DB failure").toBe(200);
    });

    it("should start successfully when database path is unwritable", async () => {
      const unwritablePath = "/dev/null/subscriptions.db";
      initPushDatabase(unwritablePath);
      expect(isPushDatabaseReady(), "push DB should reject an unwritable path").toBe(false);
      expect(getPushDatabaseInitError(), "unwritable path should record a DB error").toBeInstanceOf(
        Error
      );
      const res = await createTestApp().request("/healthz");
      expect(res.status, "GET /healthz should remain available for an unwritable push DB").toBe(
        200
      );
    });
  });

  describe("health endpoint reports degraded status", () => {
    it("should report push DB as degraded when unavailable", async () => {
      const tempDir = join(tmpdir(), `mta-test-${Date.now()}`);
      const invalidDbPath = join(tempDir, "nonexistent", "subscriptions.db");

      configurePushDatabase(invalidDbPath);

      const res = await createTestApp().request("/api/health");
      expect(res.status, "GET /api/health should respond while push DB is degraded").toBe(200);
      expect(
        (await res.json()).pushDb,
        "GET /api/health should report degraded push DB state"
      ).toMatchObject({ ready: false, subscriptionCount: 0 });
      expect(getPushDatabaseInitError()).toBeNull();
    });
  });

  describe("DB-dependent endpoints return 503", () => {
    it("should return 503 for push subscribe when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);
      expect(isPushDatabaseReady()).toBe(false);
      const credentials = await createTestUserCredentials();
      const res = await requestWithCsrf(createTestApp(), "/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(res.status, "POST /api/push/subscribe should return 503 without push DB").toBe(503);
      expect(
        await res.json(),
        "POST /api/push/subscribe should report degraded state"
      ).toMatchObject({ degraded: true });
    });

    it("should return 503 for trip recording when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);
      expect(isPushDatabaseReady()).toBe(false);
      const credentials = await createTestUserCredentials();
      const res = await requestWithCsrf(createTestApp(), "/api/trips", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      expect(res.status, "POST /api/trips should return 503 without push DB").toBe(503);
      expect(await res.json(), "POST /api/trips should report degraded state").toMatchObject({
        degraded: true,
      });
    });

    it("should return 503 for trip queries when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);
      expect(isPushDatabaseReady()).toBe(false);
      const credentials = await createTestUserCredentials();
      const res = await createTestApp().request("/api/trips", {
        headers: { Authorization: credentials.authorizationHeader },
      });
      expect(res.status, "GET /api/trips should return 503 without push DB").toBe(503);
      expect(await res.json(), "GET /api/trips should report degraded state").toMatchObject({
        degraded: true,
      });
    });
  });

  describe("stateless endpoints remain available", () => {
    it("should serve stations when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);
      const res = await createTestApp().request("/api/stations");
      expect(res.status, "GET /api/stations should remain available without push DB").toBe(200);
      expect(
        (await res.json()).map((station: { id: string }) => station.id),
        "GET /api/stations should retain fixture stations"
      ).toEqual(Object.keys(TEST_STATIONS));
    });

    it("should serve readiness when DB unavailable", async () => {
      const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
      configurePushDatabase(invalidPath);
      const res = await createTestApp().request("/healthz");
      expect(res.status, "GET /healthz should remain available without push DB").toBe(200);
      expect(await res.json(), "GET /healthz should report ready stateless service").toMatchObject({
        status: "ok",
      });
    });
  });
});

describe("Database recovery after initial failure", () => {
  it("should allow DB to become available after initial failure", async () => {
    const invalidPath = "/invalid/nonexistent/path/subscriptions.db";
    initPushDatabase(invalidPath);

    expect(isPushDatabaseReady(), "push DB should fail before recovery").toBe(false);
    expect(
      getPushDatabaseInitError(),
      "failed push DB should retain its init error"
    ).toBeInstanceOf(Error);

    initPushDatabase(":memory:");
    expect(isPushDatabaseReady(), "in-memory push DB should recover after failure").toBe(true);
    expect(getPushDatabaseInitError()).toBeNull();
    const res = await createTestApp().request("/api/health");
    expect(res.status, "GET /api/health should respond after push DB recovery").toBe(200);
    expect(
      (await res.json()).pushDb,
      "GET /api/health should report recovered push DB state"
    ).toMatchObject({ ready: true, subscriptionCount: 0 });
  });
});
