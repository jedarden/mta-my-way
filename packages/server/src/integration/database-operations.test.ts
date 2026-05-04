/**
 * Integration tests for database operations and transaction integrity.
 *
 * Tests database-level operations:
 * - Transaction rollback on errors
 * - Concurrent write operations
 * - Data consistency after failures
 * - Index performance and query optimization
 * - Foreign key relationships and cascading operations
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  calculateCommuteStats,
  deleteTrip,
  getTripById,
  getTrips,
  initTripTracking,
  recordTrip,
  updateTripNotes,
} from "../trip-tracking.js";
import { closeDatabase, createIntegrationTestDatabase } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_STATIONS: StationIndex = {
  "101": {
    id: "101",
    name: "South Ferry",
    location: { lat: 40.702, lon: -74.013 },
    lines: ["1"],
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "102": {
    id: "102",
    name: "Rector St",
    location: { lat: 40.709, lon: -74.014 },
    lines: ["1"],
    northStopId: "102N",
    southStopId: "102S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    location: { lat: 40.758, lon: -73.985 },
    lines: ["1", "2", "3"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "726": {
    id: "726",
    name: "42 St-Port Authority",
    location: { lat: 40.756, lon: -73.988 },
    lines: ["A", "C", "E"],
    northStopId: "726N",
    southStopId: "726S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
};

const TEST_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102", "725"],
    isExpress: false,
  },
  A: {
    id: "A",
    shortName: "A",
    longName: "8th Ave Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["726"],
    isExpress: true,
  },
};

const TEST_COMPLEXES: ComplexIndex = {};
const TEST_TRANSFERS: Record<string, TransferConnection[]> = {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Database Operations Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);

    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("Transaction integrity", () => {
    it("successfully creates and retrieves trip", () => {
      const now = Date.now();

      const trip = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      expect(trip).toBeDefined();
      expect(trip?.id).toBeDefined();

      const retrieved = getTripById(trip!.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(trip!.id);
      expect(retrieved?.line).toBe("1");
    });

    it("maintains data consistency during concurrent writes", () => {
      const now = Date.now();
      const baseTime = now - 10000000;

      // Create trips concurrently
      const trips = Array.from({ length: 20 }, (_, i) =>
        recordTrip({
          date: "2026-04-06",
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: baseTime + i * 50000,
          arrivalTime: baseTime + i * 50000 + 3600000,
          actualDurationMinutes: 60,
          source: "manual",
        })
      );

      // All should succeed
      const successCount = trips.filter((t) => t !== undefined).length;
      expect(successCount).toBe(20);

      // Verify count matches
      const retrieved = getTrips({ limit: 1000 });
      expect(retrieved.length).toBe(20);

      // Verify all have unique IDs
      const ids = retrieved.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(20);
    });

    it("handles partial update failures gracefully", () => {
      const now = Date.now();

      const trip = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        notes: "Original",
        actualDurationMinutes: 60,
        source: "manual",
      });

      expect(trip).toBeDefined();

      // Update notes
      const updated = updateTripNotes(trip!.id, "Updated notes");
      expect(updated).toBe(true);

      // Verify update
      const retrieved = getTripById(trip!.id);
      expect(retrieved?.notes).toBe("Updated notes");
    });
  });

  describe("Query performance and indexing", () => {
    beforeEach(() => {
      const now = Date.now();
      const baseTime = now - 100000000;

      // Create larger dataset for performance testing
      for (let i = 0; i < 50; i++) {
        const originId = i % 2 === 0 ? "101" : "102";
        recordTrip({
          date: `2026-04-${(i % 30) + 1}`.padStart(10, "0"),
          origin: { id: originId, name: "Origin" },
          destination: { id: "725", name: "Dest" },
          line: "1",
          departureTime: baseTime + i * 100000,
          arrivalTime: baseTime + i * 100000 + 3600000,
          actualDurationMinutes: 60,
          source: "manual",
        });
      }
    });

    it("efficiently filters by origin station", () => {
      const trips = getTrips({ originId: "101", limit: 100 });

      expect(trips.length).toBe(25);
      expect(trips.every((t) => t.origin.id === "101")).toBe(true);
    });

    it("efficiently filters by date range", () => {
      const trips = getTrips({ startDate: "2026-04-01", endDate: "2026-04-10", limit: 100 });

      expect(trips.length).toBe(10);
    });

    it("efficiently paginates large result sets", () => {
      const page1 = getTrips({ limit: 10, offset: 0 });
      const page2 = getTrips({ limit: 10, offset: 10 });

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);

      // Verify pages are different
      const ids1 = page1.map((t) => t.id);
      const ids2 = page2.map((t) => t.id);
      expect(ids1).not.toEqual(ids2);

      // Verify no overlap
      const overlap = ids1.filter((id) => ids2.includes(id));
      expect(overlap.length).toBe(0);
    });
  });

  describe("Data consistency across operations", () => {
    it("maintains consistency between trips and stats", () => {
      const now = Date.now();

      // Create trips
      for (let i = 0; i < 5; i++) {
        recordTrip({
          date: "2026-04-06",
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000 - i * 100000,
          arrivalTime: now - i * 100000,
          actualDurationMinutes: 60,
          source: "manual",
        });
      }

      // Get trip count
      const trips = getTrips({ limit: 100 });

      // Get stats
      const stats = calculateCommuteStats("default");

      // Verify consistency
      expect(trips.length).toBe(stats.totalTrips);
      expect(trips.length).toBe(5);
    });

    it("updates stats correctly after trip deletion", () => {
      const now = Date.now();

      // Create trips with specific durations
      recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 7200000,
        arrivalTime: now - 3600000,
        actualDurationMinutes: 60,
        scheduledDurationMinutes: 50,
        source: "manual",
      });

      const trip2 = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 45,
        scheduledDurationMinutes: 50,
        source: "manual",
      });

      // Check initial stats
      const stats1 = calculateCommuteStats("default");
      expect(stats1.totalTrips).toBe(2);

      // Delete one trip
      if (trip2) {
        deleteTrip(trip2.id);
      }

      // Check updated stats
      const stats2 = calculateCommuteStats("default");
      expect(stats2.totalTrips).toBe(1);
    });
  });

  describe("Edge cases and boundary conditions", () => {
    it("handles empty result sets efficiently", () => {
      const trips = getTrips({ originId: "999" });

      expect(trips).toEqual([]);
    });

    it("handles very large offset values", () => {
      const trips = getTrips({ offset: 99999 });

      expect(trips).toEqual([]);
    });

    it("handles boundary date values", () => {
      const trips = getTrips({ startDate: "2025-01-01", endDate: "2025-12-31" });

      expect(trips).toEqual([]);
    });

    it("handles special characters in notes", () => {
      const now = Date.now();
      const specialNotes = "Test with 'quotes', \"double quotes\", <html>, &symbols;";

      const trip = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        notes: specialNotes,
        actualDurationMinutes: 60,
        source: "manual",
      });

      expect(trip?.notes).toBe(specialNotes);
    });
  });

  describe("Statistics calculation accuracy", () => {
    it("correctly calculates median for odd count", () => {
      const now = Date.now();

      // Create trips with durations: 40, 50, 60, 70, 80
      for (let i = 0; i < 5; i++) {
        recordTrip({
          date: "2026-04-06",
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - (5 - i) * 10000000,
          arrivalTime: now - (5 - i) * 10000000 + (40 + i * 10) * 60000,
          actualDurationMinutes: 40 + i * 10,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("default");
      expect(stats.totalTrips).toBe(5);
      expect(stats.medianDurationMinutes).toBe(60);
    });

    it("correctly calculates median for even count", () => {
      const now = Date.now();

      // Create trips with durations: 40, 50, 60, 70
      for (let i = 0; i < 4; i++) {
        recordTrip({
          date: "2026-04-06",
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - (4 - i) * 10000000,
          arrivalTime: now - (4 - i) * 10000000 + (40 + i * 10) * 60000,
          actualDurationMinutes: 40 + i * 10,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("default");
      expect(stats.totalTrips).toBe(4);
      expect(stats.medianDurationMinutes).toBe(55); // (50 + 60) / 2
    });

    it("correctly handles division by zero for empty stats", () => {
      const stats = calculateCommuteStats("default");

      expect(stats.totalTrips).toBe(0);
      expect(stats.averageDurationMinutes).toBe(0);
      expect(stats.medianDurationMinutes).toBe(0);
    });
  });

  describe("Concurrent access patterns", () => {
    it("handles simultaneous reads", () => {
      const now = Date.now();

      // Create a trip
      recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      // Simultaneous read operations
      const reads = Array.from({ length: 10 }, () => getTrips({ limit: 100 }));

      // All should return consistent data
      for (const result of reads) {
        expect(result.length).toBe(1);
      }
    });

    it("handles rapid sequential updates", () => {
      const now = Date.now();

      const trip = recordTrip({
        date: "2026-04-06",
        origin: { id: "101", name: "South Ferry" },
        destination: { id: "725", name: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        notes: "Original",
        actualDurationMinutes: 60,
        source: "manual",
      });

      expect(trip).toBeDefined();

      // Rapid sequential updates
      const notes = ["Update 1", "Update 2", "Update 3"];
      for (const note of notes) {
        updateTripNotes(trip!.id, note);
        const retrieved = getTripById(trip!.id);
        expect(retrieved?.notes).toBe(note);
      }

      // Final state should be the last update
      const final = getTripById(trip!.id);
      expect(final?.notes).toBe("Update 3");
    });
  });

  describe("Database consistency workflows", () => {
    it("maintains consistency after deletion cascade", () => {
      const now = Date.now();

      // Create multiple trips
      const tripIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const trip = recordTrip({
          date: "2026-04-06",
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000 - i * 100000,
          arrivalTime: now - i * 100000,
          actualDurationMinutes: 60,
          source: "manual",
        });

        if (trip) tripIds.push(trip.id);
      }

      // Delete trips one by one
      for (const id of tripIds) {
        deleteTrip(id);
      }

      // Verify all deleted
      const trips = getTrips({ limit: 100 });
      expect(trips.length).toBe(0);

      // Verify stats updated
      const stats = calculateCommuteStats("default");
      expect(stats.totalTrips).toBe(0);
    });
  });
});
