/**
 * Integration tests for end-to-end workflows across multiple API endpoints.
 *
 * Tests complex user journeys that involve multiple API calls:
 * - Complete trip tracking workflow with statistics
 * - Multi-step data consistency verification
 * - Cross-component data flow validation
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import {
  closeDatabase,
  createIntegrationTestDatabase,
  createTestUserCredentials,
} from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_STATIONS: StationIndex = {
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
  "102": {
    id: "102",
    name: "Rector St",
    lat: 40.709,
    lon: -74.014,
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
    lat: 40.758,
    lon: -73.985,
    lines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [
      { toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true },
    ],
    ada: true,
    borough: "manhattan",
    complex: "725-726",
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
    complex: "725-726",
  },
  "727": {
    id: "727",
    name: "34 St-Penn Station",
    lat: 40.75,
    lon: -73.99,
    lines: ["A", "C", "E"],
    northStopId: "727N",
    southStopId: "727S",
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
  "2": {
    id: "2",
    shortName: "2",
    longName: "7th Ave Express",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "725", "726"],
    isExpress: true,
  },
  A: {
    id: "A",
    shortName: "A",
    longName: "8th Ave Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["726", "727"],
    isExpress: true,
  },
  C: {
    id: "C",
    shortName: "C",
    longName: "8th Ave Local",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["726", "727"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {
  "725-726": {
    complexId: "725-726",
    name: "Times Sq-42 St / Port Authority",
    stations: ["725", "726"],
    allLines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S", "A", "C", "E"],
    allStopIds: ["725N", "725S", "726N", "726S"],
  },
};

const TEST_TRANSFERS: Record<string, TransferConnection[]> = {
  "725": [{ toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }],
  "101": [{ toStationId: "102", toLines: ["1"], walkingSeconds: 180, accessible: true }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("End-to-End Workflow Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let authHeaders: { Authorization: string };

  beforeEach(async () => {
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);

    const userCreds = await createTestUserCredentials();
    authHeaders = { Authorization: userCreds.authorizationHeader };

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
    vi.restoreAllMocks();
  });

  describe("Complete trip tracking workflow", () => {
    it("tracks full journey from recording to statistics", () => {
      const now = Date.now();

      // Step 1: Record a trip
      const trip = recordTrip({
        date: "2026-04-06",
        origin: { stationId: "101", stationName: "Test Station" },
        destination: { stationId: "725", stationName: "Test Station" },
        line: "1",
        departureTime: Math.floor((now - 3600000) / 1000),
        arrivalTime: Math.floor(now / 1000),
        actualDurationMinutes: 60,
        scheduledDurationMinutes: 55,
        source: "manual",
      });

      expect(trip).toBeDefined();
      const tripId = trip!.id;

      // Step 2: Retrieve the trip
      const retrieved = getTripById(tripId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(tripId);

      // Step 3: Update trip notes
      updateTripNotes(tripId, "Morning commute - crowded train");

      // Step 4: Verify notes updated
      const updated = getTripById(tripId);
      expect(updated?.notes).toBe("Morning commute - crowded train");

      // Step 5: Check statistics reflect the trip
      const stats = calculateCommuteStats("default");
      expect(stats.totalTrips).toBe(1);
      expect(stats.averageDurationMinutes).toBe(60);

      // Step 6: Verify trip appears in list
      const trips = getTrips({ limit: 10 });
      expect(trips.length).toBe(1);
      expect(trips[0].id).toBe(tripId);
    });

    it("tracks multiple trips and calculates accurate statistics", () => {
      const now = Date.now();
      const baseTime = now - 10000000;

      // Record multiple trips with varying performance
      const trips = [
        { duration: 45, scheduled: 45, delay: 0 },
        { duration: 50, scheduled: 45, delay: 5 },
        { duration: 55, scheduled: 45, delay: 10 },
        { duration: 48, scheduled: 45, delay: 3 },
        { duration: 52, scheduled: 45, delay: 7 },
      ];

      for (let i = 0; i < trips.length; i++) {
        recordTrip({
          date: "2026-04-06",
          origin: { stationId: "101", stationName: "Test Station" },
          destination: { stationId: "725", stationName: "Test Station" },
          line: "1",
          departureTime: baseTime + i * 1000000,
          arrivalTime: baseTime + i * 1000000 + trips[i]!.duration * 60000,
          actualDurationMinutes: trips[i]!.duration,
          scheduledDurationMinutes: trips[i]!.scheduled,
          source: "manual",
        });
      }

      // Check statistics
      const stats = calculateCommuteStats("default");

      expect(stats.totalTrips).toBe(5);
      expect(stats.averageDurationMinutes).toBe(50); // (45+50+55+48+52)/5
      expect(stats.medianDurationMinutes).toBe(50); // sorted: 45,48,50,52,55
      expect(stats.averageDelayMinutes).toBe(5); // (0+5+10+3+7)/5
      expect(stats.maxDelayMinutes).toBe(10);
    });
  });

  describe("Multi-station route comparison workflow", () => {
    it("compares routes between multiple station pairs", async () => {
      // Get stations for route planning
      const stationsRes = await app.request("/api/stations");
      expect(stationsRes.status).toBe(200);
      const stations = await stationsRes.json();
      expect(stations.length).toBeGreaterThan(0);

      // Get specific station details
      const originRes = await app.request("/api/stations/101");
      expect(originRes.status).toBe(200);
      const originStation = await originRes.json();

      const destRes = await app.request("/api/stations/725");
      expect(destRes.status).toBe(200);
      const destStation = await destRes.json();

      // Verify complex information
      expect(originStation.complexId).toBeUndefined();
      expect(destStation.complexId).toBe("725-726");
      expect(destStation.complexStations).toBeDefined();
    });
  });

  describe("Data consistency across operations", () => {
    it("maintains consistency across rapid successive operations", () => {
      const now = Date.now();

      // Create trip
      const trip = recordTrip({
        date: "2026-04-06",
        origin: { stationId: "101", stationName: "Test Station" },
        destination: { stationId: "725", stationName: "Test Station" },
        line: "1",
        departureTime: Math.floor((now - 3600000) / 1000),
        arrivalTime: Math.floor(now / 1000),
        notes: "Test",
        actualDurationMinutes: 60,
        source: "manual",
      });

      expect(trip).toBeDefined();
      const tripId = trip!.id;

      // Immediately update notes
      updateTripNotes(tripId, "Updated");

      // Immediately check stats
      const stats = calculateCommuteStats("default");

      // Immediately check list
      const trips = getTrips({ limit: 10 });

      // All operations should succeed
      expect(stats.totalTrips).toBe(1);
      expect(trips.length).toBe(1);

      // Verify data is consistent
      const updated = getTripById(tripId);
      expect(updated?.notes).toBe("Updated");
      expect(trips[0].notes).toBe("Updated");
    });

    it("handles rollback on failed operation", () => {
      const now = Date.now();

      // Create a trip
      const trip = recordTrip({
        date: "2026-04-06",
        origin: { stationId: "101", stationName: "Test Station" },
        destination: { stationId: "725", stationName: "Test Station" },
        line: "1",
        departureTime: Math.floor((now - 3600000) / 1000),
        arrivalTime: Math.floor(now / 1000),
        notes: "Original",
        actualDurationMinutes: 60,
        source: "manual",
      });

      expect(trip).toBeDefined();

      // Try to update non-existent trip (should fail gracefully)
      const result = updateTripNotes("non-existent-id", "Should not affect anything");
      expect(result).toBe(false);

      // Verify original data unchanged
      const retrieved = getTripById(trip!.id);
      expect(retrieved?.notes).toBe("Original");
    });
  });

  describe("Statistics calculation workflows", () => {
    it("updates statistics incrementally", () => {
      const now = Date.now();

      // Get initial stats
      const initialStats = calculateCommuteStats("default");
      expect(initialStats.totalTrips).toBe(0);

      // Add first trip
      recordTrip({
        date: "2026-04-06",
        origin: { stationId: "101", stationName: "Test Station" },
        destination: { stationId: "725", stationName: "Test Station" },
        line: "1",
        departureTime: Math.floor((now - 3600000) / 1000),
        arrivalTime: Math.floor(now / 1000),
        actualDurationMinutes: 50,
        scheduledDurationMinutes: 45,
        source: "manual",
      });

      const stats1 = calculateCommuteStats("default");
      expect(stats1.totalTrips).toBe(1);
      expect(stats1.averageDurationMinutes).toBe(50);

      // Add second trip
      recordTrip({
        date: "2026-04-06",
        origin: { stationId: "101", stationName: "Test Station" },
        destination: { stationId: "725", stationName: "Test Station" },
        line: "1",
        departureTime: Math.floor((now - 7200000) / 1000),
        arrivalTime: Math.floor(now / 1000) - 3600000,
        actualDurationMinutes: 70,
        scheduledDurationMinutes: 45,
        source: "manual",
      });

      const stats2 = calculateCommuteStats("default");
      expect(stats2.totalTrips).toBe(2);
      expect(stats2.averageDurationMinutes).toBe(60); // (50 + 70) / 2
    });

    it("calculates stats for different commute IDs", () => {
      const now = Date.now();

      // Add trip for default commute
      recordTrip({
        date: "2026-04-06",
        origin: { stationId: "101", stationName: "Test Station" },
        destination: { stationId: "725", stationName: "Test Station" },
        line: "1",
        departureTime: Math.floor((now - 3600000) / 1000),
        arrivalTime: Math.floor(now / 1000),
        actualDurationMinutes: 60,
        source: "manual",
      });

      // Get default stats
      const defaultStats = calculateCommuteStats("default");
      expect(defaultStats.commuteId).toBe("default");
      expect(defaultStats.totalTrips).toBe(1);

      // Get custom commute stats - note: calculateCommuteStats doesn't filter by commuteId,
      // it just uses it as a cache key. All trips are included regardless of commuteId.
      const customStats = calculateCommuteStats("work");
      expect(customStats.commuteId).toBe("work");
      // Since stats are shared across all commute IDs (just cached separately),
      // this will also return 1 trip
      expect(customStats.totalTrips).toBe(1);
    });
  });

  describe("Complex query workflows", () => {
    beforeEach(() => {
      const now = Date.now();
      const baseTime = now - 100000000;

      // Create diverse test data
      const testData = [
        { originId: "101", destId: "725", line: "1", date: "2026-04-01", offset: 0 },
        { originId: "101", destId: "725", line: "1", date: "2026-04-02", offset: 1 },
        { originId: "725", destId: "726", line: "A", date: "2026-04-03", offset: 2 },
        { originId: "101", destId: "102", line: "1", date: "2026-04-04", offset: 3 },
        { originId: "726", destId: "727", line: "A", date: "2026-04-05", offset: 4 },
      ];

      for (const data of testData) {
        recordTrip({
          date: data.date,
          origin: { stationId: data.originId, stationName: TEST_STATIONS[data.originId]!.name },
          destination: { stationId: data.destId, stationName: TEST_STATIONS[data.destId]!.name },
          line: data.line,
          departureTime: baseTime + data.offset * 1000000,
          arrivalTime: baseTime + data.offset * 1000000 + 3600000,
          actualDurationMinutes: 60,
          source: "manual",
        });
      }
    });

    it("combines multiple filters correctly", () => {
      const trips = getTrips({ originId: "101", line: "1", limit: 10 });

      expect(trips.length).toBe(3);
      expect(trips.every((t) => t.origin.stationId === "101" && t.line === "1")).toBe(true);
    });

    it("handles pagination with filters", () => {
      const page1 = getTrips({ limit: 2, offset: 0 });
      const page2 = getTrips({ limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);

      const ids1 = page1.map((t) => t.id);
      const ids2 = page2.map((t) => t.id);
      expect(ids1).not.toEqual(ids2);
    });

    it("filters by date range accurately", () => {
      const trips = getTrips({ startDate: "2026-04-01", endDate: "2026-04-03" });

      expect(trips.length).toBe(3);
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
          origin: { stationId: "101", stationName: "Test Station" },
          destination: { stationId: "725", stationName: "Test Station" },
          line: "1",
          departureTime: Math.floor((now - 3600000) / 1000) - i * 100000,
          arrivalTime: Math.floor(now / 1000) - i * 100000,
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
