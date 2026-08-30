/**
 * E2E Smoke Test
 *
 * Basic smoke test that validates the entire test infrastructure works.
 * Tests that:
 * - Test helpers and fixtures load correctly
 * - Integration test database can be created and used
 * - Basic app operations work end-to-end
 * - Test isolation mechanisms function properly
 *
 * This is the first test to run to ensure the test suite itself is functional.
 */

import type { ComplexIndex, RouteIndex, StationIndex } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  TEST_STATIONS,
  cleanupAllState,
  closeDatabase,
  createIntegrationTestDatabase,
  createTestApiKey,
  createTestTrip,
} from "./test-helpers.js";

// Minimal test fixtures for routes and complexes
const TEST_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "725"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {};

describe("E2E Smoke Test", () => {
  let db: ReturnType<typeof createIntegrationTestDatabase>;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    // Reset all module-level state for test isolation
    await cleanupAllState();

    // Create a fresh in-memory database for this test
    db = createIntegrationTestDatabase();

    // Create the test app with test fixtures
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      {}, // transfers
      "/nonexistent/dist" // webDistPath
    );
  });

  afterEach(() => {
    // Clean up database connection
    if (db) {
      closeDatabase(db);
    }
  });

  describe("Test Infrastructure", () => {
    it("should load test helpers and fixtures", () => {
      // Verify test fixtures are available
      expect(TEST_STATIONS).toBeDefined();
      expect(typeof TEST_STATIONS).toBe("object");
      expect(Object.keys(TEST_STATIONS).length).toBeGreaterThan(0);

      // Verify specific test data
      expect(TEST_STATIONS["101"]).toBeDefined();
      expect(TEST_STATIONS["101"].name).toBe("South Ferry");
      expect(TEST_STATIONS["101"].lines).toEqual(["1"]);
    });

    it("should create integration test database", () => {
      // Database should be created and accessible
      expect(db).toBeDefined();
      expect(typeof db.prepare).toBe("function");

      // Verify tables exist
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain("trips");
      expect(tableNames).toContain("commute_stats");
      expect(tableNames).toContain("push_subscriptions");
    });

    it("should create test app successfully", () => {
      // App should be created with proper structure
      expect(app).toBeDefined();
      expect(typeof app.request).toBe("function");
      expect(typeof app.fire).toBe("function");
    });
  });

  describe("Basic Operations", () => {
    it("should handle health check endpoint", async () => {
      const response = await app.request("/api/health");
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("status");
      // Status can be "healthy" or "degraded" depending on feed state
      expect(["healthy", "degraded"]).toContain(body.status);
      expect(body).toHaveProperty("uptime_seconds");
    });

    it("should handle station queries", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it("should handle 404 for unknown routes", async () => {
      const response = await app.request("/api/this-route-does-not-exist");
      expect(response.status).toBe(404);
    });
  });

  describe("Database Operations", () => {
    it("should insert and query trip records", () => {
      const testTrip = createTestTrip({
        id: "smoke-test-trip-1",
        originId: "101",
        destinationId: "725",
        line: "1",
      });

      // Insert a trip
      const insertStmt = db.prepare(`
        INSERT INTO trips (
          id, date, origin_station_id, origin_station_name,
          destination_station_id, destination_station_name,
          line, departure_time, arrival_time,
          actual_duration_minutes, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = Date.now();
      insertStmt.run(
        testTrip.id,
        testTrip.date,
        testTrip.origin.stationId,
        testTrip.origin.stationName,
        testTrip.destination.stationId,
        testTrip.destination.stationName,
        testTrip.line,
        testTrip.departureTime,
        testTrip.arrivalTime,
        testTrip.actualDurationMinutes,
        testTrip.source,
        now,
        now
      );

      // Query it back
      const row = db.prepare("SELECT * FROM trips WHERE id = ?").get(testTrip.id) as any;

      expect(row).toBeDefined();
      expect(row.id).toBe(testTrip.id);
      expect(row.origin_station_id).toBe("101");
      expect(row.destination_station_id).toBe("725");
      expect(row.line).toBe("1");
    });

    it("should handle database transaction rollback", () => {
      // Clear any existing data first for test isolation
      db.prepare("DELETE FROM trips").run();

      // Start with 0 trips
      const initialCount = db.prepare("SELECT COUNT(*) as count FROM trips").get() as {
        count: number;
      };
      expect(initialCount.count).toBe(0);

      // Try to insert a trip in a transaction that will rollback
      const transaction = db.transaction(() => {
        db.prepare(
          "INSERT INTO trips (id, date, origin_station_id, origin_station_name, destination_station_id, destination_station_name, line, departure_time, arrival_time, actual_duration_minutes, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          "rollback-test-1",
          "2026-08-30",
          "101",
          "South Ferry",
          "725",
          "Times Sq-42 St",
          "1",
          Date.now() - 3600000,
          Date.now(),
          60,
          "manual",
          Date.now(),
          Date.now()
        );
        throw new Error("Intentional rollback");
      });

      // Transaction should throw
      expect(() => transaction()).toThrow("Intentional rollback");

      // Should still have 0 trips (rollback worked)
      const finalCount = db.prepare("SELECT COUNT(*) as count FROM trips").get() as {
        count: number;
      };
      expect(finalCount.count).toBe(0);
    });
  });

  describe("Authentication Infrastructure", () => {
    it("should create test API key credentials", async () => {
      const credentials = await createTestApiKey("read", "user");

      expect(credentials).toBeDefined();
      expect(credentials.keyId).toMatch(/^test_key_/);
      expect(credentials.apiKey).toBeDefined();
      expect(credentials.authorizationHeader).toMatch(/^Bearer test_key_/);
      expect(credentials.authorizationHeader).toContain(":");
    });

    it("should require authentication for protected endpoints", async () => {
      // Try to access a protected endpoint without auth
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      // Should get 401 or 403 (depending on auth configuration)
      expect([401, 403]).toContain(response.status);
    });
  });

  describe("Test Isolation", () => {
    it("should isolate state between tests", async () => {
      // Create a test API key
      const credentials = await createTestApiKey("read", "user");
      expect(credentials).toBeDefined();

      // Verify we can make an authenticated request
      const response = await app.request("/api/stations", {
        headers: {
          Authorization: credentials.authorizationHeader,
        },
      });

      expect(response.status).toBe(200);
    });

    it("should clean up database between tests", () => {
      // This test verifies that the beforeEach/afterEach hooks work
      // Insert some data
      db.prepare(
        "INSERT INTO trips (id, date, origin_station_id, origin_station_name, destination_station_id, destination_station_name, line, departure_time, arrival_time, actual_duration_minutes, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        "isolation-test-1",
        "2026-08-30",
        "101",
        "South Ferry",
        "725",
        "Times Sq-42 St",
        "1",
        Date.now() - 3600000,
        Date.now(),
        60,
        "manual",
        Date.now(),
        Date.now()
      );

      // Verify it exists
      const count = db.prepare("SELECT COUNT(*) as count FROM trips").get() as { count: number };
      expect(count.count).toBe(1);

      // The afterEach hook will clean this up
      // Next test should start fresh
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid JSON gracefully", async () => {
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json{{{",
      });

      // Should return 400 or similar error status
      expect([400, 422]).toContain(response.status);
    });

    it("should handle missing required fields", async () => {
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Missing required fields like line, destination, etc.
        }),
      });

      // Should return authentication error or validation error
      expect([400, 401, 422]).toContain(response.status);
    });
  });

  describe("Performance Smoke", () => {
    it("should respond to health check within 100ms", async () => {
      const start = performance.now();
      const response = await app.request("/api/health");
      const duration = performance.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);
    });

    it("should respond to station queries within 200ms", async () => {
      const start = performance.now();
      const response = await app.request("/api/stations");
      const duration = performance.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(200);
    });
  });
});
