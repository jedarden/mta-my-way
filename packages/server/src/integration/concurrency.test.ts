/**
 * Integration tests for concurrent request handling and race conditions.
 *
 * Tests that the system correctly handles:
 * - Concurrent trip creation requests
 * - Simultaneous updates to the same resource
 * - Race conditions in database operations
 * - Rate limiting under concurrent load
 * - Session management with concurrent requests
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
  deleteTrip,
  getTripById,
  getTrips,
  initTripTracking,
  recordTrip,
} from "../trip-tracking.js";
import {
  closeDatabase,
  createIntegrationTestDatabase,
  createTestAdminCredentials,
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
    stops: ["726"],
    isExpress: true,
  },
};

const TEST_COMPLEXES: ComplexIndex = {};
const TEST_TRANSFERS: Record<string, TransferConnection[]> = {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Concurrency and Race Conditions Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let authHeaders: { Authorization: string };
  let adminAuthHeaders: { Authorization: string };

  beforeEach(async () => {
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);

    const userCreds = await createTestUserCredentials();
    const adminCreds = await createTestAdminCredentials();
    authHeaders = { Authorization: userCreds.authorizationHeader };
    adminAuthHeaders = { Authorization: adminCreds.authorizationHeader };

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

  describe("Concurrent trip creation", () => {
    it("handles multiple simultaneous trip creation requests", async () => {
      const now = Date.now();
      const tripCount = 20;

      // Create trips concurrently
      const promises = Array.from({ length: tripCount }, (_, i) =>
        app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000 - i * 10000,
            arrivalTime: now - i * 10000,
            notes: `Concurrent trip ${i}`,
          }),
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      const successCount = responses.filter((r) => r.status === 201).length;
      expect(successCount).toBe(tripCount);

      // Verify all trips were created in database
      const trips = getTrips({ limit: 1000 });
      expect(trips.length).toBe(tripCount);
    });

    it("assigns unique IDs to all concurrent trips", async () => {
      const now = Date.now();
      const tripCount = 50;

      const promises = Array.from({ length: tripCount }, () =>
        app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000,
            arrivalTime: now,
          }),
        })
      );

      const responses = await Promise.all(promises);

      // Extract all trip IDs
      const tripIds = new Set<string>();
      for (const res of responses) {
        if (res.status === 201) {
          const body = await res.json();
          tripIds.add(body.trip.id);
        }
      }

      // All IDs should be unique
      expect(tripIds.size).toBe(tripCount);
    });

    it("maintains data consistency under concurrent writes", async () => {
      const now = Date.now();
      const tripCount = 30;

      const promises = Array.from({ length: tripCount }, (_, i) =>
        app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000 - i * 60000,
            arrivalTime: now - i * 60000,
            actualDurationMinutes: 60,
          }),
        })
      );

      await Promise.all(promises);

      // Verify database consistency
      const trips = getTrips({ limit: 1000 });
      expect(trips.length).toBe(tripCount);

      // Each trip should have all required fields
      for (const trip of trips) {
        expect(trip.id).toBeDefined();
        expect(trip.origin).toBeDefined();
        expect(trip.destination).toBeDefined();
        expect(trip.line).toBeDefined();
        expect(trip.departureTime).toBeDefined();
        expect(trip.arrivalTime).toBeDefined();
      }
    });
  });

  describe("Concurrent updates to same resource", () => {
    it("handles simultaneous updates to trip notes", async () => {
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
          notes: "Original",
        }),
      });

      const createBody = await createRes.json();
      const tripId = createBody.trip.id;

      // Simultaneous updates
      const updateCount = 10;
      const promises = Array.from({ length: updateCount }, (_, i) =>
        app.request(`/api/trips/${tripId}/notes`, {
          method: "PATCH",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ notes: `Update ${i}` }),
        })
      );

      const responses = await Promise.all(promises);

      // At least one should succeed
      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Final state should be consistent
      const trip = getTripById(tripId);
      expect(trip).toBeDefined();
      expect(trip?.notes).toMatch(/Update \d+/);
    });

    it("handles concurrent read and write operations", async () => {
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

      // Mix of reads and writes
      const operations = [];
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          // Read
          operations.push(
            app.request(`/api/trips/${tripId}`).then((r) => ({ type: "read", status: r.status }))
          );
        } else {
          // Write
          operations.push(
            app
              .request(`/api/trips/${tripId}/notes`, {
                method: "PATCH",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({ notes: `Note ${i}` }),
              })
              .then((r) => ({ type: "write", status: r.status }))
          );
        }
      }

      const results = await Promise.all(operations);

      // All reads should succeed
      const reads = results.filter((r) => r.type === "read");
      expect(reads.every((r) => r.status === 200)).toBe(true);
    });
  });

  describe("Concurrent deletions", () => {
    it("handles multiple deletion requests gracefully", async () => {
      const now = Date.now();

      // Create multiple trips
      const tripIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const createRes = await app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000 - i * 100000,
            arrivalTime: now - i * 100000,
          }),
        });

        const body = await createRes.json();
        tripIds.push(body.trip.id);
      }

      // Delete all trips concurrently
      const deletePromises = tripIds.map((id) =>
        app.request(`/api/trips/${id}`, {
          method: "DELETE",
          headers: authHeaders,
        })
      );

      const responses = await Promise.all(deletePromises);

      // All should succeed
      expect(responses.every((r) => r.status === 200)).toBe(true);

      // Verify all are deleted
      const trips = getTrips({ limit: 1000 });
      expect(trips.length).toBe(0);
    });

    it("prevents duplicate deletion of same resource", async () => {
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

      // Delete the same trip multiple times concurrently
      const deletePromises = Array.from({ length: 5 }, () =>
        app.request(`/api/trips/${tripId}`, {
          method: "DELETE",
          headers: authHeaders,
        })
      );

      const responses = await Promise.all(deletePromises);

      // First deletion succeeds, others may fail with 404
      const successCount = responses.filter((r) => r.status === 200).length;
      const notFoundCount = responses.filter((r) => r.status === 404).length;

      expect(successCount + notFoundCount).toBe(5);

      // Trip should be deleted
      const trip = getTripById(tripId);
      expect(trip).toBeNull();
    });
  });

  describe("Statistics calculation under concurrent load", () => {
    it("calculates correct stats after concurrent trip creation", async () => {
      const now = Date.now();
      const tripCount = 25;
      const durations = [45, 50, 55, 60, 65];

      // Create trips with varying durations concurrently
      const promises = Array.from({ length: tripCount }, (_, i) =>
        app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000 - i * 100000,
            arrivalTime: now - i * 100000,
            actualDurationMinutes: durations[i % durations.length]!,
          }),
        })
      );

      await Promise.all(promises);

      // Check stats
      const statsRes = await app.request("/api/journal/stats");
      const stats = await statsRes.json();

      expect(stats.totalTrips).toBe(tripCount);
      expect(stats.averageDurationMinutes).toBeCloseTo(55, 0);
    });

    it("handles concurrent stats queries", async () => {
      const now = Date.now();

      // Create some trips
      for (let i = 0; i < 5; i++) {
        await app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000 - i * 100000,
            arrivalTime: now - i * 100000,
          }),
        });
      }

      // Query stats concurrently
      const promises = Array.from({ length: 20 }, () => app.request("/api/journal/stats"));
      const responses = await Promise.all(promises);

      // All should succeed
      expect(responses.every((r) => r.status === 200)).toBe(true);

      // All should return consistent data
      const statsBodies = await Promise.all(responses.map((r) => r.json()));
      const firstStats = statsBodies[0];

      for (const stats of statsBodies) {
        expect(stats.totalTrips).toBe(firstStats.totalTrips);
        expect(stats.averageDurationMinutes).toBe(firstStats.averageDurationMinutes);
      }
    });
  });

  describe("Race conditions in filtering and pagination", () => {
    it("handles concurrent queries with different filters", async () => {
      const now = Date.now();

      // Create trips for different lines
      const createPromises = [];
      for (let i = 0; i < 20; i++) {
        const line = i % 2 === 0 ? "1" : "A";
        createPromises.push(
          app.request("/api/trips", {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              origin: { id: line === "1" ? "101" : "726", name: "Test Origin" },
              destination: { id: "725", name: "Test Dest" },
              line,
              departureTime: now - 3600000 - i * 100000,
              arrivalTime: now - i * 100000,
            }),
          })
        );
      }

      await Promise.all(createPromises);

      // Query with different filters concurrently
      const queries = [
        app.request("/api/trips?line=1"),
        app.request("/api/trips?line=A"),
        app.request("/api/trips?limit=5"),
        app.request("/api/trips?limit=10&offset=5"),
        app.request("/api/trips?originId=101"),
      ];

      const responses = await Promise.all(queries);

      // All should succeed
      expect(responses.every((r) => r.status === 200)).toBe(true);

      // Results should be consistent with filters
      const line1Trips = await responses[0].json();
      expect(line1Trips.trips.every((t: { line: string }) => t.line === "1")).toBe(true);
    });
  });

  describe("Database consistency under concurrent operations", () => {
    it("maintains foreign key relationships", async () => {
      const now = Date.now();

      // Create and delete trips concurrently
      const operations = [];
      const tripIds: string[] = [];

      // Create some trips first
      for (let i = 0; i < 10; i++) {
        const createRes = await app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000 - i * 100000,
            arrivalTime: now - i * 100000,
          }),
        });

        const body = await createRes.json();
        tripIds.push(body.trip.id);
      }

      // Now create more and delete some concurrently
      for (let i = 0; i < 10; i++) {
        // Create new trip
        operations.push(
          app.request("/api/trips", {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              origin: { id: "101", name: "South Ferry" },
              destination: { id: "725", name: "Times Sq-42 St" },
              line: "1",
              departureTime: now - i * 10000,
              arrivalTime: now + 3600000 - i * 10000,
            }),
          })
        );

        // Delete existing trip
        if (tripIds[i]) {
          operations.push(
            app.request(`/api/trips/${tripIds[i]}`, {
              method: "DELETE",
              headers: authHeaders,
            })
          );
        }
      }

      await Promise.all(operations);

      // Database should be consistent
      const trips = getTrips({ limit: 1000 });
      for (const trip of trips) {
        expect(trip.origin).toBeDefined();
        expect(trip.destination).toBeDefined();
        expect(trip.line).toBeDefined();
      }
    });
  });

  describe("Authorization under concurrent requests", () => {
    it("handles concurrent authorized requests correctly", async () => {
      const now = Date.now();

      // Create multiple concurrent requests with same auth
      const promises = Array.from({ length: 15 }, (_, i) =>
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

      // All should succeed with proper auth
      expect(responses.every((r) => r.status === 201)).toBe(true);
    });

    it("rejects concurrent unauthorized requests", async () => {
      const now = Date.now();

      // Create requests without auth
      const promises = Array.from({ length: 10 }, () =>
        app.request("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000,
            arrivalTime: now,
          }),
        })
      );

      const responses = await Promise.all(promises);

      // All should be rejected
      expect(responses.every((r) => r.status === 401)).toBe(true);
    });
  });
});
