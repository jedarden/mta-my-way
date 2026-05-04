/**
 * Integration tests for CSRF endpoint and cross-component scenarios.
 *
 * Tests the full data flow:
 * - CSRF token generation and retrieval
 * - Cross-component error handling
 * - Concurrent access patterns
 * - End-to-end workflow scenarios
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
  TEST_STATIONS,
  closeDatabase,
  createIntegrationTestDatabase,
  createTestAdminCredentials,
  createTestTrip,
  createTestUserCredentials,
} from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

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

describe("CSRF and Cross-Component Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let authHeaders: { Authorization: string };

  beforeEach(async () => {
    db = createIntegrationTestDatabase();
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );

    const userCreds = await createTestUserCredentials();
    authHeaders = { Authorization: userCreds.authorizationHeader };
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("GET /api/csrf-token", () => {
    it("returns CSRF token", async () => {
      const res = await app.request("/api/csrf-token");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe("string");
      expect(body.token.length).toBeGreaterThan(0);
    });

    it("sets CSRF cookie", async () => {
      const res = await app.request("/api/csrf-token");

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toBeDefined();
      expect(setCookie).toContain("csrf_token=");
    });

    it("includes HttpOnly flag on cookie", async () => {
      const res = await app.request("/api/csrf-token");

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("HttpOnly");
    });

    it("includes SameSite=Strict on cookie", async () => {
      const res = await app.request("/api/csrf-token");

      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toContain("SameSite=Strict");
    });

    it("generates new token if none exists", async () => {
      const res = await app.request("/api/csrf-token");

      const body = await res.json();
      expect(body.token).toBeDefined();
      expect(body.token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it("returns consistent token format", async () => {
      const res1 = await app.request("/api/csrf-token");
      const res2 = await app.request("/api/csrf-token");

      const body1 = await res1.json();
      const body2 = await res2.json();

      expect(body1.token).toMatch(/^[a-f0-9]+$/);
      expect(body2.token).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe("Cross-component error handling", () => {
    it("handles cache failures gracefully in arrivals endpoint", async () => {
      // Don't set up any arrivals - should handle empty state
      const res = await app.request("/api/arrivals/101");

      // Should either return empty data or 404
      expect([200, 404]).toContain(res.status);
    });

    it("handles database failures in trip creation", async () => {
      closeDatabase(db);

      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: Date.now() - 3600000,
          arrivalTime: Date.now(),
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("propagates validation errors correctly", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          // Missing required fields
          origin: { id: "101" },
        }),
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("handles malformed JSON gracefully", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: "not valid json {{{",
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Concurrent access patterns", () => {
    it("handles concurrent trip creation", async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        app.request("/api/trips", {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: Date.now() - 3600000 - i * 10000,
            arrivalTime: Date.now() - i * 10000,
          }),
        })
      );

      const responses = await Promise.all(promises);

      // All should succeed
      for (const res of responses) {
        expect(res.status).toBe(201);
      }
    });

    it("handles concurrent read operations", async () => {
      // First create a trip
      await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: Date.now() - 3600000,
          arrivalTime: Date.now(),
        }),
      });

      // Concurrent reads
      const promises = Array.from({ length: 10 }, () => app.request("/api/trips"));

      const responses = await Promise.all(promises);

      // All should succeed
      for (const res of responses) {
        expect(res.status).toBe(200);
      }
    });

    it("handles concurrent mixed operations", async () => {
      const operations = [];

      // Create trips
      for (let i = 0; i < 3; i++) {
        operations.push(
          app.request("/api/trips", {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              origin: { id: "101", name: "South Ferry" },
              destination: { id: "725", name: "Times Sq-42 St" },
              line: "1",
              departureTime: Date.now() - 3600000 - i * 10000,
              arrivalTime: Date.now() - i * 10000,
            }),
          })
        );
      }

      // Read trips
      for (let i = 0; i < 3; i++) {
        operations.push(app.request("/api/trips"));
      }

      // Get stats
      for (let i = 0; i < 2; i++) {
        operations.push(app.request("/api/journal/stats"));
      }

      const responses = await Promise.all(operations);

      // All should succeed
      for (const res of responses) {
        expect([200, 201]).toContain(res.status);
      }
    });
  });

  describe("End-to-end workflow scenarios", () => {
    it("full trip lifecycle: create, read, update, delete", async () => {
      const now = Date.now();

      // Create
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

      expect(createRes.status).toBe(201);
      const createBody = await createRes.json();
      const tripId = createBody.trip.id;

      // Read
      const getRes = await app.request(`/api/trips/${tripId}`);
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      expect(getBody.notes).toBe("Original notes");

      // Update
      const updateRes = await app.request(`/api/trips/${tripId}/notes`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Updated notes" }),
      });

      expect(updateRes.status).toBe(200);

      // Verify update
      const getRes2 = await app.request(`/api/trips/${tripId}`);
      const getBody2 = await getRes2.json();
      expect(getBody2.notes).toBe("Updated notes");

      // Delete
      const deleteRes = await app.request(`/api/trips/${tripId}`, {
        method: "DELETE",
      });

      expect(deleteRes.status).toBe(200);

      // Verify deletion
      const getRes3 = await app.request(`/api/trips/${tripId}`);
      expect(getRes3.status).toBe(404);
    });

    it("commute analysis with trip recording workflow", async () => {
      // First record some trips to build history
      const now = Date.now();
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
          scheduledDurationMinutes: 55,
        }),
      });

      // Get stats that should reflect the recorded trip
      const statsRes = await app.request("/api/journal/stats");
      expect(statsRes.status).toBe(200);

      const stats = await statsRes.json();
      expect(stats.totalTrips).toBe(1);
      expect(stats.averageDurationMinutes).toBe(60);
    });

    it("multi-station search and trip creation workflow", async () => {
      // Search for origin station
      const searchRes1 = await app.request("/api/stations/search?q=South");
      expect(searchRes1.status).toBe(200);

      const searchResults1 = await searchRes1.json();
      expect(searchResults1.length).toBeGreaterThan(0);

      const originStation = searchResults1.find((s: Station) => s.id === "101");
      expect(originStation).toBeDefined();

      // Search for destination station
      const searchRes2 = await app.request("/api/stations/search?q=Times");
      expect(searchRes2.status).toBe(200);

      const searchResults2 = await searchRes2.json();
      expect(searchResults2.length).toBeGreaterThan(0);

      const destStation = searchResults2.find((s: Station) => s.id === "725");
      expect(destStation).toBeDefined();

      // Create trip with searched stations
      const now = Date.now();
      const createRes = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: originStation.id, name: originStation.name },
          destination: { id: destStation.id, name: destStation.name },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
        }),
      });

      expect(createRes.status).toBe(201);
    });

    it("alert-informed trip planning workflow", async () => {
      // Check for alerts on the planned route
      const alertsRes = await app.request("/api/alerts?lineId=1&activeOnly=true");
      expect(alertsRes.status).toBe(200);

      const alerts = await alertsRes.json();
      expect(alerts.alerts).toBeDefined();

      // Create trip regardless of alerts
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
        }),
      });

      expect(createRes.status).toBe(201);
    });
  });

  describe("Cache consistency across operations", () => {
    it("maintains consistency after update operations", async () => {
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

      // Verify via list endpoint
      const listRes = await app.request("/api/trips");
      const listBody = await listRes.json();
      const trip = listBody.trips.find((t: Trip) => t.id === tripId);

      expect(trip?.notes).toBe("Test notes");
    });

    it("reflects deletions in list results", async () => {
      const now = Date.now();

      // Create two trips
      const t1 = await app.request("/api/trips", {
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

      const t2 = await app.request("/api/trips", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "725", name: "Times Sq-42 St" },
          destination: { id: "726", name: "42 St-Port Authority" },
          line: "A",
          departureTime: now - 7200000,
          arrivalTime: now - 3600000,
        }),
      });

      const trip1Id = (await t1.json()).trip.id;
      const trip2Id = (await t2.json()).trip.id;

      // Delete first trip
      await app.request(`/api/trips/${trip1Id}`, { method: "DELETE" });

      // Verify list only has second trip
      const listRes = await app.request("/api/trips");
      const listBody = await listRes.json();

      expect(listBody.trips.length).toBe(1);
      expect(listBody.trips[0]?.id).toBe(trip2Id);
    });
  });
});
