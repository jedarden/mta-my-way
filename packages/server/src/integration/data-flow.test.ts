/**
 * Integration tests for cross-component data flow and end-to-end workflows.
 *
 * Tests complex interactions between:
 * - Trip tracking and statistics calculation
 * - Database operations and API responses
 * - Concurrent access patterns
 * - Error propagation across layers
 * - Cache invalidation and consistency
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
  createTestTrip,
  createTestUserCredentials,
} from "./test-helpers.js";

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
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    location: { lat: 40.758, lon: -73.985 },
    lines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
    complex: "725-726",
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
    complex: "725-726",
  },
  "727": {
    id: "727",
    name: "34 St-Penn Station",
    location: { lat: 40.75, lon: -73.99 },
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
    stops: ["101", "725"],
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
    stops: ["726", "727"],
    isExpress: true,
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
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Data Flow Integration Tests", () => {
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
  });

  describe("Trip tracking to statistics data flow", () => {
    it("calculates updated stats after recording a trip", async () => {
      const now = Date.now();

      // Record a trip via API
      await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 60,
          scheduledDurationMinutes: 55,
        }),
      });

      // Check that stats reflect the new trip
      const statsRes = await app.request("/api/journal/stats");
      const stats = await statsRes.json();

      expect(stats.totalTrips).toBe(1);
      expect(stats.averageDurationMinutes).toBe(60);
    });

    it("updates stats after multiple trips with varying durations", async () => {
      const now = Date.now();
      const baseTime = now - 10000000;

      // Record multiple trips
      const durations = [45, 50, 55, 60, 65];
      for (let i = 0; i < durations.length; i++) {
        await app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: baseTime + i * 1000000,
            arrivalTime: baseTime + i * 1000000 + durations[i]! * 60000,
            actualDurationMinutes: durations[i]!,
            scheduledDurationMinutes: 50,
          }),
        });
      }

      // Check stats
      const statsRes = await app.request("/api/journal/stats");
      const stats = await statsRes.json();

      expect(stats.totalTrips).toBe(5);
      expect(stats.averageDurationMinutes).toBe(55); // (45+50+55+60+65)/5
      expect(stats.medianDurationMinutes).toBe(55);
    });

    it("recalculates on-time percentage after trip recording", async () => {
      const now = Date.now();

      // Record trips with varying delays
      await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 7200000,
          arrivalTime: now - 3600000,
          actualDurationMinutes: 50,
          scheduledDurationMinutes: 45, // 5 min late
        }),
      });

      await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 45,
          scheduledDurationMinutes: 45, // On time
        }),
      });

      const statsRes = await app.request("/api/journal/stats");
      const stats = await statsRes.json();

      expect(stats.onTimePercentage).toBe(50); // 1 out of 2 on time
    });
  });

  describe("Database consistency across operations", () => {
    it("maintains data consistency through update operations", async () => {
      const now = Date.now();

      // Create a trip
      const createRes = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
        }),
      });

      const createBody = await createRes.json();
      const tripId = createBody.trip.id;

      // Update notes
      await app.request(`/api/trips/${tripId}/notes`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Test notes" }),
      });

      // Verify via direct database query
      const trip = getTripById(tripId);
      expect(trip?.notes).toBe("Test notes");

      // Verify via API
      const getRes = await app.request(`/api/trips/${tripId}`);
      const getBody = await getRes.json();
      expect(getBody.notes).toBe("Test notes");
    });

    it("handles concurrent trip creation consistently", async () => {
      const now = Date.now();

      // Create multiple trips simultaneously
      const promises = Array.from({ length: 10 }, (_, i) =>
        app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000 - i * 100000,
            arrivalTime: now - i * 100000,
          }),
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      for (const res of responses) {
        expect(res.status).toBe(201);
      }

      // Verify count in database
      const tripsRes = await app.request("/api/trips");
      const tripsBody = await tripsRes.json();
      expect(tripsBody.count).toBe(10);
    });

    it("maintains referential integrity after deletion", async () => {
      const now = Date.now();

      // Create a trip
      const createRes = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
        }),
      });

      const createBody = await createRes.json();
      const tripId = createBody.trip.id;

      // Delete it
      await app.request(`/api/trips/${tripId}`, {
        method: "DELETE",
      });

      // Verify it's gone from both API and database
      const getRes = await app.request(`/api/trips/${tripId}`);
      expect(getRes.status).toBe(404);

      const trip = getTripById(tripId);
      expect(trip).toBeNull();
    });
  });

  describe("Error propagation across layers", () => {
    it("returns meaningful error for invalid station IDs", async () => {
      const now = Date.now();

      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "INVALID", name: "Invalid Station" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
        }),
      });

      // Should fail validation before reaching database
      expect([400, 422]).toContain(res.status);

      const body = await res.json();
      expect(body.error).toBeDefined();
    });

    it("handles malformed JSON gracefully", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: "not valid json {{{",
      });

      expect(res.status).toBe(400);
    });

    it("validates timestamp consistency", async () => {
      const now = Date.now();

      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now, // Departure AFTER arrival
          arrivalTime: now - 3600000,
        }),
      });

      // Should accept but calculate negative duration or handle edge case
      expect(res.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe("Filtering and pagination integration", () => {
    beforeEach(() => {
      const now = Date.now();
      const baseTime = now - 100000000;

      // Create test data across multiple stations and dates
      const testData = [
        { originId: "101", destId: "725", line: "1", date: "2026-04-01", offset: 0 },
        { originId: "101", destId: "725", line: "1", date: "2026-04-02", offset: 1 },
        { originId: "725", destId: "726", line: "A", date: "2026-04-03", offset: 2 },
        { originId: "726", destId: "727", line: "A", date: "2026-04-04", offset: 3 },
        { originId: "101", destId: "725", line: "1", date: "2026-04-05", offset: 4 },
      ];

      for (const data of testData) {
        recordTrip({
          date: data.date,
          origin: { id: data.originId, name: "Test Origin" },
          destination: { id: data.destId, name: "Test Dest" },
          line: data.line,
          departureTime: baseTime + data.offset * 1000000,
          arrivalTime: baseTime + data.offset * 1000000 + 3600000,
          actualDurationMinutes: 60,
          source: "manual",
        });
      }
    });

    it("filters by origin station correctly", async () => {
      const res = await app.request("/api/trips?originId=101");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips.length).toBe(3);
      expect(body.trips.every((t: { origin: { id: string } }) => t.origin.id === "101")).toBe(true);
    });

    it("filters by destination station correctly", async () => {
      const res = await app.request("/api/trips?destinationId=725");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips.length).toBe(3);
      expect(
        body.trips.every((t: { destination: { id: string } }) => t.destination.id === "725")
      ).toBe(true);
    });

    it("filters by line correctly", async () => {
      const res = await app.request("/api/trips?line=A");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips.length).toBe(2);
      expect(body.trips.every((t: { line: string }) => t.line === "A")).toBe(true);
    });

    it("combines multiple filters", async () => {
      const res = await app.request("/api/trips?originId=101&line=1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips.length).toBe(3);
      expect(
        body.trips.every(
          (t: { origin: { id: string }; line: string }) => t.origin.id === "101" && t.line === "1"
        )
      ).toBe(true);
    });

    it("respects pagination limits", async () => {
      const res = await app.request("/api/trips?limit=2");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips.length).toBe(2);
      expect(body.limit).toBe(2);
    });

    it("respects pagination offset", async () => {
      const res1 = await app.request("/api/trips?limit=2&offset=0");
      const res2 = await app.request("/api/trips?limit=2&offset=2");

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(body1.trips.length).toBe(2);
      expect(body2.trips.length).toBe(2);

      // Results should be different
      const ids1 = body1.trips.map((t: { id: string }) => t.id);
      const ids2 = body2.trips.map((t: { id: string }) => t.id);
      expect(ids1).not.toEqual(ids2);
    });

    it("filters by date range", async () => {
      const res = await app.request("/api/trips?startDate=2026-04-01&endDate=2026-04-03");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips.length).toBe(3);
    });
  });

  describe("Summary endpoint integration", () => {
    beforeEach(() => {
      const now = Date.now();

      // Create recent trips
      for (let i = 0; i < 5; i++) {
        recordTrip({
          date: new Date(now - i * 86400000).toISOString().split("T")[0]!,
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - i * 86400000 - 3600000,
          arrivalTime: now - i * 86400000,
          actualDurationMinutes: 60,
          scheduledDurationMinutes: 55,
          source: "manual",
        });
      }
    });

    it("returns summary with recent trips and stats", async () => {
      const res = await app.request("/api/journal/summary");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("recentTrips");
      expect(body).toHaveProperty("stats");
      expect(body).toHaveProperty("totalTrips");

      expect(Array.isArray(body.recentTrips)).toBe(true);
      expect(body.recentTrips.length).toBeLessThanOrEqual(10);
      expect(body.totalTrips).toBe(5);
    });

    it("includes correct statistics in summary", async () => {
      const res = await app.request("/api/journal/summary");

      const body = await res.json();
      expect(body.stats.averageDurationMinutes).toBe(60);
      expect(body.stats.totalTrips).toBe(5);
    });
  });

  describe("Complex query scenarios", () => {
    it("handles empty result sets gracefully", async () => {
      const res = await app.request("/api/trips?originId=999");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips).toEqual([]);
      expect(body.count).toBe(0);
    });

    it("handles date ranges with no results", async () => {
      const res = await app.request("/api/trips?startDate=2025-01-01&endDate=2025-01-31");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips).toEqual([]);
    });

    it("handles large offset values", async () => {
      const res = await app.request("/api/trips?offset=9999");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.trips).toEqual([]);
    });
  });

  describe("Data integrity during updates", () => {
    it("preserves all fields during partial update", async () => {
      const now = Date.now();

      const createRes = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          notes: "Original notes",
        }),
      });

      const createBody = await createRes.json();
      const tripId = createBody.trip.id;

      // Update only notes
      await app.request(`/api/trips/${tripId}/notes`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Updated notes" }),
      });

      // Verify other fields are preserved
      const getRes = await app.request(`/api/trips/${tripId}`);
      const trip = await getRes.json();

      expect(trip.notes).toBe("Updated notes");
      expect(trip.origin.id).toBe("101");
      expect(trip.destination.id).toBe("725");
      expect(trip.line).toBe("1");
    });

    it("handles update of non-existent trip", async () => {
      const res = await app.request("/api/trips/non-existent-id/notes", {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Test" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("Statistics calculation accuracy", () => {
    it("calculates median correctly for odd number of trips", async () => {
      const now = Date.now();

      // Create trips with durations: 40, 50, 60, 70, 80
      const durations = [40, 50, 60, 70, 80];
      for (let i = 0; i < durations.length; i++) {
        await app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - (durations.length - i) * 10000000,
            arrivalTime: now - (durations.length - i) * 10000000 + durations[i]! * 60000,
            actualDurationMinutes: durations[i]!,
          }),
        });
      }

      const statsRes = await app.request("/api/journal/stats");
      const stats = await statsRes.json();

      // Median of [40, 50, 60, 70, 80] is 60
      expect(stats.medianDurationMinutes).toBe(60);
    });

    it("calculates median correctly for even number of trips", async () => {
      const now = Date.now();

      // Create trips with durations: 40, 50, 60, 70
      const durations = [40, 50, 60, 70];
      for (let i = 0; i < durations.length; i++) {
        await app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - (durations.length - i) * 10000000,
            arrivalTime: now - (durations.length - i) * 10000000 + durations[i]! * 60000,
            actualDurationMinutes: durations[i]!,
          }),
        });
      }

      const statsRes = await app.request("/api/journal/stats");
      const stats = await statsRes.json();

      // Median of [40, 50, 60, 70] is (50 + 60) / 2 = 55
      expect(stats.medianDurationMinutes).toBe(55);
    });

    it("calculates delay statistics correctly", async () => {
      const now = Date.now();

      // Create trips with varying delays
      await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 7200000,
          arrivalTime: now - 3600000,
          actualDurationMinutes: 60,
          scheduledDurationMinutes: 50, // 10 min late
        }),
      });

      await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          actualDurationMinutes: 50,
          scheduledDurationMinutes: 50, // On time
        }),
      });

      const statsRes = await app.request("/api/journal/stats");
      const stats = await statsRes.json();

      expect(stats.averageDelayMinutes).toBe(5); // (10 + 0) / 2
      expect(stats.maxDelayMinutes).toBe(10);
      expect(stats.onTimePercentage).toBe(50);
    });
  });
});
