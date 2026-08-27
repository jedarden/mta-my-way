/**
 * Smoke test to verify E2E test infrastructure is working.
 *
 * This test validates:
 * - Database helpers create valid test databases
 * - Authentication helpers generate test credentials
 * - Test fixtures produce valid data
 * - Cleanup functions work correctly
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TEST_STATIONS,
  cleanupAllState,
  clearAllTrips,
  clearCommuteStatsCache,
  closeDatabase,
  createIntegrationTestDatabase,
  createPushDatabase,
  createTestSubscription,
  createTestTrip,
  createTestUserCredentials,
  createTripTrackingDatabase,
} from "./test-helpers.js";

describe("E2E Test Infrastructure Smoke Test", () => {
  it("creates in-memory trip tracking database", () => {
    const db = createTripTrackingDatabase();

    expect(db).toBeDefined();

    // Verify tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("trips");
    expect(tableNames).toContain("commute_stats");

    closeDatabase(db);
  });

  it("creates in-memory push database", () => {
    const db = createPushDatabase();

    expect(db).toBeDefined();

    // Verify tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("push_subscriptions");

    closeDatabase(db);
  });

  it("creates combined integration test database", () => {
    const db = createIntegrationTestDatabase();

    expect(db).toBeDefined();

    // Verify all tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("trips");
    expect(tableNames).toContain("commute_stats");
    expect(tableNames).toContain("push_subscriptions");

    closeDatabase(db);
  });

  it("creates test trip with default values", () => {
    const trip = createTestTrip();

    expect(trip).toBeDefined();
    expect(trip.origin.stationId).toBe("101");
    expect(trip.destination.stationId).toBe("725");
    expect(trip.line).toBe("1");
    expect(trip.source).toBe("manual");
  });

  it("creates test trip with overrides", () => {
    const trip = createTestTrip({
      originId: "725",
      originName: "Times Square",
      destinationId: "726",
      destinationName: "Port Authority",
      line: "A",
    });

    expect(trip.origin.stationId).toBe("725");
    expect(trip.destination.stationId).toBe("726");
    expect(trip.line).toBe("A");
  });

  it("creates test push subscription", () => {
    const sub = createTestSubscription();

    expect(sub).toBeDefined();
    expect(sub.subscription.endpoint).toContain("https://");
    expect(sub.subscription.keys.p256dh).toBeDefined();
    expect(sub.subscription.keys.auth).toBeDefined();
    expect(sub.favorites).toHaveLength(1);
  });

  it("TEST_STATIONS fixture has expected structure", () => {
    expect(TEST_STATIONS).toBeDefined();
    expect(Object.keys(TEST_STATIONS)).toContain("101");
    expect(Object.keys(TEST_STATIONS)).toContain("725");

    const timesSquare = TEST_STATIONS["725"];
    expect(timesSquare.name).toBe("Times Sq-42 St");
    expect(timesSquare.lines).toContain("1");
    expect(timesSquare.ada).toBe(true);
    expect(timesSquare.transfers).toHaveLength(1);
  });

  it("clearAllTrips empties trips table", () => {
    const db = createTripTrackingDatabase();

    // Insert a test trip
    db.prepare(
      "INSERT INTO trips (id, date, origin_station_id, origin_station_name, destination_station_id, destination_station_name, line, departure_time, arrival_time, actual_duration_minutes, created_at, updated_at, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "test-trip-1",
      "2026-08-27",
      "101",
      "South Ferry",
      "725",
      "Times Square",
      "1",
      Date.now() - 3600000,
      Date.now(),
      60,
      Date.now(),
      Date.now(),
      "test-user"
    );

    // Verify trip exists
    const countBefore = db.prepare("SELECT COUNT(*) as count FROM trips").get() as {
      count: number;
    };
    expect(countBefore.count).toBe(1);

    // Clear trips
    clearAllTrips(db);

    // Verify trips are gone
    const countAfter = db.prepare("SELECT COUNT(*) as count FROM trips").get() as { count: number };
    expect(countAfter.count).toBe(0);

    closeDatabase(db);
  });

  it("clearCommuteStatsCache empties commute_stats table", () => {
    const db = createTripTrackingDatabase();

    // Insert a test stat entry
    db.prepare(
      "INSERT INTO commute_stats (commute_id, average_duration_minutes, median_duration_minutes, std_dev_minutes, total_trips, trips_this_week, trend, average_delay_minutes, max_delay_minutes, on_time_percentage, last_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run("test-commute", 45, 42, 5.2, 100, 5, 0.1, 2.5, 15, 95.0, Date.now());

    // Verify stat exists
    const countBefore = db.prepare("SELECT COUNT(*) as count FROM commute_stats").get() as {
      count: number;
    };
    expect(countBefore.count).toBe(1);

    // Clear stats
    clearCommuteStatsCache(db);

    // Verify stats are gone
    const countAfter = db.prepare("SELECT COUNT(*) as count FROM commute_stats").get() as {
      count: number;
    };
    expect(countAfter.count).toBe(0);

    closeDatabase(db);
  });

  it("cleanupAllState can be called without errors", async () => {
    // This should not throw any errors
    await cleanupAllState();
    expect(true).toBe(true);
  });

  it("database can be closed safely", () => {
    const db = createIntegrationTestDatabase();

    // Closing should not throw
    expect(() => closeDatabase(db)).not.toThrow();
  });

  it("creates test API credentials", async () => {
    const creds = await createTestUserCredentials();

    expect(creds).toBeDefined();
    expect(creds.keyId).toMatch(/^test_key_/);
    expect(creds.apiKey).toBeTruthy();
    expect(creds.authorizationHeader).toMatch(/^Bearer test_key_[^:]+:.+$/);
  });
});

describe("Database Schema Validation", () => {
  it("trips table has all required columns", () => {
    const db = createTripTrackingDatabase();

    const columns = db.pragma("table_info(trips)") as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);

    // Required columns
    expect(columnNames).toContain("id");
    expect(columnNames).toContain("date");
    expect(columnNames).toContain("origin_station_id");
    expect(columnNames).toContain("destination_station_id");
    expect(columnNames).toContain("line");
    expect(columnNames).toContain("departure_time");
    expect(columnNames).toContain("arrival_time");
    expect(columnNames).toContain("actual_duration_minutes");
    expect(columnNames).toContain("owner_id");

    closeDatabase(db);
  });

  it("push_subscriptions table has all required columns", () => {
    const db = createPushDatabase();

    const columns = db.pragma("table_info(push_subscriptions)") as Array<{ name: string }>;
    const columnNames = columns.map((c) => c.name);

    // Required columns
    expect(columnNames).toContain("endpoint_hash");
    expect(columnNames).toContain("endpoint");
    expect(columnNames).toContain("p256dh");
    expect(columnNames).toContain("auth");
    expect(columnNames).toContain("favorites");
    expect(columnNames).toContain("owner_id");

    closeDatabase(db);
  });

  it("database has proper indexes", () => {
    const db = createTripTrackingDatabase();

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
      )
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    // Expected indexes
    expect(indexNames.length).toBeGreaterThan(0);
    expect(indexNames).toContain("idx_trips_date");
    expect(indexNames).toContain("idx_trips_owner_id");

    closeDatabase(db);
  });
});
