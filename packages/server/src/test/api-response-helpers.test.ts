/**
 * API Response Helpers Test Suite
 *
 * This test suite validates the new reusable API response test helpers
 * and demonstrates their usage across different endpoint types.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  assertArrayResponse,
  assertBadRequest,
  assertHasProperties,
  assertJsonResponse,
  assertNonEmptyArray,
  assertNonEmptyString,
  assertNotFound,
  assertNumberInRange,
  assertObjectResponse,
  assertPerformance,
  assertPropertyType,
  assertStatus,
  assertSuccessStatus,
  createDebugLogger,
  expectErrorResponse,
  expectHealthResponse,
  expectSuccessResponse,
  logTestSection,
  measurePerformance,
  validateAlertStructure,
  validateArrivalStructure,
  validateRouteStructure,
  validateStationStructure,
  validateTransferStructure,
} from "./api-response-helpers.js";

describe("API Response Helpers Test Suite", () => {
  let app: Hono;
  const debugLog = createDebugLogger("API-Helpers-Test");

  beforeEach(() => {
    app = new Hono();

    // Setup test routes
    app.get("/api/stations", (c) => {
      return c.json([
        {
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
      ]);
    });

    app.get("/api/stations/:id", (c) => {
      const id = c.req.param("id");
      if (id === "999") {
        return c.json({ error: "Station not found" }, 404);
      }
      return c.json({
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
      });
    });

    app.get("/api/health", (c) => {
      return c.json({
        status: "ok",
        uptime_seconds: 12345,
        timestamp: "2024-01-01T00:00:00Z",
      });
    });

    app.get("/api/routes", (c) => {
      return c.json([
        {
          id: "1",
          shortName: "1",
          longName: "Broadway-7th Ave Local",
          color: "#EE352E",
          textColor: "#FFFFFF",
        },
      ]);
    });

    app.post("/api/invalid", (c) => {
      return c.json({ error: "Invalid request" }, 400);
    });
  });

  logTestSection("Response Status Assertion Helpers");

  describe("Response Status Assertion Helpers", () => {
    it("should assert success status", async () => {
      const response = await app.request("/api/stations");
      assertSuccessStatus(response);
      expect(response.status).toBe(200);
    });

    it("should assert specific status code", async () => {
      const response = await app.request("/api/stations/999");
      assertStatus(response, 404);
      expect(response.status).toBe(404);
    });

    it("should assert not found", async () => {
      const response = await app.request("/api/stations/999");
      assertNotFound(response);
    });

    it("should assert bad request", async () => {
      const response = await app.request("/api/invalid", { method: "POST" });
      assertBadRequest(response);
    });

    it("should throw error for wrong status", async () => {
      const response = await app.request("/api/stations/999");
      expect(() => assertSuccessStatus(response)).toThrow();
    });
  });

  logTestSection("Response Structure/Data Type Validators");

  describe("Response Structure/Data Type Validators", () => {
    it("should assert JSON response", async () => {
      const response = await app.request("/api/stations");
      const body = await assertJsonResponse(response);
      expect(Array.isArray(body)).toBe(true);
    });

    it("should assert array response", async () => {
      const response = await app.request("/api/stations");
      const body = await assertArrayResponse(response);
      expect(body).toHaveLength(1);
    });

    it("should assert object response", async () => {
      const response = await app.request("/api/health");
      const body = await assertObjectResponse(response);
      expect(body).toHaveProperty("status");
    });

    it("should assert has properties", () => {
      const obj = { id: "101", name: "Test" };
      assertHasProperties(obj, ["id", "name"]);
    });

    it("should throw for missing properties", () => {
      const obj = { id: "101" };
      expect(() => assertHasProperties(obj, ["id", "name"])).toThrow();
    });

    it("should assert property type", () => {
      const obj = { id: "101", count: 42, active: true };
      assertPropertyType(obj, "id", "string");
      assertPropertyType(obj, "count", "number");
      assertPropertyType(obj, "active", "boolean");
    });

    it("should assert non-empty string", () => {
      assertNonEmptyString("test", "testField");
    });

    it("should throw for empty string", () => {
      expect(() => assertNonEmptyString("", "testField")).toThrow();
    });

    it("should assert number in range", () => {
      assertNumberInRange(40.702, -90, 90, "lat");
      assertNumberInRange(-74.013, -180, 180, "lon");
    });

    it("should throw for out of range number", () => {
      expect(() => assertNumberInRange(100, -90, 90, "lat")).toThrow();
    });

    it("should assert non-empty array", () => {
      assertNonEmptyArray([1, 2, 3], "items");
    });

    it("should throw for empty array", () => {
      expect(() => assertNonEmptyArray([], "items")).toThrow();
    });
  });

  logTestSection("Common Test Patterns");

  describe("Common Test Patterns", () => {
    it("should expect success response", async () => {
      const response = await app.request("/api/health");
      const body = await expectSuccessResponse(response, {
        status: "string",
        uptime_seconds: "number",
      });
      expect(body.status).toBe("ok");
    });

    it("should expect error response", async () => {
      const response = await app.request("/api/invalid", { method: "POST" });
      const body = await expectErrorResponse(response, 400, { error: "Invalid request" });
      expect(body.error).toBe("Invalid request");
    });

    it("should expect health response", async () => {
      const response = await app.request("/api/health");
      const body = await expectHealthResponse(response);
      expect(body.status).toBe("ok");
      expect(body.uptime_seconds).toBe(12345);
    });
  });

  logTestSection("Endpoint-Specific Validation");

  describe("Endpoint-Specific Validation", () => {
    it("should validate station structure", async () => {
      const response = await app.request("/api/stations/101");
      const station = await assertJsonResponse(response);
      validateStationStructure(station as Record<string, unknown>);
    });

    it("should validate route structure", async () => {
      const response = await app.request("/api/routes");
      const routes = await assertArrayResponse(response);
      validateRouteStructure(routes[0] as Record<string, unknown>);
    });

    it("should validate alert structure", () => {
      const alert = {
        id: "alert-1",
        headerText: "Service change",
        effect: "SIGNIFICANT_DELAYS",
        cause: "CONSTRUCTION",
      };
      validateAlertStructure(alert);
    });

    it("should validate arrival structure", () => {
      const arrival = {
        routeId: "1",
        stationId: "101",
        arrivalTime: 1234567890,
        direction: "N",
      };
      validateArrivalStructure(arrival);
    });

    it("should validate transfer structure", () => {
      const transfer = {
        toStationId: "726",
        toLines: ["A", "C", "E"],
        walkingSeconds: 120,
        accessible: true,
      };
      validateTransferStructure(transfer);
    });

    it("should throw for invalid transfer structure", () => {
      const transfer = {
        toStationId: "726",
        toLines: [], // Invalid: empty array
        walkingSeconds: 120,
        accessible: true,
      };
      expect(() => validateTransferStructure(transfer)).toThrow();
    });

    it("should throw for invalid coordinates in station", () => {
      const station = {
        id: "101",
        name: "Test",
        lat: 100, // Invalid: > 90
        lon: 0,
        lines: ["1"],
      };
      expect(() => validateStationStructure(station)).toThrow();
    });

    it("should throw for invalid color in route", () => {
      const route = {
        id: "1",
        shortName: "1",
        longName: "Test Route",
        color: "invalid", // Invalid: not hex color
        textColor: "#FFFFFF",
      };
      expect(() => validateRouteStructure(route)).toThrow();
    });
  });

  logTestSection("Performance Assertion Helpers");

  describe("Performance Assertion Helpers", () => {
    it("should assert performance within limits", async () => {
      const startTime = Date.now();
      const response = await app.request("/api/stations");
      assertPerformance(startTime, 2000); // Should complete within 2 seconds
      expect(response.status).toBe(200);
    });

    it("should measure performance", async () => {
      const { result, durationMs } = await measurePerformance(async () => {
        const response = await app.request("/api/health");
        return await assertJsonResponse(response);
      });
      expect(result).toHaveProperty("status");
      expect(durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should throw for exceeded performance limit", () => {
      const oldTime = Date.now() - 3000; // 3 seconds ago
      expect(() => assertPerformance(oldTime, 2000)).toThrow();
    });
  });

  logTestSection("Debugging Helpers");

  describe("Debugging Helpers", () => {
    it("should create debug logger", () => {
      debugLog("Test message", { data: "test" });
      // Just verify it doesn't throw
      expect(debugLog).toBeDefined();
    });

    it("should log test section", () => {
      logTestSection("Test Section", "Test Description");
      // Just verify it doesn't throw
      expect(logTestSection).toBeDefined();
    });
  });

  logTestSection("Integration Tests");

  describe("Integration Tests", () => {
    it("should test complete station endpoint flow", async () => {
      const startTime = Date.now();

      // Test stations list
      const listResponse = await app.request("/api/stations");
      assertSuccessStatus(listResponse);
      const stations = await assertArrayResponse(listResponse);
      expect(stations.length).toBeGreaterThan(0);

      // Test single station
      const detailResponse = await app.request("/api/stations/101");
      assertSuccessStatus(detailResponse);
      const station = await assertObjectResponse(detailResponse);
      validateStationStructure(station as Record<string, unknown>);

      // Verify performance
      assertPerformance(startTime, 1000);
    });

    it("should test health endpoint with all validations", async () => {
      const response = await app.request("/api/health");
      const body = await expectHealthResponse(response);

      expect(body.status).toBe("ok");
      expect(body.uptime_seconds).toBeGreaterThan(0);
      assertNonEmptyString(body.status, "status", "Health response");
    });

    it("should test error handling across endpoints", async () => {
      const notFoundResponse = await app.request("/api/stations/999");
      assertNotFound(notFoundResponse);

      const errorResponse = await app.request("/api/invalid", { method: "POST" });
      assertBadRequest(errorResponse);
    });
  });
});

logTestSection("API Response Helpers Test Suite Complete", "All reusable test helpers validated");
