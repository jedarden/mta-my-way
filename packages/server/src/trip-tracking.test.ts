/**
 * Tests for trip tracking and commute journal service.
 *
 * Tests trip recording, querying, statistics calculation,
 * ownership checks, and cleanup operations.
 */

import { existsSync, unlinkSync } from "node:fs";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OWNER_ID,
  type TripRecord,
  calculateCommuteStats,
  checkTripOwnership,
  cleanupOldTrips,
  deleteTrip,
  getRecentTripsForStation,
  getTotalTripCount,
  getTripById,
  getTripCountForDate,
  getTripOwner,
  getTrips,
  getTripsByDateRange,
  initTripTracking,
  recordInferredTrip,
  recordTrip,
  updateTripNotes,
} from "./trip-tracking.js";

// Mock the metrics module
vi.mock("./middleware/metrics.js", () => ({
  recordTripCreated: vi.fn(),
  recordTripQueried: vi.fn(),
  recordTripQueryDuration: vi.fn(),
  setActiveTripsCount: vi.fn(),
}));

// Mock the logger module
vi.mock("./observability/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

const TEST_DB_PATH = "/tmp/test-trip-tracking.db";
const mockStations = {
  "101": {
    id: "101",
    name: "South Ferry",
    lat: 40.702,
    lon: -74.013,
    lines: ["1"],
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    lat: 40.758,
    lon: -73.985,
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
    lat: 40.756,
    lon: -73.988,
    lines: ["A", "C", "E"],
    northStopId: "726N",
    southStopId: "726S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
};

describe("trip-tracking", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    // Create a fresh in-memory database for each test
    db = new Database(":memory:");

    // Create the trips table
    db.exec(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        origin_station_id TEXT NOT NULL,
        origin_station_name TEXT NOT NULL,
        destination_station_id TEXT NOT NULL,
        destination_station_name TEXT NOT NULL,
        line TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'N',
        departure_time INTEGER NOT NULL,
        arrival_time INTEGER NOT NULL,
        actual_duration_minutes INTEGER NOT NULL,
        scheduled_duration_minutes INTEGER,
        source TEXT NOT NULL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        owner_id TEXT NOT NULL DEFAULT '${DEFAULT_OWNER_ID}'
      );

      CREATE TABLE IF NOT EXISTS commute_stats (
        commute_id TEXT PRIMARY KEY,
        average_duration_minutes REAL,
        median_duration_minutes REAL,
        std_dev_minutes REAL,
        total_trips INTEGER,
        trips_this_week INTEGER,
        trend REAL,
        average_delay_minutes REAL,
        max_delay_minutes REAL,
        on_time_percentage REAL,
        last_updated INTEGER
      );
    `);

    // Initialize trip tracking with test database
    initTripTracking(db, mockStations);
  });

  afterEach(() => {
    db.close();
  });

  describe("recordTrip", () => {
    it("records a trip successfully", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        scheduledDurationMinutes: 35,
        source: "manual" as const,
        notes: "Test trip",
      };

      const result = recordTrip(trip);

      expect(result).not.toBeNull();
      expect(result?.id).toBeDefined();
      expect(result?.origin.stationName).toBe("South Ferry");
      expect(result?.destination.stationName).toBe("Times Sq-42 St");
    });

    it("records a trip with custom owner ID", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const customOwnerId = "user-123";
      const result = recordTrip(trip, customOwnerId);

      expect(result).not.toBeNull();

      // Verify the trip was recorded with the custom owner
      const retrieved = getTripById(result!.id!);
      expect(retrieved?.ownerId).toBe(customOwnerId);
    });

    it("returns null when database is not initialized", () => {
      // Close the database to simulate uninitialized state
      db.close();

      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip);
      expect(result).toBeNull();
    });
  });

  describe("recordInferredTrip", () => {
    it("records an inferred trip from GTFS-RT data", () => {
      const params = {
        tripId: "GTFS-TRIP-123",
        routeId: "1",
        direction: "N" as const,
        originId: "101",
        destinationId: "725",
        departureTime: 1705310400,
        arrivalTime: 1705312800,
      };

      const result = recordInferredTrip(params);

      expect(result).not.toBeNull();
      expect(result?.source).toBe("inferred");
      expect(result?.line).toBe("1");
      expect(result?.origin.stationName).toBe("South Ferry");
      expect(result?.destination.stationName).toBe("Times Sq-42 St");
      expect(result?.actualDurationMinutes).toBe(40);
    });

    it("calculates duration correctly", () => {
      const params = {
        tripId: "GTFS-TRIP-456",
        routeId: "A",
        direction: "S" as const,
        originId: "726",
        destinationId: "725",
        departureTime: 1705310000,
        arrivalTime: 1705311200, // 20 minutes later
      };

      const result = recordInferredTrip(params);
      expect(result?.actualDurationMinutes).toBe(20);
    });

    it("returns null for unknown stations", () => {
      const params = {
        tripId: "GTFS-TRIP-789",
        routeId: "1",
        direction: "N" as const,
        originId: "999", // Unknown station
        destinationId: "725",
        departureTime: 1705310400,
        arrivalTime: 1705312800,
      };

      const result = recordInferredTrip(params);
      expect(result).toBeNull();
    });
  });

  describe("updateTripNotes", () => {
    it("updates trip notes with ownership check", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip, "user-123");
      const tripId = result!.id!;

      // Update with correct owner
      const updateResult = updateTripNotes(tripId, "Updated notes", "user-123");
      expect(updateResult).toBe(true);

      const updated = getTripById(tripId);
      expect(updated?.notes).toBe("Updated notes");
    });

    it("fails to update notes with wrong owner", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip, "user-123");
      const tripId = result!.id!;

      // Try to update with different owner
      const updateResult = updateTripNotes(tripId, "Hacked notes", "user-456");
      expect(updateResult).toBe(false);

      const updated = getTripById(tripId);
      expect(updated?.notes).toBeUndefined();
    });

    it("updates notes without ownership check when ownerId not provided", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip, "user-123");
      const tripId = result!.id!;

      // Update without ownership check (admin operation)
      const updateResult = updateTripNotes(tripId, "Admin notes");
      expect(updateResult).toBe(true);
    });
  });

  describe("deleteTrip", () => {
    it("deletes a trip with ownership check", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip, "user-123");
      const tripId = result!.id!;

      // Delete with correct owner
      const deleteResult = deleteTrip(tripId, "user-123");
      expect(deleteResult).toBe(true);

      const deleted = getTripById(tripId);
      expect(deleted).toBeNull();
    });

    it("fails to delete with wrong owner", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip, "user-123");
      const tripId = result!.id!;

      // Try to delete with different owner
      const deleteResult = deleteTrip(tripId, "user-456");
      expect(deleteResult).toBe(false);

      const stillExists = getTripById(tripId);
      expect(stillExists).not.toBeNull();
    });
  });

  describe("getTrips", () => {
    beforeEach(() => {
      // Create some test trips
      const trips = [
        {
          date: "2024-01-15",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: 1705310400000,
          arrivalTime: 1705312800000,
          actualDurationMinutes: 40,
          scheduledDurationMinutes: 35,
          source: "manual" as const,
        },
        {
          date: "2024-01-16",
          origin: { stationId: "725", stationName: "Times Sq-42 St" },
          destination: { stationId: "726", stationName: "42 St-Port Authority" },
          line: "A",
          departureTime: 1705396800000,
          arrivalTime: 1705398600000,
          actualDurationMinutes: 30,
          scheduledDurationMinutes: 25,
          source: "tracked" as const,
        },
        {
          date: "2024-01-17",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "726", stationName: "42 St-Port Authority" },
          line: "1",
          departureTime: 1705483200000,
          arrivalTime: 1705486800000,
          actualDurationMinutes: 60,
          source: "inferred" as const,
        },
      ];

      trips.forEach((trip) => recordTrip({ ...trip, ownerId: "user-123" }));
    });

    it("returns all trips with default pagination", () => {
      const trips = getTrips({});
      expect(trips).toHaveLength(3);
    });

    it("filters by owner ID", () => {
      // Record all initial trips with user-123 owner
      const trips = [
        {
          date: "2024-01-15",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: 1705310400000,
          arrivalTime: 1705312800000,
          actualDurationMinutes: 40,
          scheduledDurationMinutes: 35,
          source: "manual" as const,
        },
        {
          date: "2024-01-16",
          origin: { stationId: "725", stationName: "Times Sq-42 St" },
          destination: { stationId: "726", stationName: "42 St-Port Authority" },
          line: "A",
          departureTime: 1705396800000,
          arrivalTime: 1705398600000,
          actualDurationMinutes: 30,
          scheduledDurationMinutes: 25,
          source: "tracked" as const,
        },
        {
          date: "2024-01-17",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "726", stationName: "42 St-Port Authority" },
          line: "1",
          departureTime: 1705483200000,
          arrivalTime: 1705486800000,
          actualDurationMinutes: 60,
          source: "inferred" as const,
        },
      ];

      trips.forEach((trip) => recordTrip(trip, "user-123"));

      // Add a trip for a different owner
      recordTrip(
        {
          date: "2024-01-18",
          origin: { stationId: "726", stationName: "42 St-Port Authority" },
          destination: { stationId: "101", stationName: "South Ferry" },
          line: "A",
          departureTime: 1705569600000,
          arrivalTime: 1705573200000,
          actualDurationMinutes: 60,
          source: "manual" as const,
        },
        "user-456"
      );

      const user123Trips = getTrips({ ownerId: "user-123" });
      expect(user123Trips).toHaveLength(3);

      const user456Trips = getTrips({ ownerId: "user-456" });
      expect(user456Trips).toHaveLength(1);
    });

    it("filters by line", () => {
      const line1Trips = getTrips({ line: "1" });
      expect(line1Trips).toHaveLength(2);

      const lineATrips = getTrips({ line: "A" });
      expect(lineATrips).toHaveLength(1);
    });

    it("filters by date range", () => {
      const trips = getTrips({ startDate: "2024-01-16", endDate: "2024-01-16" });
      expect(trips).toHaveLength(1);
      expect(trips[0].line).toBe("A");
    });

    it("filters by source", () => {
      const manualTrips = getTrips({ source: "manual" as const });
      expect(manualTrips).toHaveLength(1);

      const inferredTrips = getTrips({ source: "inferred" as const });
      expect(inferredTrips).toHaveLength(1);
    });

    it("applies pagination", () => {
      const trips = getTrips({ limit: 2, offset: 0 });
      expect(trips).toHaveLength(2);

      const page2 = getTrips({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });
  });

  describe("getTripById", () => {
    it("returns a trip by ID", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip);
      const retrieved = getTripById(result!.id!);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.origin.stationName).toBe("South Ferry");
      expect(retrieved?.destination.stationName).toBe("Times Sq-42 St");
    });

    it("returns null for non-existent trip", () => {
      const retrieved = getTripById("non-existent-id");
      expect(retrieved).toBeNull();
    });
  });

  describe("checkTripOwnership", () => {
    it("returns true for correct owner", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip, "user-123");
      const isOwner = checkTripOwnership(result!.id!, "user-123");

      expect(isOwner).toBe(true);
    });

    it("returns false for wrong owner", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip, "user-123");
      const isOwner = checkTripOwnership(result!.id!, "user-456");

      expect(isOwner).toBe(false);
    });

    it("returns true for anonymous owner when checking with anonymous", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip); // Default owner is anonymous
      const isOwner = checkTripOwnership(result!.id!, DEFAULT_OWNER_ID);

      expect(isOwner).toBe(true);
    });
  });

  describe("getTripOwner", () => {
    it("returns the owner ID for a trip", () => {
      const trip = {
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      };

      const result = recordTrip(trip, "user-123");
      const ownerId = getTripOwner(result!.id!);

      expect(ownerId).toBe("user-123");
    });

    it("returns undefined for non-existent trip", () => {
      const ownerId = getTripOwner("non-existent-id");
      expect(ownerId).toBeUndefined();
    });
  });

  describe("calculateCommuteStats", () => {
    beforeEach(() => {
      const now = new Date();
      const today = now.toISOString().split("T")[0]!;

      // Create trips for the last week
      for (let i = 0; i < 10; i++) {
        const tripDate = new Date(now);
        tripDate.setDate(now.getDate() - i);
        const dateStr = tripDate.toISOString().split("T")[0]!;

        recordTrip({
          date: dateStr,
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: tripDate.getTime(),
          arrivalTime: tripDate.getTime() + 2400000, // 40 minutes
          actualDurationMinutes: 40,
          scheduledDurationMinutes: 35,
          source: "manual" as const,
        });
      }

      // Create some trips with delays
      for (let i = 0; i < 5; i++) {
        const tripDate = new Date(now);
        tripDate.setDate(now.getDate() - i - 10);
        const dateStr = tripDate.toISOString().split("T")[0]!;

        recordTrip({
          date: dateStr,
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: tripDate.getTime(),
          arrivalTime: tripDate.getTime() + 3000000, // 50 minutes
          actualDurationMinutes: 50,
          scheduledDurationMinutes: 35,
          source: "manual" as const,
        });
      }
    });

    it("calculates commute statistics", () => {
      const stats = calculateCommuteStats();

      expect(stats).not.toBeNull();
      expect(stats?.totalTrips).toBeGreaterThan(0);
      expect(stats?.averageDurationMinutes).toBeGreaterThan(0);
      expect(stats?.medianDurationMinutes).toBeGreaterThan(0);
      expect(stats?.stdDevMinutes).toBeGreaterThanOrEqual(0);
      expect(stats?.records).toBeDefined();
      expect(stats?.records.length).toBeGreaterThan(0);
    });

    it("calculates delay statistics", () => {
      const stats = calculateCommuteStats();

      expect(stats?.averageDelayMinutes).toBeGreaterThan(0);
      expect(stats?.maxDelayMinutes).toBeGreaterThan(0);
      expect(stats?.onTimePercentage).toBeGreaterThanOrEqual(0);
      expect(stats?.onTimePercentage).toBeLessThanOrEqual(100);
    });

    it("calculates weekly trip count", () => {
      const stats = calculateCommuteStats();

      expect(stats?.tripsThisWeek).toBeGreaterThan(0);
      expect(stats?.tripsThisWeek).toBeLessThanOrEqual(stats?.totalTrips ?? 0);
    });

    it("calculates trend", () => {
      const stats = calculateCommuteStats();

      expect(stats?.trend).toBeDefined();
      expect(typeof stats?.trend).toBe("number");
    });

    it("returns empty stats when no trips exist", () => {
      // Close and recreate database
      db.close();
      const emptyDb = new Database(":memory:");
      emptyDb.exec(`
        CREATE TABLE trips (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          origin_station_id TEXT NOT NULL,
          origin_station_name TEXT NOT NULL,
          destination_station_id TEXT NOT NULL,
          destination_station_name TEXT NOT NULL,
          line TEXT NOT NULL,
          direction TEXT NOT NULL DEFAULT 'N',
          departure_time INTEGER NOT NULL,
          arrival_time INTEGER NOT NULL,
          actual_duration_minutes INTEGER NOT NULL,
          scheduled_duration_minutes INTEGER,
          source TEXT NOT NULL,
          notes TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          owner_id TEXT NOT NULL DEFAULT 'anonymous'
        );

        CREATE TABLE commute_stats (
          commute_id TEXT PRIMARY KEY,
          average_duration_minutes REAL,
          median_duration_minutes REAL,
          std_dev_minutes REAL,
          total_trips INTEGER,
          trips_this_week INTEGER,
          trend REAL,
          average_delay_minutes REAL,
          max_delay_minutes REAL,
          on_time_percentage REAL,
          last_updated INTEGER
        );
      `);

      initTripTracking(emptyDb, mockStations);

      const stats = calculateCommuteStats();

      expect(stats).not.toBeNull();
      expect(stats?.totalTrips).toBe(0);
      expect(stats?.averageDurationMinutes).toBe(0);
      expect(stats?.records).toEqual([]);

      emptyDb.close();
    });

    it("filters stats by owner ID", () => {
      // Add a trip for a different owner
      recordTrip(
        {
          date: new Date().toISOString().split("T")[0]!,
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: Date.now(),
          arrivalTime: Date.now() + 2400000,
          actualDurationMinutes: 40,
          source: "manual" as const,
        },
        "user-456"
      );

      const allStats = calculateCommuteStats();
      const user123Stats = calculateCommuteStats("default", "user-123");

      expect(allStats?.totalTrips).toBeGreaterThan(user123Stats?.totalTrips ?? 0);
    });
  });

  describe("getTripCountForDate", () => {
    it("returns trip count for a specific date", () => {
      const date = "2024-01-15";

      recordTrip({
        date,
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      });

      recordTrip({
        date,
        origin: { stationId: "725", stationName: "Times Sq-42 St" },
        destination: { stationId: "726", stationName: "42 St-Port Authority" },
        line: "A",
        departureTime: 1705316800000,
        arrivalTime: 1705318800000,
        actualDurationMinutes: 30,
        source: "manual" as const,
      });

      const count = getTripCountForDate(date);
      expect(count).toBe(2);
    });

    it("returns 0 for date with no trips", () => {
      const count = getTripCountForDate("2024-12-25");
      expect(count).toBe(0);
    });
  });

  describe("getTotalTripCount", () => {
    it("returns total trip count", () => {
      const initialCount = getTotalTripCount();

      recordTrip({
        date: "2024-01-15",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: 1705310400000,
        arrivalTime: 1705312800000,
        actualDurationMinutes: 40,
        source: "manual" as const,
      });

      expect(getTotalTripCount()).toBe(initialCount + 1);
    });
  });

  describe("cleanupOldTrips", () => {
    it("does not delete when under threshold", () => {
      // Create a few recent trips
      for (let i = 0; i < 10; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0]!;

        recordTrip({
          date: dateStr,
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: date.getTime(),
          arrivalTime: date.getTime() + 2400000,
          actualDurationMinutes: 40,
          source: "manual" as const,
        });
      }

      const deleted = cleanupOldTrips();
      expect(deleted).toBe(0);
      expect(getTotalTripCount()).toBe(10);
    });

    it("deletes old trips when over threshold", () => {
      // Create many old trips (over 90 days ago)
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100);
      const oldDateStr = oldDate.toISOString().split("T")[0]!;
      const oldTime = oldDate.getTime();

      for (let i = 0; i < 600; i++) {
        const tripTime = oldTime + i * 3600000; // 1 hour apart
        recordTrip({
          date: oldDateStr,
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: tripTime,
          arrivalTime: tripTime + 2400000,
          actualDurationMinutes: 40,
          source: "manual" as const,
        });
      }

      const beforeCleanup = getTotalTripCount();
      expect(beforeCleanup).toBeGreaterThan(500);

      const deleted = cleanupOldTrips();
      expect(deleted).toBeGreaterThan(0);
      expect(getTotalTripCount()).toBeLessThanOrEqual(500);
    });
  });
});
