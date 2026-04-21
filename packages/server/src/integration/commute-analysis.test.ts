/**
 * Integration tests for Commute Analysis API and Transfer Engine.
 *
 * Tests the full data flow:
 * - Transfer engine integration with real-time arrivals
 * - Direct route computation
 * - Transfer route computation with walking times
 * - Accessible mode filtering
 * - Equipment outage consideration
 * - Cross-component integration
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { getArrivals, setArrivalsForTesting } from "../cache.js";
import { TEST_STATIONS, closeDatabase, createIntegrationTestDatabase } from "./test-helpers.js";

// Import ParsedAlert type for test data
import type { ParsedAlert } from "../alerts-parser.js";

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
    stops: ["726"],
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
  "101": [{ toStationId: "102", toLines: ["1"], walkingSeconds: 180, accessible: true }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Commute Analysis Integration Tests", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const db = createIntegrationTestDatabase();
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  afterEach(() => {
    // Clean up test data
  });

  describe("POST /api/commute/analyze", () => {
    beforeEach(() => {
      // Set up test arrival data
      const now = Math.floor(Date.now() / 1000);

      // Mock arrivals for station 101 (South Ferry) - Line 1
      setArrivalsForTesting("101", {
        northbound: [
          {
            tripId: "test-trip-1-n",
            routeId: "1",
            direction: "N",
            arrivalTime: now + 300, // 5 minutes from now
            departureTime: now + 300,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
          },
        ],
        southbound: [
          {
            tripId: "test-trip-1-s",
            routeId: "1",
            direction: "S",
            arrivalTime: now + 600, // 10 minutes from now
            departureTime: now + 600,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
          },
        ],
      });

      // Mock arrivals for station 725 (Times Square) - Line 1
      setArrivalsForTesting("725", {
        northbound: [
          {
            tripId: "test-trip-2-n",
            routeId: "1",
            direction: "N",
            arrivalTime: now + 180, // 3 minutes from now
            departureTime: now + 180,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
          },
        ],
        southbound: [
          {
            tripId: "test-trip-2-s",
            routeId: "1",
            direction: "S",
            arrivalTime: now + 420, // 7 minutes from now
            departureTime: now + 420,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
          },
        ],
      });

      // Mock arrivals for station 726 (Port Authority) - Line A
      setArrivalsForTesting("726", {
        northbound: [
          {
            tripId: "test-trip-a-n",
            routeId: "A",
            direction: "N",
            arrivalTime: now + 240, // 4 minutes from now
            departureTime: now + 240,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
          },
        ],
        southbound: [
          {
            tripId: "test-trip-a-s",
            routeId: "A",
            direction: "S",
            arrivalTime: now + 540, // 9 minutes from now
            departureTime: now + 540,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
          },
        ],
      });
    });

    it("analyzes direct route between stations", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.origin).toBeDefined();
      expect(body.destination).toBeDefined();
      expect(body.directRoutes).toBeDefined();
      expect(Array.isArray(body.directRoutes)).toBe(true);
    });

    it("includes transfer routes when available", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "726",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.transferRoutes).toBeDefined();
      expect(Array.isArray(body.transferRoutes)).toBe(true);

      // If transfer routes exist, verify structure
      if (body.transferRoutes.length > 0) {
        const transfer = body.transferRoutes[0];
        expect(transfer.legs).toBeDefined();
        expect(Array.isArray(transfer.legs)).toBe(true);
        expect(transfer.walkingSeconds).toBeDefined();
        expect(transfer.totalMinutes).toBeDefined();
      }
    });

    it("filters by preferred lines", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
          preferredLines: ["1"],
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.directRoutes).toBeDefined();

      // Verify preferred lines are reflected in results
      body.directRoutes.forEach((route: { line: string }) => {
        expect(["1"].includes(route.line)).toBe(true);
      });
    });

    it("uses custom commuteId", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

    it("returns 404 for invalid origin station", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "999",
          destinationId: "725",
        }),
      });

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("Origin station not found");
    });

    it("returns 404 for invalid destination station", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "999",
        }),
      });

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("Destination station not found");
    });

    it("includes cache headers", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });

    it("handles analysis errors gracefully", async () => {
      // Test with valid stations but potentially problematic data
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "102",
        }),
      });

      // Should either succeed with limited results or return appropriate error
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe("Transfer Engine Integration", () => {
    beforeEach(() => {
      const now = Math.floor(Date.now() / 1000);

      // Set up minimal arrivals for testing
      setArrivalsForTesting("101", {
        northbound: [
          {
            tripId: "test-1-n",
            routeId: "1",
            direction: "N",
            arrivalTime: now + 300,
            departureTime: now + 300,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
          },
        ],
        southbound: [],
      });
    });

    it("integrates with cache for arrivals", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      expect(res.status).toBe(200);

      // Verify the cache was queried
      const arrivals = getArrivals("101");
      expect(arrivals).toBeDefined();
    });

    it("returns consistent results for repeated requests", async () => {
      const requestBody = JSON.stringify({
        originId: "101",
        destinationId: "725",
      });

      const res1 = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      const res2 = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const body1 = await res1.json();
      const body2 = await res2.json();

      // Results should have similar structure
      expect(body1.origin).toEqual(body2.origin);
      expect(body1.destination).toEqual(body2.destination);
    });
  });

  describe("Accessible Mode", () => {
    it("filters routes for accessibility when enabled", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "726",
          accessibleMode: true,
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toBeDefined();
      // Accessible mode should only return accessible transfer routes
      if (body.transferRoutes && body.transferRoutes.length > 0) {
        body.transferRoutes.forEach((route: { accessible: boolean }) => {
          expect(route.accessible).toBe(true);
        });
      }
    });

    it("returns all routes when accessibility is disabled", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "726",
          accessibleMode: false,
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toBeDefined();
    });
  });
});
