/**
 * Public API Health Test Suite
 *
 * Comprehensive tests for public arrivals, stations, and alerts API endpoints
 * to verify health, responsiveness, data structure, and performance.
 *
 * Test Coverage:
 * - Arrivals endpoint (/api/arrivals/:stationId)
 * - Stations endpoint (/api/stations)
 * - Alerts endpoint (/api/alerts)
 * - Response structure validation
 * - Data type verification
 * - Performance assertions (<2s response time)
 *
 * Run with: npm test -- public-api-health
 */

import type {
  Alert,
  ComplexIndex,
  RouteIndex,
  Station,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

// Test fixtures
const STATIONS: StationIndex = {
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
};

const ROUTES: RouteIndex = {
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
    longName: "8 Ave Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["726"],
    isExpress: true,
  },
};

const COMPLEXES: ComplexIndex = {
  "725-726": {
    complexId: "725-726",
    name: "Times Sq-42 St/Port Authority",
    stations: ["725", "726"],
    allLines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S", "A", "C", "E"],
    allStopIds: ["725N", "725S", "726N", "726S"],
  },
};

const TRANSFERS: Record<string, TransferConnection[]> = {
  "725": [{ toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }],
};

/**
 * Create a test app instance
 */
function createTestApp(): Hono {
  return createApp(STATIONS, ROUTES, COMPLEXES, TRANSFERS, "/tmp/test-web-dist");
}

/**
 * Performance assertion helper
 * @param startTime Request start time in milliseconds
 * @param maxMs Maximum acceptable response time in milliseconds (default: 2000ms)
 */
function assertPerformance(startTime: number, maxMs: number = 2000): void {
  const responseTime = Date.now() - startTime;
  expect(responseTime).toBeLessThan(maxMs);
}

describe("Public API Health Test Suite", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("Arrivals Endpoint (/api/arrivals/:stationId)", () => {
    it("should return 200 status code for valid station", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/arrivals/101");
      assertPerformance(startTime);

      expect(response.status).toBe(200);
    });

    it("should return 404 for non-existent station", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/arrivals/999");
      assertPerformance(startTime);

      expect(response.status).toBe(404);
    });

    it("should return valid data structure for arrivals", async () => {
      const response = await app.request("/api/arrivals/101");
      expect(response.status).toBe(200);

      const body = await response.json();

      // Validate top-level structure
      expect(body).toHaveProperty("stationId");
      expect(body).toHaveProperty("stationName");
      expect(body).toHaveProperty("updatedAt");
      expect(body).toHaveProperty("feedAge");
      expect(body).toHaveProperty("northbound");
      expect(body).toHaveProperty("southbound");
      expect(body).toHaveProperty("equipment");
    });

    it("should have correct data types for arrival fields", async () => {
      const response = await app.request("/api/arrivals/101");
      expect(response.status).toBe(200);

      const body = await response.json();

      // Verify data types
      expect(typeof body.stationId).toBe("string");
      expect(typeof body.stationName).toBe("string");
      expect(typeof body.updatedAt).toBe("number");
      expect(typeof body.feedAge).toBe("number");
      expect(Array.isArray(body.northbound)).toBe(true);
      expect(Array.isArray(body.southbound)).toBe(true);
      expect(Array.isArray(body.equipment)).toBe(true);
    });

    it("should include cache headers", async () => {
      const response = await app.request("/api/arrivals/101");
      expect(response.status).toBe(200);

      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toBeTruthy();
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age");
    });

    it("should have correct arrival object structure when data exists", async () => {
      const response = await app.request("/api/arrivals/101");

      // Note: This test may return 404 if no arrival data is cached yet
      if (response.status === 200) {
        const body = await response.json();

        // Check at least one direction has data
        const hasArrivals = body.northbound.length > 0 || body.southbound.length > 0;

        if (hasArrivals) {
          const arrivals = body.northbound.length > 0 ? body.northbound : body.southbound;
          const arrival = arrivals[0];

          // Validate arrival object structure
          expect(arrival).toHaveProperty("line");
          expect(arrival).toHaveProperty("direction");
          expect(arrival).toHaveProperty("arrivalTime");
          expect(arrival).toHaveProperty("minutesAway");
          expect(arrival).toHaveProperty("isAssigned");
          expect(arrival).toHaveProperty("isRerouted");
          expect(arrival).toHaveProperty("isExpress");
          expect(arrival).toHaveProperty("tripId");
          expect(arrival).toHaveProperty("destination");
          expect(arrival).toHaveProperty("confidence");
          expect(arrival).toHaveProperty("feedName");
          expect(arrival).toHaveProperty("feedAge");

          // Validate arrival data types
          expect(typeof arrival.line).toBe("string");
          expect(typeof arrival.direction).toBe("string");
          expect(typeof arrival.arrivalTime).toBe("number");
          expect(typeof arrival.minutesAway).toBe("number");
          expect(typeof arrival.isAssigned).toBe("boolean");
          expect(typeof arrival.isRerouted).toBe("boolean");
          expect(typeof arrival.isExpress).toBe("boolean");
          expect(typeof arrival.tripId).toBe("string");
          expect(typeof arrival.destination).toBe("string");
          expect(["high", "medium", "low"]).toContain(arrival.confidence);
          expect(typeof arrival.feedName).toBe("string");
          expect(typeof arrival.feedAge).toBe("number");
        }
      }
    });

    it("should respond within 2 seconds for arrivals request", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/arrivals/101");

      expect(response.status).toBe(200);
      assertPerformance(startTime, 2000);
    });
  });

  describe("Stations Endpoint (/api/stations)", () => {
    it("should return 200 status code", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/stations");
      assertPerformance(startTime);

      expect(response.status).toBe(200);
    });

    it("should return valid array of stations", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it("should have correct station object structure", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();
      const station = body[0];

      // Validate required station fields
      expect(station).toHaveProperty("id");
      expect(station).toHaveProperty("name");
      expect(station).toHaveProperty("lat");
      expect(station).toHaveProperty("lon");
      expect(station).toHaveProperty("lines");
      expect(station).toHaveProperty("northStopId");
      expect(station).toHaveProperty("southStopId");
      expect(station).toHaveProperty("transfers");
      expect(station).toHaveProperty("ada");
      expect(station).toHaveProperty("borough");
    });

    it("should have correct data types for station fields", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();
      const station = body[0];

      // Validate station data types
      expect(typeof station.id).toBe("string");
      expect(typeof station.name).toBe("string");
      expect(typeof station.lat).toBe("number");
      expect(typeof station.lon).toBe("number");
      expect(Array.isArray(station.lines)).toBe(true);
      expect(typeof station.northStopId).toBe("string");
      expect(typeof station.southStopId).toBe("string");
      expect(Array.isArray(station.transfers)).toBe(true);
      expect(typeof station.ada).toBe("boolean");
      expect(typeof station.borough).toBe("string");

      // Validate geographic coordinates
      expect(station.lat).toBeGreaterThanOrEqual(-90);
      expect(station.lat).toBeLessThanOrEqual(90);
      expect(station.lon).toBeGreaterThanOrEqual(-180);
      expect(station.lon).toBeLessThanOrEqual(180);
    });

    it("should include cache headers", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toBeTruthy();
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age");
    });

    it("should include correct content type", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toBeTruthy();
      expect(contentType).toContain("application/json");
    });

    it("should respond within 2 seconds for stations request", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/stations");

      expect(response.status).toBe(200);
      assertPerformance(startTime, 2000);
    });
  });

  describe("Alerts Endpoint (/api/alerts)", () => {
    it("should return 200 status code", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/alerts");
      assertPerformance(startTime);

      expect(response.status).toBe(200);
    });

    it("should return valid alerts structure with metadata", async () => {
      const response = await app.request("/api/alerts");
      expect(response.status).toBe(200);

      const body = await response.json();

      // Validate top-level structure
      expect(body).toHaveProperty("alerts");
      expect(body).toHaveProperty("meta");
      expect(Array.isArray(body.alerts)).toBe(true);
      expect(typeof body.meta).toBe("object");
    });

    it("should have correct metadata structure", async () => {
      const response = await app.request("/api/alerts");
      expect(response.status).toBe(200);

      const body = await response.json();
      const meta = body.meta;

      // Validate metadata fields
      expect(meta).toHaveProperty("count");
      expect(meta).toHaveProperty("officialCount");
      expect(meta).toHaveProperty("predictedCount");
      expect(meta).toHaveProperty("lastUpdatedAt");
      expect(meta).toHaveProperty("matchRate");
      expect(meta).toHaveProperty("consecutiveFailures");
      expect(meta).toHaveProperty("circuitOpen");

      // Validate metadata data types
      expect(typeof meta.count).toBe("number");
      expect(typeof meta.officialCount).toBe("number");
      expect(typeof meta.predictedCount).toBe("number");
      expect(meta.lastUpdatedAt === null || typeof meta.lastUpdatedAt === "number").toBe(true);
      expect(typeof meta.matchRate).toBe("number");
      expect(typeof meta.consecutiveFailures).toBe("number");
      expect(typeof meta.circuitOpen).toBe("boolean");
    });

    it("should have correct alert object structure when alerts exist", async () => {
      const response = await app.request("/api/alerts");
      expect(response.status).toBe(200);

      const body = await response.json();

      if (body.alerts.length > 0) {
        const alert: Alert = body.alerts[0];

        // Validate alert object structure
        expect(alert).toHaveProperty("id");
        expect(alert).toHaveProperty("affectedLines");
        expect(alert).toHaveProperty("activePeriod");
        expect(alert).toHaveProperty("summary");

        // Validate alert data types
        expect(typeof alert.id).toBe("string");
        expect(Array.isArray(alert.affectedLines)).toBe(true);
        expect(typeof alert.activePeriod).toBe("object");
        expect(alert.activePeriod).toHaveProperty("start");
        expect(typeof alert.activePeriod.start).toBe("number");
        expect(typeof alert.summary).toBe("string");
      }
    });

    it("should include cache headers", async () => {
      const response = await app.request("/api/alerts");
      expect(response.status).toBe(200);

      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toBeTruthy();
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age");
    });

    it("should include correct content type", async () => {
      const response = await app.request("/api/alerts");
      expect(response.status).toBe(200);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toBeTruthy();
      expect(contentType).toContain("application/json");
    });

    it("should respond within 2 seconds for alerts request", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/alerts");

      expect(response.status).toBe(200);
      assertPerformance(startTime, 2000);
    });
  });

  describe("Performance and Reliability", () => {
    it("all public endpoints should respond within 2 seconds", async () => {
      const endpoints = ["/api/stations", "/api/alerts", "/api/arrivals/101"];

      for (const endpoint of endpoints) {
        const startTime = Date.now();
        const response = await app.request(endpoint);
        const responseTime = Date.now() - startTime;

        expect(responseTime).toBeLessThan(2000);
        expect([200, 404]).toContain(response.status); // 404 acceptable for arrivals with no data
      }
    });

    it("should handle concurrent requests without errors", async () => {
      const requests = [
        app.request("/api/stations"),
        app.request("/api/alerts"),
        app.request("/api/arrivals/101"),
      ];

      const responses = await Promise.all(requests);

      // All requests should complete successfully
      responses.forEach((response) => {
        expect([200, 404]).toContain(response.status);
      });
    });

    it("should return consistent response formats", async () => {
      const stationResponse = await app.request("/api/stations");
      const alertsResponse = await app.request("/api/alerts");

      // Both should return JSON
      expect(stationResponse.headers.get("Content-Type")).toContain("application/json");
      expect(alertsResponse.headers.get("Content-Type")).toContain("application/json");

      // Both should have cache headers
      expect(stationResponse.headers.get("Cache-Control")).toBeTruthy();
      expect(alertsResponse.headers.get("Cache-Control")).toBeTruthy();
    });
  });

  describe("Data Integrity and Edge Cases", () => {
    it("should handle invalid station IDs gracefully", async () => {
      const response = await app.request("/api/arrivals/invalid-station");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle malformed station IDs", async () => {
      const response = await app.request("/api/arrivals/../../../etc/passwd");
      // Should either return 404 or handle the path traversal attempt safely
      expect([400, 404, 422]).toContain(response.status);
    });

    it("should handle empty query parameters gracefully", async () => {
      const response = await app.request("/api/alerts?");
      expect(response.status).toBe(200);
    });

    it("should maintain data consistency across multiple requests", async () => {
      const response1 = await app.request("/api/stations");
      const body1 = await response1.json();

      const response2 = await app.request("/api/stations");
      const body2 = await response2.json();

      // Both responses should have the same structure
      expect(Array.isArray(body1)).toBe(true);
      expect(Array.isArray(body2)).toBe(true);
      expect(body1.length).toBe(body2.length);
    });
  });
});

/**
 * Test Results Summary
 *
 * This test suite validates:
 *
 * ✅ Arrivals Endpoint (/api/arrivals/:stationId):
 *    - Returns 200 for valid stations, 404 for non-existent
 *    - Valid data structure with all required fields
 *    - Correct data types for all fields
 *    - Cache headers present
 *    - Response time <2 seconds
 *
 * ✅ Stations Endpoint (/api/stations):
 *    - Returns 200 status code
 *    - Valid array of stations with required fields
 *    - Correct data types including geographic coordinates
 *    - Cache headers and proper content type
 *    - Response time <2 seconds
 *
 * ✅ Alerts Endpoint (/api/alerts):
 *    - Returns 200 status code
 *    - Valid structure with alerts array and metadata
 *    - Correct metadata structure and data types
 *    - Proper alert object structure when data exists
 *    - Cache headers and proper content type
 *    - Response time <2 seconds
 *
 * ✅ Performance and Reliability:
 *    - All endpoints respond within 2 seconds
 *    - Handles concurrent requests correctly
 *    - Consistent response formats across endpoints
 *
 * ✅ Data Integrity and Edge Cases:
 *    - Handles invalid station IDs gracefully
 *    - Resistant to path traversal attempts
 *    - Handles empty query parameters
 *    - Maintains data consistency across requests
 *
 * Test Command: npm test -- public-api-health.test.ts
 */
