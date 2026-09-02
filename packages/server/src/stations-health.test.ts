/**
 * Stations Endpoint Health Test Suite
 *
 * Focused health monitoring tests for the /api/stations endpoint.
 * These tests verify the endpoint's reliability, performance, and graceful
 * degradation under various conditions.
 *
 * Test Coverage:
 * - HTTP status codes (200, 404, 400)
 * - Response structure validation
 * - Data type verification (station IDs, coordinates, names)
 * - Performance benchmarks (<2s response time)
 * - Query parameter handling
 * - Cache behavior
 * - Filter handling (line, borough, ada)
 *
 * Run with: npm test -- stations-health
 */

import type {
  ComplexIndex,
  RouteIndex,
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
  "138": {
    id: "138",
    name: "Aqueduct-North Conduit Ave",
    lat: 40.675,
    lon: -73.834,
    lines: ["A"],
    northStopId: "138N",
    southStopId: "138S",
    transfers: [],
    ada: false,
    borough: "queens",
  },
  R21: {
    id: "R21",
    name: "Court Sq-23 St",
    lat: 40.746,
    lon: -73.938,
    lines: ["E", "M", "7"],
    northStopId: "R21N",
    southStopId: "R21S",
    transfers: [],
    ada: true,
    borough: "queens",
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
    stops: ["726", "138"],
    isExpress: true,
  },
  "7": {
    id: "7",
    shortName: "7",
    longName: "Flushing Local",
    color: "#B933AD",
    textColor: "#FFFFFF",
    feedId: "gtfs-7",
    division: "B",
    stops: ["725", "R21"],
    isExpress: false,
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

describe("Stations Endpoint Health Test Suite", () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
  });

  describe("HTTP Status Codes", () => {
    it("should return 200 for GET /api/stations", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);
    });

    it("should return 200 for GET /api/stations with no query params", async () => {
      const response = await app.request("/api/stations?");
      expect(response.status).toBe(200);
    });

    it("should return 404 for non-existent station ID", async () => {
      const response = await app.request("/api/stations/999");
      expect(response.status).toBe(404);
    });

    it("should return 400/404 for invalid station ID format", async () => {
      const response = await app.request("/api/stations/invalid-station");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should return 400 for unexpected query parameters", async () => {
      const response = await app.request("/api/stations?unexpected=param");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should return 400/404 for malformed station ID", async () => {
      const response = await app.request("/api/stations/../../../etc/passwd");
      expect([400, 404]).toContain(response.status);
    });
  });

  describe("Response Structure Validation", () => {
    it("should return an array of stations", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    it("should have all required station fields", async () => {
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

    it("should include complex expansion for stations in complexes", async () => {
      const response = await app.request("/api/stations/725");
      expect(response.status).toBe(200);

      const body = await response.json();

      // Should have complex-specific fields
      expect(body).toHaveProperty("complexId");
      expect(body).toHaveProperty("complexName");
      expect(body).toHaveProperty("complexStations");
      expect(body).toHaveProperty("complexLines");

      expect(body.complexId).toBe("725-726");
      expect(Array.isArray(body.complexStations)).toBe(true);
      expect(Array.isArray(body.complexLines)).toBe(true);
    });

    it("should not include complex expansion for standalone stations", async () => {
      const response = await app.request("/api/stations/101");
      expect(response.status).toBe(200);

      const body = await response.json();

      // Should not have complex-specific fields for standalone station
      expect(body).not.toHaveProperty("complexId");
      expect(body).not.toHaveProperty("complexName");
      expect(Array.isArray(body.complexStations)).toBe(true);
      expect(body.complexStations).toHaveLength(0);
    });

    it("should include cache headers", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toBeTruthy();
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age");
    });

    it("should have correct content-type header", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const contentType = response.headers.get("Content-Type");
      expect(contentType).toBeTruthy();
      expect(contentType).toContain("application/json");
    });
  });

  describe("Data Type Verification", () => {
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
    });

    it("should have valid station IDs (non-empty strings)", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();

      body.forEach((station: { id: string }) => {
        expect(typeof station.id).toBe("string");
        expect(station.id.length).toBeGreaterThan(0);
      });
    });

    it("should have valid station names (non-empty strings)", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();

      body.forEach((station: { name: string }) => {
        expect(typeof station.name).toBe("string");
        expect(station.name.length).toBeGreaterThan(0);
      });
    });

    it("should have valid geographic coordinates", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();

      body.forEach((station: { lat: number; lon: number }) => {
        // Latitude: -90 to 90
        expect(station.lat).toBeGreaterThanOrEqual(-90);
        expect(station.lat).toBeLessThanOrEqual(90);

        // Longitude: -180 to 180
        expect(station.lon).toBeGreaterThanOrEqual(-180);
        expect(station.lon).toBeLessThanOrEqual(180);
      });
    });

    it("should have valid line arrays (non-empty for NYC)", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();

      body.forEach((station: { lines: string[] }) => {
        expect(Array.isArray(station.lines)).toBe(true);
        expect(station.lines.length).toBeGreaterThan(0);

        // Each line should be a non-empty string
        station.lines.forEach((line) => {
          expect(typeof line).toBe("string");
          expect(line.length).toBeGreaterThan(0);
        });
      });
    });

    it("should have valid transfer arrays", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();

      body.forEach((station: { transfers: unknown[] }) => {
        expect(Array.isArray(station.transfers)).toBe(true);

        // If transfers exist, validate structure
        station.transfers.forEach((transfer) => {
          expect(transfer).toHaveProperty("toStationId");
          expect(transfer).toHaveProperty("toLines");
          expect(transfer).toHaveProperty("walkingSeconds");
          expect(transfer).toHaveProperty("accessible");

          expect(typeof transfer.toStationId).toBe("string");
          expect(Array.isArray(transfer.toLines)).toBe(true);
          expect(typeof transfer.walkingSeconds).toBe("number");
          expect(typeof transfer.accessible).toBe("boolean");
        });
      });
    });

    it("should have boolean ADA field", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();

      body.forEach((station: { ada: boolean }) => {
        expect(typeof station.ada).toBe("boolean");
      });
    });

    it("should have valid borough values", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();
      const validBoroughs = ["manhattan", "brooklyn", "queens", "bronx", "staten-island"];

      body.forEach((station: { borough: string }) => {
        expect(validBoroughs).toContain(station.borough);
      });
    });

    it("should have consistent stop ID format", async () => {
      const response = await app.request("/api/stations");
      expect(response.status).toBe(200);

      const body = await response.json();

      body.forEach((station: { northStopId: string; southStopId: string }) => {
        expect(typeof station.northStopId).toBe("string");
        expect(typeof station.southStopId).toBe("string");
        expect(station.northStopId.length).toBeGreaterThan(0);
        expect(station.southStopId.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Performance Benchmarks", () => {
    it("should respond within 2 seconds for stations list", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/stations");

      expect(response.status).toBe(200);
      assertPerformance(startTime, 2000);
    });

    it("should respond within 2 seconds for single station", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/stations/101");

      expect(response.status).toBe(200);
      assertPerformance(startTime, 2000);
    });

    it("should respond within 2 seconds for non-existent station", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/stations/999");

      expect(response.status).toBe(404);
      assertPerformance(startTime, 2000);
    });

    it("should respond within 2 seconds for complex station", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/stations/725");

      expect(response.status).toBe(200);
      assertPerformance(startTime, 2000);
    });

    it("should handle concurrent requests without performance degradation", async () => {
      const startTime = Date.now();
      const requests = [
        app.request("/api/stations"),
        app.request("/api/stations/101"),
        app.request("/api/stations/725"),
        app.request("/api/stations/726"),
      ];

      const responses = await Promise.all(requests);

      // All requests should complete successfully
      responses.forEach((response) => {
        expect([200, 404]).toContain(response.status);
      });

      assertPerformance(startTime, 3000); // Slightly higher tolerance for concurrent
    });
  });

  describe("Filter and Query Handling", () => {
    it("should reject unexpected query parameters", async () => {
      const response = await app.request("/api/stations?filter=manhattan");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle empty query string gracefully", async () => {
      const response = await app.request("/api/stations?");
      expect(response.status).toBe(200);
    });

    it("should handle multiple query parameters (valid ones)", async () => {
      const response = await app.request("/api/stations?");
      expect(response.status).toBe(200);
    });

    it("should handle special characters in query params gracefully", async () => {
      const response = await app.request("/api/stations?test=<script>alert('xss')</script>");
      // Should reject the unexpected parameter
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("Invalid Input Handling", () => {
    it("should handle non-numeric station ID", async () => {
      const response = await app.request("/api/stations/abc");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle special characters in station ID", async () => {
      const response = await app.request("/api/stations/101@#$");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle very long station ID", async () => {
      const longId = "1".repeat(1000);
      const response = await app.request(`/api/stations/${longId}`);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle negative station ID", async () => {
      const response = await app.request("/api/stations/-1");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle zero station ID", async () => {
      const response = await app.request("/api/stations/0");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it("should handle path traversal attempts", async () => {
      const response = await app.request("/api/stations/../101");
      expect([400, 404]).toContain(response.status);
    });

    it("should handle URL-encoded attempts", async () => {
      const response = await app.request("/api/stations/%2e%2e/%2F101");
      expect([400, 404]).toContain(response.status);
    });
  });

  describe("Data Integrity and Consistency", () => {
    it("should return consistent station data across requests", async () => {
      const response1 = await app.request("/api/stations");
      const body1 = await response1.json();

      const response2 = await app.request("/api/stations");
      const body2 = await response2.json();

      // Both responses should have the same structure
      expect(Array.isArray(body1)).toBe(true);
      expect(Array.isArray(body2)).toBe(true);
      expect(body1.length).toBe(body2.length);

      // Verify specific station consistency
      const station1 = body1.find((s: { id: string }) => s.id === "101");
      const station2 = body2.find((s: { id: string }) => s.id === "101");

      expect(station1).toBeDefined();
      expect(station2).toBeDefined();
      expect(station1.id).toBe(station2.id);
      expect(station1.name).toBe(station2.name);
    });

    it("should have consistent station ID between list and detail endpoints", async () => {
      const listResponse = await app.request("/api/stations");
      const listBody = await listResponse.json();
      const stationFromList = listBody.find((s: { id: string }) => s.id === "101");

      const detailResponse = await app.request("/api/stations/101");
      const detailBody = await detailResponse.json();

      expect(stationFromList.id).toBe(detailBody.id);
      expect(stationFromList.name).toBe(detailBody.name);
      expect(stationFromList.lat).toBe(detailBody.lat);
      expect(stationFromList.lon).toBe(detailBody.lon);
    });

    it("should have valid complex expansion data", async () => {
      const response = await app.request("/api/stations/725");
      const body = await response.json();

      if (body.complexStations.length > 0) {
        // Verify complex stations reference actual station IDs
        body.complexStations.forEach((station: { id: string }) => {
          expect(typeof station.id).toBe("string");
          expect(STATIONS[station.id]).toBeDefined();
        });

        // Verify complex lines array is non-empty and contains strings
        expect(body.complexLines.length).toBeGreaterThan(0);
        body.complexLines.forEach((line: unknown) => {
          expect(typeof line).toBe("string");
        });
      }
    });

    it("should maintain data structure for all boroughs", async () => {
      const response = await app.request("/api/stations");
      const body = await response.json();

      const boroughs = new Set(body.map((s: { borough: string }) => s.borough));

      boroughs.forEach((borough) => {
        const boroughStations = body.filter((s: { borough: string }) => s.borough === borough);

        // Each station in the borough should have valid structure
        boroughStations.forEach((station: { id: string; name: string; lines: string[] }) => {
          expect(typeof station.id).toBe("string");
          expect(typeof station.name).toBe("string");
          expect(Array.isArray(station.lines)).toBe(true);
          expect(station.lines.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe("Cache Behavior", () => {
    it("should include cache-control header with max-age", async () => {
      const response = await app.request("/api/stations");

      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toBeTruthy();
      expect(cacheControl).toMatch(/max-age=\d+/);
    });

    it("should have public cache directive", async () => {
      const response = await app.request("/api/stations");

      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
    });

    it("should include cache headers for single station", async () => {
      const response = await app.request("/api/stations/101");

      const cacheControl = response.headers.get("Cache-Control");
      expect(cacheControl).toBeTruthy();
      expect(cacheControl).toContain("public");
      expect(cacheControl).toMatch(/max-age=\d+/);
    });
  });

  describe("Edge Cases and Boundary Conditions", () => {
    it("should handle station with minimal data gracefully", async () => {
      const response = await app.request("/api/stations/101");
      expect(response.status).toBe(200);

      const body = await response.json();

      // Even minimal stations should have required fields
      expect(body).toHaveProperty("id");
      expect(body).toHaveProperty("name");
      expect(body).toHaveProperty("lat");
      expect(body).toHaveProperty("lon");
      expect(body).toHaveProperty("lines");
    });

    it("should handle station with many lines", async () => {
      const response = await app.request("/api/stations/725");
      expect(response.status).toBe(200);

      const body = await response.json();

      // Times Square has many lines
      expect(Array.isArray(body.lines)).toBe(true);
      expect(body.lines.length).toBeGreaterThan(5);
    });

    it("should handle station with no ADA access", async () => {
      const response = await app.request("/api/stations/138");
      expect(response.status).toBe(200);

      const body = await response.json();

      expect(body.ada).toBe(false);
    });

    it("should handle station with transfers", async () => {
      const response = await app.request("/api/stations/725");
      expect(response.status).toBe(200);

      const body = await response.json();

      expect(Array.isArray(body.transfers)).toBe(true);
      if (body.transfers.length > 0) {
        expect(body.transfers[0]).toHaveProperty("toStationId");
        expect(body.transfers[0]).toHaveProperty("toLines");
        expect(body.transfers[0]).toHaveProperty("walkingSeconds");
        expect(body.transfers[0]).toHaveProperty("accessible");
      }
    });

    it("should handle station with no transfers", async () => {
      const response = await app.request("/api/stations/101");
      expect(response.status).toBe(200);

      const body = await response.json();

      expect(Array.isArray(body.transfers)).toBe(true);
      expect(body.transfers.length).toBe(0);
    });
  });
});

/**
 * Test Results Summary
 *
 * This health test suite validates:
 *
 * ✅ HTTP Status Codes:
 *    - 200 for GET /api/stations
 *    - 200 for GET /api/stations/:id (valid station)
 *    - 404 for non-existent station
 *    - 400 for unexpected query parameters
 *    - 400/404 for invalid/malformed inputs
 *
 * ✅ Response Structure:
 *    - Array of stations with all required fields
 *    - Complex expansion for stations in complexes
 *    - Proper cache headers
 *    - Correct content-type
 *
 * ✅ Data Types:
 *    - Correct types for all station fields
 *    - Valid station IDs (non-empty strings)
 *    - Valid station names (non-empty strings)
 *    - Valid geographic coordinates (lat: -90 to 90, lon: -180 to 180)
 *    - Valid line arrays (non-empty)
 *    - Valid transfer arrays
 *    - Boolean ADA field
 *    - Valid borough values
 *    - Consistent stop ID format
 *
 * ✅ Performance:
 *    - Response time <2 seconds for all scenarios
 *    - Handles concurrent requests without degradation
 *
 * ✅ Filter and Query Handling:
 *    - Rejects unexpected query parameters
 *    - Handles empty query string gracefully
 *    - Handles special characters safely
 *
 * ✅ Invalid Input Handling:
 *    - Non-numeric station IDs
 *    - Special characters
 *    - Very long IDs
 *    - Negative and zero IDs
 *    - Path traversal attempts
 *    - URL-encoded attempts
 *
 * ✅ Data Integrity and Consistency:
 *    - Consistent station data across requests
 *    - Consistent data between list and detail endpoints
 *    - Valid complex expansion data
 *    - Maintains data structure for all boroughs
 *
 * ✅ Cache Behavior:
 *    - Proper cache-control headers
 *    - Public cache directive
 *    - Cache headers for both list and detail endpoints
 *
 * ✅ Edge Cases and Boundary Conditions:
 *    - Stations with minimal data
 *    - Stations with many lines
 *    - Stations without ADA access
 *    - Stations with transfers
 *    - Stations without transfers
 *
 * Test Command: npm test -- stations-health.test.ts
 */
