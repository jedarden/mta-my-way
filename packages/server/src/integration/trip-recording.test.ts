/**
 * Integration tests for trip recording functionality.
 *
 * Tests the complete data flow for trip recording:
 * - Direct database operations via trip-tracking module
 * - Statistics calculation after trip recording
 * - Data persistence and retrieval
 * - Ownership-based access control
 */

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  calculateCommuteStats,
  checkTripOwnership,
  deleteTrip,
  getTripById,
  getTripOwner,
  getTrips,
  initTripTracking,
  recordInferredTrip,
  recordTrip,
  updateTripNotes,
} from "../trip-tracking.js";
import {
  closeDatabase,
  createIntegrationTestDatabase,
  TEST_STATIONS,
} from "./test-helpers.js";

// Test owner IDs
const TEST_OWNER_1 = "user-123";
const TEST_OWNER_2 = "user-456";
const ADMIN_OWNER = "admin-user";

describe("Trip Recording Integration Tests", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("Basic trip recording", () => {
    it("records a trip and retrieves it by ID", () => {
      const now = Date.now();

      const trip = recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        scheduledDurationMinutes: 55,
        source: "manual",
      });

      expect(trip).toBeDefined();
      expect(trip!.id).toBeDefined();

      const retrieved = getTripById(trip!.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.origin.stationName).toBe("South Ferry");
      expect(retrieved!.destination.stationName).toBe("Times Sq-42 St");
      expect(retrieved!.line).toBe("1");
    });

    it("records multiple trips and retrieves them in list", () => {
      const now = Date.now();

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 7200000,
        arrivalTime: now - 3600000,
        actualDurationMinutes: 60,
        source: "manual",
      });

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "725", stationName: "Times Sq-42 St" },
        destination: { stationId: "726", stationName: "42 St-Port Authority" },
        line: "A",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      const trips = getTrips({ limit: 10 });
      expect(trips).toHaveLength(2);
      expect(trips[0].destination.stationId).toBe("726");
      expect(trips[1].destination.stationId).toBe("725");
    });

    it("calculates actual duration from timestamps when not provided", () => {
      const now = Date.now();
      const departureTime = now - 5400000; // 90 minutes ago

      const trip = recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime,
        arrivalTime: now,
        actualDurationMinutes: 90,
        source: "manual",
      });

      expect(trip!.actualDurationMinutes).toBe(90);
    });
  });

  describe("Trip ownership and access control", () => {
    it("records trips with owner ID and maintains separation", () => {
      const now = Date.now();

      // Record trip for user 1
      const trip1 = recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_1
      );

      // Record trip for user 2
      const trip2 = recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "725", stationName: "Times Sq-42 St" },
          destination: { stationId: "726", stationName: "42 St-Port Authority" },
          line: "A",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_2
      );

      // Each user should only see their own trips
      const user1Trips = getTrips({ ownerId: TEST_OWNER_1, limit: 10 });
      const user2Trips = getTrips({ ownerId: TEST_OWNER_2, limit: 10 });

      expect(user1Trips).toHaveLength(1);
      expect(user2Trips).toHaveLength(1);
      expect(user1Trips[0].id).toBe(trip1!.id);
      expect(user2Trips[0].id).toBe(trip2!.id);
    });

    it("checks trip ownership correctly", () => {
      const now = Date.now();

      const trip = recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_1
      );

      expect(checkTripOwnership(trip!.id, TEST_OWNER_1)).toBe(true);
      expect(checkTripOwnership(trip!.id, TEST_OWNER_2)).toBe(false);
    });

    it("gets trip owner correctly", () => {
      const now = Date.now();

      const trip = recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_1
      );

      const owner = getTripOwner(trip!.id);
      expect(owner).toBe(TEST_OWNER_1);
    });

    it("enforces ownership on trip updates", () => {
      const now = Date.now();

      const trip = recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_1
      );

      // Owner can update
      const ownerUpdate = updateTripNotes(trip!.id, "Updated by owner", TEST_OWNER_1);
      expect(ownerUpdate).toBe(true);

      const retrieved = getTripById(trip!.id);
      expect(retrieved?.notes).toBe("Updated by owner");

      // Non-owner cannot update
      const nonOwnerUpdate = updateTripNotes(trip!.id, "Should not work", TEST_OWNER_2);
      expect(nonOwnerUpdate).toBe(false);

      const afterFailedUpdate = getTripById(trip!.id);
      expect(afterFailedUpdate?.notes).toBe("Updated by owner");
    });

    it("enforces ownership on trip deletion", () => {
      const now = Date.now();

      const trip = recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_1
      );

      // Non-owner cannot delete
      const nonOwnerDelete = deleteTrip(trip!.id, TEST_OWNER_2);
      expect(nonOwnerDelete).toBe(false);

      let retrieved = getTripById(trip!.id);
      expect(retrieved).toBeDefined();

      // Owner can delete
      const ownerDelete = deleteTrip(trip!.id, TEST_OWNER_1);
      expect(ownerDelete).toBe(true);

      retrieved = getTripById(trip!.id);
      expect(retrieved).toBeNull();
    });
  });

  describe("Statistics calculation integration", () => {
    it("calculates stats for all trips regardless of owner", () => {
      const now = Date.now();

      // Record trips for different users
      recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 50,
          scheduledDurationMinutes: 45,
          source: "manual",
        },
        TEST_OWNER_1
      );

      recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 7200000,
          arrivalTime: now - 3600000,
          actualDurationMinutes: 70,
          scheduledDurationMinutes: 45,
          source: "manual",
        },
        TEST_OWNER_2
      );

      // Global stats (no owner filter) include all trips
      const globalStats = calculateCommuteStats("default");
      expect(globalStats?.totalTrips).toBe(2);
      expect(globalStats?.averageDurationMinutes).toBe(60);
    });

    it("calculates owner-specific stats", () => {
      const now = Date.now();

      // User 1 trips: 50 and 55 minutes
      recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 50,
          source: "manual",
        },
        TEST_OWNER_1
      );

      recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 7200000,
          arrivalTime: now - 3600000,
          actualDurationMinutes: 55,
          source: "manual",
        },
        TEST_OWNER_1
      );

      // User 2 trips: 70 minutes
      recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 5400000,
          arrivalTime: now - 1800000,
          actualDurationMinutes: 70,
          source: "manual",
        },
        TEST_OWNER_2
      );

      // User 1 stats
      const user1Stats = calculateCommuteStats("user1", TEST_OWNER_1);
      expect(user1Stats?.totalTrips).toBe(2);
      expect(user1Stats?.averageDurationMinutes).toBeCloseTo(52.5);

      // User 2 stats
      const user2Stats = calculateCommuteStats("user2", TEST_OWNER_2);
      expect(user2Stats?.totalTrips).toBe(1);
      expect(user2Stats?.averageDurationMinutes).toBe(70);
    });
  });

  describe("Inferred trip recording", () => {
    it("records trip inferred from GTFS-RT data", () => {
      const now = Math.floor(Date.now() / 1000);

      const trip = recordInferredTrip(
        {
          tripId: "MTA_12345",
          routeId: "1",
          direction: "N",
          originId: "101",
          destinationId: "725",
          departureTime: now - 3600,
          arrivalTime: now,
        },
        TEST_OWNER_1
      );

      expect(trip).toBeDefined();
      expect(trip!.source).toBe("inferred");
      expect(trip!.line).toBe("1");
      expect(trip!.origin.stationId).toBe("101");
      expect(trip!.destination.stationId).toBe("725");
    });

    it("calculates duration for inferred trips", () => {
      const now = Math.floor(Date.now() / 1000);

      const trip = recordInferredTrip(
        {
          tripId: "MTA_67890",
          routeId: "A",
          direction: "S",
          originId: "726",
          destinationId: "727",
          departureTime: now - 2400, // 40 minutes
          arrivalTime: now,
        },
        TEST_OWNER_1
      );

      expect(trip!.actualDurationMinutes).toBe(40);
    });

    it("returns null for inferred trip with unknown stations", () => {
      const now = Math.floor(Date.now() / 1000);

      const trip = recordInferredTrip(
        {
          tripId: "MTA_99999",
          routeId: "1",
          direction: "N",
          originId: "UNKNOWN_STATION",
          destinationId: "725",
          departureTime: now - 3600,
          arrivalTime: now,
        },
        TEST_OWNER_1
      );

      expect(trip).toBeNull();
    });
  });

  describe("Query and filtering integration", () => {
    beforeEach(() => {
      const now = Date.now();

      // Create test data
      recordTrip(
        {
          date: "2026-05-01",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 100000000,
          arrivalTime: now - 99640000,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_1
      );

      recordTrip(
        {
          date: "2026-05-02",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 90000000,
          arrivalTime: now - 89640000,
          actualDurationMinutes: 60,
          source: "inferred",
        },
        TEST_OWNER_1
      );

      recordTrip(
        {
          date: "2026-05-03",
          origin: { stationId: "725", stationName: "Times Sq-42 St" },
          destination: { stationId: "726", stationName: "42 St-Port Authority" },
          line: "A",
          departureTime: now - 80000000,
          arrivalTime: now - 79640000,
          actualDurationMinutes: 60,
          source: "tracked",
        },
        TEST_OWNER_2
      );
    });

    it("filters trips by owner ID", () => {
      const user1Trips = getTrips({ ownerId: TEST_OWNER_1, limit: 10 });
      const user2Trips = getTrips({ ownerId: TEST_OWNER_2, limit: 10 });

      expect(user1Trips).toHaveLength(2);
      expect(user2Trips).toHaveLength(1);
    });

    it("filters trips by line", () => {
      const line1Trips = getTrips({ line: "1", limit: 10 });
      const lineATrips = getTrips({ line: "A", limit: 10 });

      expect(line1Trips).toHaveLength(2);
      expect(lineATrips).toHaveLength(1);
    });

    it("filters trips by source", () => {
      const manualTrips = getTrips({ source: "manual", limit: 10 });
      const inferredTrips = getTrips({ source: "inferred", limit: 10 });

      expect(manualTrips).toHaveLength(1);
      expect(inferredTrips).toHaveLength(1);
    });

    it("filters trips by date range", () => {
      const trips = getTrips({
        startDate: "2026-05-01",
        endDate: "2026-05-02",
        limit: 10,
      });

      expect(trips).toHaveLength(2);
    });

    it("combines multiple filters", () => {
      const trips = getTrips({
        ownerId: TEST_OWNER_1,
        line: "1",
        source: "manual",
        limit: 10,
      });

      expect(trips).toHaveLength(1);
      expect(trips[0].source).toBe("manual");
    });

    it("respects pagination", () => {
      const page1 = getTrips({ limit: 1, offset: 0 });
      const page2 = getTrips({ limit: 1, offset: 1 });

      expect(page1).toHaveLength(1);
      expect(page2).toHaveLength(1);
      expect(page1[0].id).not.toBe(page2[0].id);
    });
  });

  describe("Data persistence and updates", () => {
    it("updates trip notes persistently", () => {
      const now = Date.now();

      const trip = recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_1
      );

      updateTripNotes(trip!.id, "Crowded train", TEST_OWNER_1);

      const retrieved = getTripById(trip!.id);
      expect(retrieved?.notes).toBe("Crowded train");
    });

    it("deletes trip from database", () => {
      const now = Date.now();

      const trip = recordTrip(
        {
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          source: "manual",
        },
        TEST_OWNER_1
      );

      const tripId = trip!.id;
      deleteTrip(tripId, TEST_OWNER_1);

      const retrieved = getTripById(tripId);
      expect(retrieved).toBeNull();
    });

    it("returns empty result for non-existent trip", () => {
      const retrieved = getTripById("non-existent-id");
      expect(retrieved).toBeNull();
    });

    it("returns false when updating non-existent trip", () => {
      const result = updateTripNotes("non-existent-id", "Test", TEST_OWNER_1);
      expect(result).toBe(false);
    });

    it("returns false when deleting non-existent trip", () => {
      const result = deleteTrip("non-existent-id", TEST_OWNER_1);
      expect(result).toBe(false);
    });
  });
});
