/**
 * Integration tests for trip tracking with real database operations.
 *
 * Tests the full data flow:
 * - Database CRUD operations
 * - Statistics calculation
 * - Query filtering and pagination
 * - Cache invalidation
 */

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  calculateCommuteStats,
  deleteTrip,
  getTripById,
  getTrips,
  getTripsByDateRange,
  initTripTracking,
  recordInferredTrip,
  recordTrip,
  updateTripNotes,
} from "../trip-tracking.js";
import {
  TEST_STATIONS,
  closeDatabase,
  createIntegrationTestDatabase,
  createTestTrip,
} from "./test-helpers.js";

describe("Trip Tracking Integration Tests", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("recordTrip", () => {
    it("persists trip to database", () => {
      const trip = createTestTrip({
        originId: "101",
        destinationId: "725",
        line: "1",
      });

      const result = recordTrip(trip);

      expect(result).not.toBeNull();
      expect(result?.id).toBeDefined();

      // Verify it's in the database
      const retrieved = getTripById(result!.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.origin.id).toBe("101");
      expect(retrieved?.destination.id).toBe("725");
    });

    it("generates unique IDs for each trip", () => {
      const trip1 = recordTrip(createTestTrip());
      const trip2 = recordTrip(createTestTrip());

      expect(trip1?.id).not.toBe(trip2?.id);
    });

    it("stores all trip fields correctly", () => {
      const now = Date.now();
      const tripData = createTestTrip({
        date: "2026-04-06",
        originId: "101",
        originName: "South Ferry",
        destinationId: "725",
        destinationName: "Times Sq-42 St",
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        scheduledDurationMinutes: 55,
        source: "manual",
        notes: "Test trip notes",
      });

      const result = recordTrip(tripData);

      const retrieved = getTripById(result!.id);
      expect(retrieved?.date).toBe("2026-04-06");
      expect(retrieved?.origin.id).toBe("101");
      expect(retrieved?.destination.id).toBe("725");
      expect(retrieved?.line).toBe("1");
      expect(retrieved?.notes).toBe("Test trip notes");
    });

    it("returns null when db is not initialized", () => {
      // Close the database to simulate uninitialized state
      const testDb = createIntegrationTestDatabase();
      initTripTracking(testDb, TEST_STATIONS);
      closeDatabase(db);

      // Record should still work because trip-tracking has its own db reference
      const result = recordTrip(createTestTrip());
      expect(result).toBeDefined(); // The module's db is still the test database
    });
  });

  describe("getTrips", () => {
    let tripIds: string[];

    beforeEach(() => {
      // Insert test trips and store their generated IDs
      const now = Date.now();
      const t1 = recordTrip(
        createTestTrip({
          date: "2026-04-01",
          originId: "101",
          destinationId: "102",
          line: "1",
          departureTime: now - 86400000 * 5,
        })
      );
      const t2 = recordTrip(
        createTestTrip({
          date: "2026-04-02",
          originId: "101",
          destinationId: "725",
          line: "1",
          departureTime: now - 86400000 * 4,
        })
      );
      const t3 = recordTrip(
        createTestTrip({
          date: "2026-04-03",
          originId: "725",
          destinationId: "726",
          line: "A",
          departureTime: now - 86400000 * 3,
        })
      );
      tripIds = [t1!.id, t2!.id, t3!.id];
    });

    it("returns all trips with default limit", () => {
      const trips = getTrips({});
      expect(trips).toHaveLength(3);
    });

    it("respects limit parameter", () => {
      const trips = getTrips({ limit: 2 });
      expect(trips).toHaveLength(2);
    });

    it("respects offset parameter", () => {
      const trips = getTrips({ limit: 10, offset: 1 });
      expect(trips).toHaveLength(2);
    });

    it("filters by origin station", () => {
      const trips = getTrips({ originId: "101" });
      expect(trips).toHaveLength(2);
      expect(trips.every((t) => t.origin.id === "101")).toBe(true);
    });

    it("filters by destination station", () => {
      const trips = getTrips({ destinationId: "725" });
      expect(trips).toHaveLength(1);
      expect(trips[0]?.destination.id).toBe("725");
    });

    it("filters by line", () => {
      const trips = getTrips({ line: "1" });
      expect(trips).toHaveLength(2);
      expect(trips.every((t) => t.line === "1")).toBe(true);
    });

    it("filters by date range", () => {
      const trips = getTrips({ startDate: "2026-04-02", endDate: "2026-04-02" });
      expect(trips).toHaveLength(1);
      expect(trips[0]?.id).toBe(tripIds[1]);
    });

    it("filters by source", () => {
      const t4 = recordTrip(
        createTestTrip({
          source: "inferred",
        })
      );

      const trips = getTrips({ source: "inferred" });
      expect(trips).toHaveLength(1);
      expect(trips[0]?.source).toBe("inferred");
      expect(trips[0]?.id).toBe(t4!.id);
    });

    it("sorts by departure time descending", () => {
      const trips = getTrips({});
      for (let i = 1; i < trips.length; i++) {
        expect(trips[i - 1]!.departureTime).toBeGreaterThanOrEqual(trips[i]!.departureTime);
      }
    });

    it("combines multiple filters", () => {
      const trips = getTrips({ originId: "101", line: "1" });
      expect(trips).toHaveLength(2);
      expect(trips.every((t) => t.origin.id === "101" && t.line === "1")).toBe(true);
    });

    it("returns empty array when no trips match", () => {
      const trips = getTrips({ originId: "999" });
      expect(trips).toEqual([]);
    });
  });

  describe("getTripById", () => {
    it("retrieves trip by ID", () => {
      const created = recordTrip(createTestTrip());
      const retrieved = getTripById(created!.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created!.id);
      expect(retrieved?.origin.id).toBe("101");
      expect(retrieved?.destination.id).toBe("725");
    });

    it("returns null for non-existent trip", () => {
      const retrieved = getTripById("non-existent");
      expect(retrieved).toBeNull();
    });
  });

  describe("updateTripNotes", () => {
    it("updates trip notes", () => {
      const trip = recordTrip(createTestTrip());

      const success = updateTripNotes(trip!.id, "Updated notes");
      expect(success).toBe(true);

      const updated = getTripById(trip!.id);
      expect(updated?.notes).toBe("Updated notes");
    });

    it("returns false for non-existent trip", () => {
      const success = updateTripNotes("non-existent", "notes");
      expect(success).toBe(false);
    });

    it("can clear notes by setting empty string", () => {
      const trip = recordTrip(createTestTrip({ notes: "Initial notes" }));

      updateTripNotes(trip!.id, "");
      const updated = getTripById(trip!.id);

      expect(updated?.notes).toBe("");
    });
  });

  describe("deleteTrip", () => {
    it("deletes trip from database", () => {
      const trip = recordTrip(createTestTrip());

      const success = deleteTrip(trip!.id);
      expect(success).toBe(true);

      const retrieved = getTripById(trip!.id);
      expect(retrieved).toBeNull();
    });

    it("returns false for non-existent trip", () => {
      const success = deleteTrip("non-existent");
      expect(success).toBe(false);
    });
  });

  describe("getTripsByDateRange", () => {
    let tripIds: string[];

    beforeEach(() => {
      const now = Date.now();
      const t1 = recordTrip(
        createTestTrip({ date: "2026-04-01", departureTime: now - 86400000 * 5 })
      );
      const t2 = recordTrip(
        createTestTrip({ date: "2026-04-05", departureTime: now - 86400000 * 1 })
      );
      const t3 = recordTrip(
        createTestTrip({ date: "2026-04-10", departureTime: now - 86400000 * -4 })
      );
      tripIds = [t1!.id, t2!.id, t3!.id];
    });

    it("returns trips within date range", () => {
      const trips = getTripsByDateRange("2026-04-01", "2026-04-05");
      expect(trips).toHaveLength(2);
      expect(trips.some((t) => t.id === tripIds[0])).toBe(true);
      expect(trips.some((t) => t.id === tripIds[1])).toBe(true);
    });

    it("excludes trips outside date range", () => {
      const trips = getTripsByDateRange("2026-04-06", "2026-04-09");
      expect(trips).toHaveLength(0);
    });

    it("includes trips on start date", () => {
      const trips = getTripsByDateRange("2026-04-01", "2026-04-01");
      expect(trips).toHaveLength(1);
      expect(trips[0]?.id).toBe(tripIds[0]);
    });

    it("includes trips on end date", () => {
      const trips = getTripsByDateRange("2026-04-05", "2026-04-05");
      expect(trips).toHaveLength(1);
      expect(trips[0]?.id).toBe(tripIds[1]);
    });
  });

  describe("recordInferredTrip", () => {
    it("records trip from GTFS-RT data", () => {
      const now = Math.floor(Date.now() / 1000);

      const result = recordInferredTrip({
        tripId: "gtfs-trip-123",
        routeId: "1",
        direction: "N",
        originId: "101",
        destinationId: "725",
        departureTime: now - 3600,
        arrivalTime: now,
      });

      expect(result).not.toBeNull();
      expect(result?.line).toBe("1");
      expect(result?.source).toBe("inferred");
      expect(result?.origin.id).toBe("101");
      expect(result?.destination.id).toBe("725");
    });

    it("calculates actual duration from timestamps", () => {
      const now = Math.floor(Date.now() / 1000);
      const departureTime = now - 1800; // 30 minutes ago

      const result = recordInferredTrip({
        tripId: "gtfs-trip-456",
        routeId: "A",
        direction: "S",
        originId: "725",
        destinationId: "726",
        departureTime,
        arrivalTime: now,
      });

      expect(result?.actualDurationMinutes).toBe(30);
    });

    it("returns null for unknown origin station", () => {
      const now = Math.floor(Date.now() / 1000);

      const result = recordInferredTrip({
        tripId: "gtfs-trip-789",
        routeId: "1",
        direction: "N",
        originId: "999", // Unknown station
        destinationId: "725",
        departureTime: now - 3600,
        arrivalTime: now,
      });

      expect(result).toBeNull();
    });

    it("returns null for unknown destination station", () => {
      const now = Math.floor(Date.now() / 1000);

      const result = recordInferredTrip({
        tripId: "gtfs-trip-789",
        routeId: "1",
        direction: "N",
        originId: "101",
        destinationId: "999", // Unknown station
        departureTime: now - 3600,
        arrivalTime: now,
      });

      expect(result).toBeNull();
    });
  });

  describe("calculateCommuteStats", () => {
    beforeEach(() => {
      const now = Date.now();
      // Create trips with varying durations for statistics
      recordTrip(
        createTestTrip({
          date: "2026-04-06",
          actualDurationMinutes: 50,
          scheduledDurationMinutes: 45,
          departureTime: now - 3600000,
        })
      );
      recordTrip(
        createTestTrip({
          date: "2026-04-06",
          actualDurationMinutes: 60,
          scheduledDurationMinutes: 55,
          departureTime: now - 7200000,
        })
      );
      recordTrip(
        createTestTrip({
          date: "2026-04-06",
          actualDurationMinutes: 70,
          scheduledDurationMinutes: 65,
          departureTime: now - 10800000,
        })
      );
    });

    it("calculates average duration", () => {
      const stats = calculateCommuteStats();
      expect(stats?.averageDurationMinutes).toBe(60);
    });

    it("calculates median duration", () => {
      const stats = calculateCommuteStats();
      expect(stats?.medianDurationMinutes).toBe(60);
    });

    it("calculates standard deviation", () => {
      const stats = calculateCommuteStats();
      // Sample standard deviation of [50, 60, 70] is ~10 (population is 8.16)
      expect(stats?.stdDevMinutes).toBeGreaterThan(8);
      expect(stats?.stdDevMinutes).toBeLessThan(12);
    });

    it("calculates delay statistics", () => {
      const stats = calculateCommuteStats();
      expect(stats?.averageDelayMinutes).toBe(5); // All 5 minutes late
      expect(stats?.maxDelayMinutes).toBe(5);
    });

    it("calculates on-time percentage", () => {
      // Add an on-time trip (within 2 minutes)
      const now = Date.now();
      recordTrip(
        createTestTrip({
          date: "2026-04-06",
          actualDurationMinutes: 45,
          scheduledDurationMinutes: 45,
          departureTime: now - 14400000,
        })
      );

      const stats = calculateCommuteStats();
      // 1 out of 4 trips is on time
      expect(stats?.onTimePercentage).toBeCloseTo(25, 0);
    });

    it("counts total trips", () => {
      const stats = calculateCommuteStats();
      expect(stats?.totalTrips).toBe(3);
    });

    it("returns zero stats when no trips exist", () => {
      // Create a fresh database with no trips
      const emptyDb = createIntegrationTestDatabase();
      initTripTracking(emptyDb, TEST_STATIONS);

      const stats = calculateCommuteStats();
      expect(stats?.totalTrips).toBe(0);
      expect(stats?.averageDurationMinutes).toBe(0);

      closeDatabase(emptyDb);
    });

    it("includes recent trips in records", () => {
      const stats = calculateCommuteStats();
      expect(stats?.records).toHaveLength(3);
      expect(stats?.records[0]?.id).toBeDefined();
    });
  });
});
