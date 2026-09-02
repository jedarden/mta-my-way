/**
 * Tests for Response Validation Utilities
 *
 * Comprehensive tests for all validation functions to ensure they work correctly
 * with various input scenarios and provide appropriate error messages.
 */

import { describe, expect, it } from "vitest";
import {
  type ValidationResult,
  assertValid,
  assertValidation,
  formatValidationResult,
  validateAlert,
  validateArrayLength,
  validateArrival,
  validateArrivalListResponse,
  validateAtLeastOneField,
  validateBodyType,
  validateClientError,
  validateDelayPrediction,
  validateEquipmentStatus,
  validateHealthResponse,
  validateRequiredFields,
  validateRoute,
  validateServerError,
  validateStation,
  validateStationListResponse,
  validateStatusCode,
  validateSuccessfulResponse,
  validateTripRecord,
} from "./response-validation";

describe("Status Code Validation", () => {
  describe("validateStatusCode", () => {
    it("should validate matching status code", () => {
      const response = new Response(null, { status: 200 });
      const result = validateStatusCode(response, 200);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate against multiple acceptable status codes", () => {
      const response = new Response(null, { status: 304 });
      const result = validateStatusCode(response, [200, 304]);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect mismatched status code", () => {
      const response = new Response(null, { status: 404 });
      const result = validateStatusCode(response, 200);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Expected status 200 (OK)");
      expect(result.errors[0]).toContain("but got 404 (Not Found)");
    });

    it("should provide warnings for 4xx client errors", () => {
      const response = new Response(null, { status: 401 });
      const result = validateStatusCode(response, 200);

      expect(result.isValid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Client error 401");
    });

    it("should provide warnings for 5xx server errors", () => {
      const response = new Response(null, { status: 503 });
      const result = validateStatusCode(response, 200);

      expect(result.isValid).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Server error 503");
    });

    it("should handle 503 with specific unavailable warning", () => {
      const response = new Response(null, { status: 503 });
      const result = validateServerError(response, 503);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        "Service Unavailable: Feature may be disabled or temporarily down"
      );
    });

    it("should handle 504 with timeout warning", () => {
      const response = new Response(null, { status: 504 });
      const result = validateServerError(response, 504);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        "Gateway Timeout: Upstream service did not respond in time"
      );
    });
  });

  describe("validateSuccessfulResponse", () => {
    it("should accept 2xx status codes", () => {
      const response = new Response(null, { status: 200 });
      const result = validateSuccessfulResponse(response);

      expect(result.isValid).toBe(true);
    });

    it("should accept 201 created", () => {
      const response = new Response(null, { status: 201 });
      const result = validateSuccessfulResponse(response);

      expect(result.isValid).toBe(true);
    });

    it("should reject 4xx status codes", () => {
      const response = new Response(null, { status: 404 });
      const result = validateSuccessfulResponse(response);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("404");
    });

    it("should reject 5xx status codes", () => {
      const response = new Response(null, { status: 500 });
      const result = validateSuccessfulResponse(response);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("500");
    });
  });

  describe("validateClientError", () => {
    it("should accept 404 not found", () => {
      const response = new Response(null, { status: 404 });
      const result = validateClientError(response);

      expect(result.isValid).toBe(true);
    });

    it("should accept 401 unauthorized", () => {
      const response = new Response(null, { status: 401 });
      const result = validateClientError(response);

      expect(result.isValid).toBe(true);
    });

    it("should reject 2xx status codes", () => {
      const response = new Response(null, { status: 200 });
      const result = validateClientError(response);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Expected client error (4xx)");
    });

    it("should reject 5xx status codes", () => {
      const response = new Response(null, { status: 500 });
      const result = validateClientError(response);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Expected client error (4xx)");
    });

    it("should validate specific client error code", () => {
      const response = new Response(null, { status: 404 });
      const result = validateClientError(response, 404);

      expect(result.isValid).toBe(true);
    });

    it("should reject wrong specific client error code", () => {
      const response = new Response(null, { status: 401 });
      const result = validateClientError(response, 404);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Expected client error 404, but got 401");
    });
  });

  describe("validateServerError", () => {
    it("should accept 503 service unavailable", () => {
      const response = new Response(null, { status: 503 });
      const result = validateServerError(response);

      expect(result.isValid).toBe(true);
    });

    it("should accept 500 internal server error", () => {
      const response = new Response(null, { status: 500 });
      const result = validateServerError(response);

      expect(result.isValid).toBe(true);
    });

    it("should reject 2xx status codes", () => {
      const response = new Response(null, { status: 200 });
      const result = validateServerError(response);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Expected server error (5xx)");
    });

    it("should reject 4xx status codes", () => {
      const response = new Response(null, { status: 404 });
      const result = validateServerError(response);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Expected server error (5xx)");
    });
  });
});

describe("Response Structure Validation", () => {
  describe("validateRequiredFields", () => {
    it("should validate all required fields present", () => {
      const data = { id: "123", name: "Test", lines: ["1", "2"] };
      const result = validateRequiredFields(data, ["id", "name", "lines"]);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing required field", () => {
      const data = { id: "123", name: "Test" };
      const result = validateRequiredFields(data, ["id", "name", "lines"]);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Missing required field: 'lines'");
    });

    it("should detect multiple missing fields", () => {
      const data = { id: "123" };
      const result = validateRequiredFields(data, ["id", "name", "lines"]);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it("should warn for null required fields", () => {
      const data = { id: "123", name: null, lines: ["1"] };
      const result = validateRequiredFields(data, ["id", "name", "lines"]);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Required field 'name' is null");
    });

    it("should support nested field validation with dot notation", () => {
      const data = { user: { id: "123", preferences: { theme: "dark" } } };
      const result = validateRequiredFields(data, ["user.id", "user.preferences.theme"]);

      expect(result.isValid).toBe(true);
    });

    it("should detect missing nested fields", () => {
      const data = { user: { id: "123" } };
      const result = validateRequiredFields(data, ["user.id", "user.preferences.theme"]);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("Missing required field: 'user.preferences.theme'");
    });
  });

  describe("validateAtLeastOneField", () => {
    it("should accept when one field is present", () => {
      const data = { userId: "123" };
      const result = validateAtLeastOneField(data, ["userId", "guestId"]);

      expect(result.isValid).toBe(true);
    });

    it("should accept when multiple fields are present", () => {
      const data = { userId: "123", guestId: "456" };
      const result = validateAtLeastOneField(data, ["userId", "guestId"]);

      expect(result.isValid).toBe(true);
    });

    it("should reject when no fields are present", () => {
      const data = { sessionId: "789" };
      const result = validateAtLeastOneField(data, ["userId", "guestId"]);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("at least one of these fields: userId, guestId");
    });
  });

  describe("validateBodyType", () => {
    it("should validate object type", () => {
      const data = { id: "123" };
      const result = validateBodyType(data, "object");

      expect(result.isValid).toBe(true);
    });

    it("should validate array type", () => {
      const data = [1, 2, 3];
      const result = validateBodyType(data, "array");

      expect(result.isValid).toBe(true);
    });

    it("should validate string type", () => {
      const result = validateBodyType("test", "string");

      expect(result.isValid).toBe(true);
    });

    it("should validate number type", () => {
      const result = validateBodyType(42, "number");

      expect(result.isValid).toBe(true);
    });

    it("should reject mismatched type", () => {
      const result = validateBodyType({ id: "123" }, "array");

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Expected body type 'array', but got 'object'");
    });
  });

  describe("validateArrayLength", () => {
    it("should validate array meets minimum length", () => {
      const data = [1, 2, 3, 4, 5];
      const result = validateArrayLength(data, 3);

      expect(result.isValid).toBe(true);
    });

    it("should warn when array is below minimum length", () => {
      const data = [1, 2];
      const result = validateArrayLength(data, 3);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("Array length 2 is less than minimum 3");
    });

    it("should reject non-array input", () => {
      const data = "not an array";
      const result = validateArrayLength(data, 1);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("Expected array, but got string");
    });
  });
});

describe("MTA Data Type Validators", () => {
  describe("validateStation", () => {
    it("should validate complete station object", () => {
      const station = {
        id: "725",
        name: "Times Square-42 St",
        lat: 40.7589,
        lon: -73.9851,
        lines: ["1", "2", "3"],
        northStopId: "725N",
        southStopId: "725S",
        transfers: [],
        ada: true,
        borough: "manhattan",
      };

      const result = validateStation(station);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect missing required station fields", () => {
      const station = { id: "725", name: "Times Square" };
      const result = validateStation(station);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should validate latitude range", () => {
      const station = {
        id: "725",
        name: "Times Square",
        lat: 95, // Invalid latitude
        lon: -73.9851,
        lines: ["1"],
        northStopId: "725N",
        southStopId: "725S",
        transfers: [],
        ada: true,
        borough: "manhattan",
      };

      const result = validateStation(station);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("lat"))).toBe(true);
    });

    it("should validate longitude range", () => {
      const station = {
        id: "725",
        name: "Times Square",
        lat: 40.7589,
        lon: -185, // Invalid longitude
        lines: ["1"],
        northStopId: "725N",
        southStopId: "725S",
        transfers: [],
        ada: true,
        borough: "manhattan",
      };

      const result = validateStation(station);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("lon"))).toBe(true);
    });

    it("should warn about empty lines array", () => {
      const station = {
        id: "725",
        name: "Times Square",
        lat: 40.7589,
        lon: -73.9851,
        lines: [],
        northStopId: "725N",
        southStopId: "725S",
        transfers: [],
        ada: true,
        borough: "manhattan",
      };

      const result = validateStation(station);

      expect(result.warnings.some((w) => w.includes("empty"))).toBe(true);
    });

    it("should warn about unrecognized borough", () => {
      const station = {
        id: "725",
        name: "Times Square",
        lat: 40.7589,
        lon: -73.9851,
        lines: ["1"],
        northStopId: "725N",
        southStopId: "725S",
        transfers: [],
        ada: true,
        borough: "unknown-borough",
      };

      const result = validateStation(station);

      expect(result.warnings.some((w) => w.includes("not a recognized borough"))).toBe(true);
    });

    it("should reject non-object input", () => {
      const result = validateStation("not a station");

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("must be an object");
    });
  });

  describe("validateRoute", () => {
    it("should validate complete route object", () => {
      const route = {
        id: "1",
        shortName: "1",
        longName: "Broadway-7th Ave Local",
        color: "#EE352E",
        textColor: "#FFFFFF",
        feedId: "gtfs",
        division: "A",
        stops: ["101", "102", "103"],
        isExpress: false,
      };

      const result = validateRoute(route);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate hex color format", () => {
      const route = {
        id: "1",
        shortName: "1",
        longName: "Broadway-7th Ave Local",
        color: "EE352E", // Missing # prefix
        textColor: "#FFFFFF",
        feedId: "gtfs",
        division: "A",
        stops: ["101"],
        isExpress: false,
      };

      const result = validateRoute(route);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("hex color"))).toBe(true);
    });

    it("should warn about unrecognized division", () => {
      const route = {
        id: "1",
        shortName: "1",
        longName: "Broadway-7th Ave Local",
        color: "#EE352E",
        textColor: "#FFFFFF",
        feedId: "gtfs",
        division: "X", // Invalid division
        stops: ["101"],
        isExpress: false,
      };

      const result = validateRoute(route);

      expect(result.warnings.some((w) => w.includes("not a recognized division"))).toBe(true);
    });

    it("should warn about empty stops array", () => {
      const route = {
        id: "1",
        shortName: "1",
        longName: "Broadway-7th Ave Local",
        color: "#EE352E",
        textColor: "#FFFFFF",
        feedId: "gtfs",
        division: "A",
        stops: [],
        isExpress: false,
      };

      const result = validateRoute(route);

      expect(result.warnings.some((w) => w.includes("empty"))).toBe(true);
    });
  });

  describe("validateArrival", () => {
    it("should validate complete arrival object", () => {
      const arrival = {
        line: "1",
        direction: "N",
        arrivalTime: Date.now() + 120000,
        minutesAway: 2,
        isAssigned: true,
        isRerouted: false,
        tripId: "trip_123",
        destination: "Van Cortlandt Park",
        confidence: "high",
        feedName: "gtfs",
        feedAge: 8,
      };

      const result = validateArrival(arrival);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate direction values", () => {
      const arrival = {
        line: "1",
        direction: "UP", // Invalid direction
        arrivalTime: Date.now() + 120000,
        minutesAway: 2,
      };

      const result = validateArrival(arrival);

      expect(result.warnings.some((w) => w.includes("not a recognized direction"))).toBe(true);
    });

    it("should warn about negative minutes away", () => {
      const arrival = {
        line: "1",
        direction: "N",
        arrivalTime: Date.now() + 120000,
        minutesAway: -1, // Negative - train may have departed
      };

      const result = validateArrival(arrival);

      expect(result.warnings.some((w) => w.includes("negative"))).toBe(true);
    });

    it("should warn about high minutes away (stale data)", () => {
      const arrival = {
        line: "1",
        direction: "N",
        arrivalTime: Date.now() + 120000,
        minutesAway: 45, // Very high - data may be stale
      };

      const result = validateArrival(arrival);

      expect(result.warnings.some((w) => w.includes("may be stale"))).toBe(true);
    });

    it("should validate confidence values", () => {
      const arrival = {
        line: "1",
        direction: "N",
        arrivalTime: Date.now() + 120000,
        minutesAway: 2,
        confidence: "unknown", // Invalid confidence
      };

      const result = validateArrival(arrival);

      expect(result.warnings.some((w) => w.includes("not recognized"))).toBe(true);
    });
  });

  describe("validateAlert", () => {
    it("should validate complete alert object", () => {
      const alert = {
        id: "alert_123",
        severity: "warning",
        headline: "Delays on 1 train",
        description: "1 trains running with delays",
        affectedLines: ["1"],
        activePeriod: {
          start: Date.now() - 3600000,
          end: Date.now() + 7200000,
        },
        cause: "SIGNAL_PROBLEM",
        effect: "DELAY",
      };

      const result = validateAlert(alert);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate severity values", () => {
      const alert = {
        id: "alert_123",
        severity: "critical", // Invalid severity
        headline: "Delays on 1 train",
      };

      const result = validateAlert(alert);

      expect(result.warnings.some((w) => w.includes("not recognized"))).toBe(true);
    });

    it("should validate active period structure", () => {
      const alert = {
        id: "alert_123",
        severity: "warning",
        headline: "Delays on 1 train",
        activePeriod: {
          start: "not a number", // Invalid
          end: Date.now() + 7200000,
        },
      };

      const result = validateAlert(alert);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("activePeriod.start"))).toBe(true);
    });
  });

  describe("validateTripRecord", () => {
    it("should validate complete trip record", () => {
      const trip = {
        id: "trip_123",
        date: "2026-09-02",
        origin: {
          id: "725",
          name: "Times Square",
          lat: 40.7589,
          lon: -73.9851,
          lines: ["1"],
          northStopId: "725N",
          southStopId: "725S",
          transfers: [],
          ada: true,
          borough: "manhattan",
        },
        destination: {
          id: "726",
          name: "Penn Station",
          lat: 40.756,
          lon: -73.988,
          lines: ["1", "2", "3"],
          northStopId: "726N",
          southStopId: "726S",
          transfers: [],
          ada: true,
          borough: "manhattan",
        },
        line: "1",
        departureTime: Date.now() - 3600000,
        arrivalTime: Date.now() - 1800000,
        actualDurationMinutes: 30,
        source: "tracked",
      };

      const result = validateTripRecord(trip);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate date format", () => {
      const trip = {
        id: "trip_123",
        date: "2026/09/02", // Wrong format
        line: "1",
        source: "tracked",
      };

      const result = validateTripRecord(trip);

      expect(result.warnings.some((w) => w.includes("YYYY-MM-DD"))).toBe(true);
    });
  });

  describe("validateEquipmentStatus", () => {
    it("should validate complete equipment status", () => {
      const equipment = {
        stationId: "725",
        equipmentType: "escalator",
        status: "operational",
        description: "Main entrance escalator",
      };

      const result = validateEquipmentStatus(equipment);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate equipment type", () => {
      const equipment = {
        stationId: "725",
        equipmentType: "moving-walkway", // Invalid type
        status: "operational",
      };

      const result = validateEquipmentStatus(equipment);

      expect(result.warnings.some((w) => w.includes("not recognized"))).toBe(true);
    });

    it("should validate equipment status", () => {
      const equipment = {
        stationId: "725",
        equipmentType: "escalator",
        status: "broken", // Invalid status
      };

      const result = validateEquipmentStatus(equipment);

      expect(result.warnings.some((w) => w.includes("not recognized"))).toBe(true);
    });
  });

  describe("validateDelayPrediction", () => {
    it("should validate complete delay prediction", () => {
      const prediction = {
        routeId: "1",
        predictedDelayMinutes: 5,
        confidence: 0.85,
        timestamp: Date.now(),
        factors: ["weather", "time-of-day"],
      };

      const result = validateDelayPrediction(prediction);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate confidence range", () => {
      const prediction = {
        routeId: "1",
        predictedDelayMinutes: 5,
        confidence: 1.5, // Invalid - must be 0-1
        timestamp: Date.now(),
      };

      const result = validateDelayPrediction(prediction);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("0 and 1"))).toBe(true);
    });

    it("should warn about negative delay predictions", () => {
      const prediction = {
        routeId: "1",
        predictedDelayMinutes: -2,
        confidence: 0.8,
        timestamp: Date.now(),
      };

      const result = validateDelayPrediction(prediction);

      expect(result.warnings.some((w) => w.includes("negative"))).toBe(true);
    });
  });
});

describe("Composite Validators", () => {
  describe("validateStationListResponse", () => {
    it("should validate valid station list response", async () => {
      const stations = [
        {
          id: "725",
          name: "Times Square",
          lat: 40.7589,
          lon: -73.9851,
          lines: ["1"],
          northStopId: "725N",
          southStopId: "725S",
          transfers: [],
          ada: true,
          borough: "manhattan",
        },
      ];

      const response = new Response(JSON.stringify(stations), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateStationListResponse(response);

      expect(result.isValid).toBe(true);
    });

    it("should reject wrong status code", async () => {
      const response = new Response("{}", {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateStationListResponse(response);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("404"))).toBe(true);
    });

    it("should reject non-JSON response", async () => {
      const response = new Response("<html>error</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });

      const result = await validateStationListResponse(response);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("Expected JSON"))).toBe(true);
    });

    it("should reject non-array response", async () => {
      const response = new Response(JSON.stringify({ error: "failed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateStationListResponse(response);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("Expected array"))).toBe(true);
    });

    it("should warn about empty station list", async () => {
      const response = new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateStationListResponse(response);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes("empty"))).toBe(true);
    });
  });

  describe("validateArrivalListResponse", () => {
    it("should validate valid arrival list response", async () => {
      const arrivals = [
        {
          line: "1",
          direction: "N",
          arrivalTime: Date.now() + 120000,
          minutesAway: 2,
        },
      ];

      const response = new Response(JSON.stringify(arrivals), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateArrivalListResponse(response, "725");

      expect(result.isValid).toBe(true);
    });

    it("should warn about empty arrival list", async () => {
      const response = new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateArrivalListResponse(response, "725");

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes("No arrivals available"))).toBe(true);
    });
  });

  describe("validateHealthResponse", () => {
    it("should validate healthy status response", async () => {
      const healthData = { status: "ok", uptime_seconds: 3600 };
      const response = new Response(JSON.stringify(healthData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateHealthResponse(response);

      expect(result.isValid).toBe(true);
    });

    it("should accept degraded health status (503)", async () => {
      const healthData = { status: "degraded", error: "database unavailable" };
      const response = new Response(JSON.stringify(healthData), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateHealthResponse(response);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes("degraded mode"))).toBe(true);
    });

    it("should validate health field presence", async () => {
      const healthData = { healthy: true };
      const response = new Response(JSON.stringify(healthData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateHealthResponse(response);

      expect(result.isValid).toBe(true);
    });

    it("should reject response with no health indicators", async () => {
      const healthData = { data: "random" };
      const response = new Response(JSON.stringify(healthData), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

      const result = await validateHealthResponse(response);

      expect(result.isValid).toBe(false);
    });
  });
});

describe("Helper Functions", () => {
  describe("formatValidationResult", () => {
    it("should format successful validation", () => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      const formatted = formatValidationResult(result, "Station test");

      expect(formatted).toContain("✅ Station test passed");
    });

    it("should format failed validation", () => {
      const result: ValidationResult = {
        isValid: false,
        errors: ["Missing field: id", "Invalid type"],
        warnings: [],
      };

      const formatted = formatValidationResult(result, "Route test");

      expect(formatted).toContain("❌ Route test failed");
      expect(formatted).toContain("Errors:");
      expect(formatted).toContain("  - Missing field: id");
      expect(formatted).toContain("  - Invalid type");
    });

    it("should format warnings", () => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: ["Empty array", "Unrecognized value"],
      };

      const formatted = formatValidationResult(result, "Alert test");

      expect(formatted).toContain("Warnings:");
      expect(formatted).toContain("  ⚠️  Empty array");
    });
  });

  describe("assertValidation", () => {
    it("should not throw for valid result", () => {
      const result: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: [],
      };

      expect(() => assertValidation(result, "Test validation")).not.toThrow();
    });

    it("should throw for invalid result", () => {
      const result: ValidationResult = {
        isValid: false,
        errors: ["Error 1", "Error 2"],
        warnings: [],
      };

      expect(() => assertValidation(result, "Test validation")).toThrow("Test validation");
      expect(() => assertValidation(result, "Test validation")).toThrow("Error 1");
      expect(() => assertValidation(result, "Test validation")).toThrow("Error 2");
    });

    it("should include error details in thrown message", () => {
      const result: ValidationResult = {
        isValid: false,
        errors: ["Missing required field: id"],
        warnings: [],
      };

      expect(() => assertValidation(result, "Station validation")).toThrow(/Station validation/);
      expect(() => assertValidation(result, "Station validation")).toThrow(
        /Missing required field: id/
      );
    });
  });

  describe("assertValid", () => {
    it("should validate and assert in one call", () => {
      const station = {
        id: "725",
        name: "Times Square",
        lat: 40.7589,
        lon: -73.9851,
        lines: ["1"],
        northStopId: "725N",
        southStopId: "725S",
        transfers: [],
        ada: true,
        borough: "manhattan",
      };

      expect(() => assertValid(validateStation, station, "Station")).not.toThrow();
    });

    it("should throw for invalid data", () => {
      const invalidStation = { id: "725" };

      expect(() => assertValid(validateStation, invalidStation, "Station")).toThrow("Station");
    });
  });
});

describe("Integration Tests", () => {
  it("should handle complete validation workflow", async () => {
    // Simulate API response
    const stations = [
      {
        id: "725",
        name: "Times Square",
        lat: 40.7589,
        lon: -73.9851,
        lines: ["1", "2", "3"],
        northStopId: "725N",
        southStopId: "725S",
        transfers: [],
        ada: true,
        borough: "manhattan",
      },
      {
        id: "726",
        name: "Penn Station",
        lat: 40.756,
        lon: -73.988,
        lines: ["A", "C", "E"],
        northStopId: "726N",
        southStopId: "726S",
        transfers: [],
        ada: true,
        borough: "manhattan",
      },
    ];

    const response = new Response(JSON.stringify(stations), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    // Validate response
    const result = await validateStationListResponse(response);

    // Verify validation passed
    expect(result.isValid).toBe(true);

    // Format result for logging
    const formatted = formatValidationResult(result, "Station list API");
    expect(formatted).toContain("✅ Station list API passed");
  });

  it("should handle validation failure with detailed errors", async () => {
    // Simulate invalid API response
    const invalidStation = {
      id: "725",
      name: "Times Square",
      // Missing required fields
    };

    const response = new Response(JSON.stringify([invalidStation]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    // Validate response
    const result = await validateStationListResponse(response);

    // Verify validation failed
    expect(result.isValid).toBe(false);

    // Verify detailed errors
    expect(result.errors.length).toBeGreaterThan(0);

    // Format result should show errors
    const formatted = formatValidationResult(result, "Station list API");
    expect(formatted).toContain("❌ Station list API failed");
    expect(formatted).toContain("Errors:");
  });
});
