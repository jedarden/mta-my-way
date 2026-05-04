/**
 * Integration tests for commute analysis API.
 *
 * Tests the full data flow for commute analysis:
 * - API request handling with authentication
 * - Transfer engine integration with real-time arrivals
 * - Route computation (direct, transfer, walking)
 * - Response validation and recommendation logic
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import type { ArrivalTime } from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
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

// Mock arrival data for testing
function createMockArrivals(
  stationId: string,
  arrivals: Array<{ tripId: string; line: string; arrivalSeconds: number }>
): ArrivalTime[] {
  const now = Math.floor(Date.now() / 1000);
  return arrivals.map((a) => ({
    tripId: a.tripId,
    routeId: a.line,
    stopId: stationId + "N",
    originStationId: null,
    originStopId: null,
    destinationStationId: null,
    destinationStopId: null,
    direction: "N" as const,
    arrivalTime: now + a.arrivalSeconds,
    scheduledTime: now + a.arrivalSeconds,
    isPrediction: true,
    isLive: true,
    timestamp: now,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Commute Analysis Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;
  let authHeaders: { Authorization: string };
  let getArrivalsSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    db = createIntegrationTestDatabase();

    const userCreds = await createTestUserCredentials();
    authHeaders = { Authorization: userCreds.authorizationHeader };

    // Create app with test data
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );

    // Mock the getArrivals function to return test data
    const { getArrivals } = await import("../cache.js");
    getArrivalsSpy = vi.spyOn(await import("../cache.js"), "getArrivals");
  });

  afterEach(() => {
    closeDatabase(db);
    vi.restoreAllMocks();
  });

  describe("POST /api/commute/analyze", () => {
    it("analyzes direct route between stations", async () => {
      // Mock arrivals for both stations
      getArrivalsSpy.mockImplementation((stationId: string) => {
        if (stationId === "101") {
          return createMockArrivals("101", [
            { tripId: "1_123", line: "1", arrivalSeconds: 180 },
            { tripId: "1_456", line: "1", arrivalSeconds: 420 },
          ]);
        }
        return null;
      });

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("commuteId");
      expect(body).toHaveProperty("origin");
      expect(body).toHaveProperty("destination");
      expect(body).toHaveProperty("directRoutes");
      expect(body).toHaveProperty("transferRoutes");
      expect(body).toHaveProperty("recommendation");
      expect(body).toHaveProperty("timestamp");

      // Validate origin and destination
      expect(body.origin.id).toBe("101");
      expect(body.destination.id).toBe("725");
    });

    it("analyzes route with transfers", async () => {
      // Mock arrivals for transfer stations
      getArrivalsSpy.mockImplementation((stationId: string) => {
        if (stationId === "101") {
          return createMockArrivals("101", [{ tripId: "1_123", line: "1", arrivalSeconds: 180 }]);
        }
        if (stationId === "725") {
          return createMockArrivals("725", [{ tripId: "A_456", line: "A", arrivalSeconds: 300 }]);
        }
        if (stationId === "726") {
          return createMockArrivals("726", [{ tripId: "A_789", line: "A", arrivalSeconds: 600 }]);
        }
        return null;
      });

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "726",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.transferRoutes).toBeDefined();
      expect(Array.isArray(body.transferRoutes)).toBe(true);
    });

    it("filters by preferred lines", async () => {
      getArrivalsSpy.mockImplementation(() => []);

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
          preferredLines: ["1"],
        }),
      });

      expect(res.status).toBe(200);
    });

    it("uses custom commute ID", async () => {
      getArrivalsSpy.mockImplementation(() => []);

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
          commuteId: "work-commute",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.commuteId).toBe("work-commute");
    });

    it("enables accessible mode", async () => {
      getArrivalsSpy.mockImplementation(() => []);

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
          accessibleMode: true,
        }),
      });

      expect(res.status).toBe(200);
    });

    it("returns 404 for invalid origin station", async () => {
      getArrivalsSpy.mockImplementation(() => []);

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "invalid-station",
          destinationId: "725",
        }),
      });

      expect(res.status).toBe(404);
    });

    it("returns 404 for invalid destination station", async () => {
      getArrivalsSpy.mockImplementation(() => []);

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "invalid-station",
        }),
      });

      expect(res.status).toBe(404);
    });

    it("returns recommendation with details", async () => {
      getArrivalsSpy.mockImplementation((stationId: string) => {
        if (stationId === "101") {
          return createMockArrivals("101", [{ tripId: "1_123", line: "1", arrivalSeconds: 180 }]);
        }
        return null;
      });

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.recommendation).toBeDefined();
      expect(body.recommendationDetails).toBeDefined();

      // Recommendation should be one of: "direct", "transfer", "walk"
      expect(["direct", "transfer", "walk", "no-data"]).toContain(body.recommendation);
    });

    it("includes walking option for short distances", async () => {
      getArrivalsSpy.mockImplementation(() => []);

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "725",
          destinationId: "726",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.walkingOption).toBeDefined();
    });

    it("handles internal errors gracefully", async () => {
      // Force an internal error by passing invalid data
      getArrivalsSpy.mockImplementation(() => {
        throw new Error("Internal error");
      });

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      // Should return 500 error
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Data flow integration", () => {
    it("integrates with cache for real-time arrivals", async () => {
      // Verify the integration with the cache module
      getArrivalsSpy.mockImplementation((stationId: string) => {
        if (stationId === "101") {
          return createMockArrivals("101", [{ tripId: "1_123", line: "1", arrivalSeconds: 180 }]);
        }
        return null;
      });

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      expect(res.status).toBe(200);
      expect(getArrivalsSpy).toHaveBeenCalledWith("101");
    });

    it("propagates transfer connection data", async () => {
      getArrivalsSpy.mockImplementation(() => []);

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "725",
          destinationId: "726",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      // Should have transfer routes since stations are in the same complex
      expect(body.transferRoutes).toBeDefined();
    });
  });
});
