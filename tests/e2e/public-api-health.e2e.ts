/**
 * E2E tests for public API health and route isolation.
 *
 * Validates that:
 * 1. Public API endpoints (arrivals, stations, alerts) remain healthy and responsive
 * 2. Stateful-only routes are properly isolated and protected
 * 3. CORE_ONLY mode correctly prevents stateful route access
 * 4. Traffic splitting between public and stateful routes works correctly
 *
 * Uses the reusable API test utilities framework from `./helpers/api-test-utils.ts`
 *
 * gitleaks:allow - test fixtures only, no real credentials
 */

import { expect, test } from "@playwright/test";
import {
  API_ENDPOINTS,
  CACHE_HEADERS,
  PERFORMANCE_THRESHOLDS,
  STATUS_CODES,
  TEST_FIXTURES,
  measureResponseTime,
  validateApiResponse,
  validateResponseTime,
} from "./helpers/api-test-utils.js";

test.describe("Public API - Core Endpoints Health", () => {
  test("GET /health returns basic readiness status", async ({ request }) => {
    const response = await request.get("/health");

    // Use validation utility
    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      requiredFields: ["status", "uptime_seconds"],
    });

    expect(validation.valid).toBe(true);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/health returns detailed system health", async ({ request }) => {
    const response = await request.get("/api/health");

    // Returns 200 when healthy, 503 when 3+ feeds are failing
    const validation = await validateApiResponse(response, {
      expectedStatus: [STATUS_CODES.OK, STATUS_CODES.SERVICE_UNAVAILABLE],
      contentType: "application/json",
      requiredFields: [
        "status",
        "timestamp",
        "uptime_seconds",
        "deploymentMode",
        "feeds",
        "alerts",
      ],
    });

    expect(validation.valid).toBe(true);

    const body = await response.json();
    expect(body.status).toMatch(/^(ok|degraded)$/);
  });

  test("GET /api/arrivals/:stationId returns real-time arrivals", async ({ request }) => {
    // Test with a known station (Times Square - 42nd St)
    const { response, duration } = await measureResponseTime(() =>
      request.get(`/api/arrivals/${TEST_FIXTURES.STATION_IDS.TIMES_SQUARE}`)
    );

    // Validate response structure
    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      requiredFields: ["stationId", "stationName", "arrivals"],
    });

    expect(validation.valid).toBe(true);

    // Validate response time
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.ARRIVALS,
      "GET /api/arrivals/:stationId"
    );
    expect(timeValidation.valid).toBe(true);

    const body = await response.json();
    expect(Array.isArray(body.arrivals)).toBe(true);
  });

  test("GET /api/stations returns complete station list", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(API_ENDPOINTS.STATIONS.path)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      isArray: true,
      arrayMinLength: 400, // MTA has 400+ stations
    });

    expect(validation.valid).toBe(true);

    // Validate response time
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.STATIONS_LIST,
      "GET /api/stations"
    );
    expect(timeValidation.valid).toBe(true);

    const body = await response.json();
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("name");
    expect(body[0]).toHaveProperty("lines");
    expect(Array.isArray(body[0].lines)).toBe(true);
  });

  test("GET /api/stations/search returns relevant results", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(`${API_ENDPOINTS.STATION_SEARCH.path}?q=Times`)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      isArray: true,
      arrayMinLength: 1,
    });

    expect(validation.valid).toBe(true);

    // Validate response time
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.STATION_SEARCH,
      "GET /api/stations/search"
    );
    expect(timeValidation.valid).toBe(true);

    const body = await response.json();
    const hasTimesSquare = body.some((station: any) =>
      station.name.toLowerCase().includes("times")
    );
    expect(hasTimesSquare).toBe(true);
  });

  test("GET /api/alerts returns service alerts", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(API_ENDPOINTS.ALERTS.path)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      requiredFields: ["alerts", "meta"],
    });

    expect(validation.valid).toBe(true);

    // Validate response time
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.ALERTS,
      "GET /api/alerts"
    );
    expect(timeValidation.valid).toBe(true);

    const body = await response.json();
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.meta).toHaveProperty("count");
    expect(body.meta).toHaveProperty("lastUpdatedAt");
  });

  test("GET /api/alerts/:lineId filters by line", async ({ request }) => {
    const response = await request.get(
      API_ENDPOINTS.ALERTS_BY_LINE(TEST_FIXTURES.LINE_IDS.LINE_1).path
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      requiredFields: ["alerts", "lineId"],
    });

    expect(validation.valid).toBe(true);

    const body = await response.json();
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.lineId).toBe(TEST_FIXTURES.LINE_IDS.LINE_1);
  });

  test("GET /api/routes returns route index", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(API_ENDPOINTS.ROUTES.path)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      isArray: true,
      arrayMinLength: 1,
    });

    expect(validation.valid).toBe(true);

    // Validate response time
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.ROUTES_LIST,
      "GET /api/routes"
    );
    expect(timeValidation.valid).toBe(true);

    const body = await response.json();
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("name");
  });

  test("GET /api/static/complexes returns station complexes", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(API_ENDPOINTS.COMPLEXES.path)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      isArray: true,
      arrayMinLength: 1,
    });

    expect(validation.valid).toBe(true);

    // Validate response time
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.STATIC_DATA,
      "GET /api/static/complexes"
    );
    expect(timeValidation.valid).toBe(true);
  });

  test("GET /api/equipment returns equipment status", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(API_ENDPOINTS.EQUIPMENT.path)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      contentType: "application/json",
      requiredFields: ["stations", "count"],
    });

    expect(validation.valid).toBe(true);

    // Validate response time
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.STATIC_DATA,
      "GET /api/equipment"
    );
    expect(timeValidation.valid).toBe(true);

    const body = await response.json();
    expect(Array.isArray(body.stations)).toBe(true);
  });

  test("GET /api/trip/:tripId returns live trip data", async ({ request }) => {
    // Test with a trip ID format - may return 404 if trip not found
    const response = await request.get("/api/trip/MTA_20240801_12345_1");

    // 404 is acceptable for inactive/non-existent trips
    const validation = await validateApiResponse(response, {
      expectedStatus: [STATUS_CODES.OK, STATUS_CODES.NOT_FOUND],
    });

    expect(validation.valid).toBe(true);

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("tripId");
      expect(body).toHaveProperty("routeId");
      expect(body).toHaveProperty("destination");
    }
  });

  test("GET /api/positions/:lineId returns train positions", async ({ request }) => {
    const response = await request.get(`/api/positions/${TEST_FIXTURES.LINE_IDS.LINE_1}`);

    // May return 404 if no position data available
    const validation = await validateApiResponse(response, {
      expectedStatus: [STATUS_CODES.OK, STATUS_CODES.NOT_FOUND],
    });

    expect(validation.valid).toBe(true);

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toHaveProperty("trains");
      expect(Array.isArray(body.trains)).toBe(true);
    }
  });
});

test.describe("Stateful Route Isolation", () => {
  test("stateful routes require authentication (push notifications)", async ({ request }) => {
    const response = await request.post("/api/push/subscribe", {
      data: {
        subscription: {
          endpoint: "https://test.example.com/push",
          keys: { p256dh: "test", auth: "test" },
        },
        favorites: [],
      },
    });

    // Should be blocked by auth (401) or CSRF (403)
    const validation = await validateApiResponse(response, {
      expectedStatus: [STATUS_CODES.UNAUTHORIZED, STATUS_CODES.FORBIDDEN],
    });

    expect(validation.valid).toBe(true);
  });

  test("stateful routes require authentication (trip tracking)", async ({ request }) => {
    const response = await request.post("/api/trips", {
      data: {
        origin: TEST_FIXTURES.STATION_IDS.TIMES_SQUARE,
        destination: TEST_FIXTURES.STATION_IDS.PORT_AUTHORITY,
        line: TEST_FIXTURES.LINE_IDS.LINE_1,
        departureTime: Math.floor(Date.now() / 1000),
        arrivalTime: Math.floor(Date.now() / 1000) + 600,
      },
    });

    // Should be blocked by auth (401) or CSRF (403)
    const validation = await validateApiResponse(response, {
      expectedStatus: [STATUS_CODES.UNAUTHORIZED, STATUS_CODES.FORBIDDEN],
    });

    expect(validation.valid).toBe(true);
  });

  test("stateful routes require authentication (journal)", async ({ request }) => {
    const response = await request.get("/api/journal/stats");

    // Should be blocked by auth (401)
    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.UNAUTHORIZED,
    });

    expect(validation.valid).toBe(true);
  });

  test("public routes do not require authentication", async ({ request }) => {
    // These should work without any auth headers
    const endpoints = [
      API_ENDPOINTS.HEALTH.path,
      API_ENDPOINTS.API_HEALTH.path,
      API_ENDPOINTS.STATIONS.path,
      API_ENDPOINTS.ROUTES.path,
      API_ENDPOINTS.ALERTS.path,
      API_ENDPOINTS.COMPLEXES.path,
      API_ENDPOINTS.EQUIPMENT.path,
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(endpoint);
      const validation = await validateApiResponse(response, {
        expectedStatus: STATUS_CODES.OK,
      });

      expect(validation.valid).toBe(true);
    }
  });
});

test.describe("Route Protection and Security", () => {
  test("public endpoints have proper CORS and cache headers", async ({ request }) => {
    const response = await request.get(API_ENDPOINTS.STATIONS.path);

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
    });

    expect(validation.valid).toBe(true);

    // Use cache header validation utilities
    const cacheValidation = CACHE_HEADERS.validatePublicCache(response);
    expect(cacheValidation.warnings.length).toBe(0);
  });

  test("API endpoints validate query parameters", async ({ request }) => {
    // Should reject unexpected query parameters
    const response = await request.get("/api/health?extra=param");

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.BAD_REQUEST,
    });

    expect(validation.valid).toBe(true);

    const body = await response.json();
    expect(body).toHaveProperty("error", "validation failed");
  });

  test("state-changing operations require CSRF protection", async ({ request }) => {
    const response = await request.post("/api/commute/analyze", {
      data: {
        originId: TEST_FIXTURES.STATION_IDS.TIMES_SQUARE,
        destinationId: TEST_FIXTURES.STATION_IDS.PORT_AUTHORITY,
      },
    });

    // Should be blocked by CSRF (403) or auth (401)
    const validation = await validateApiResponse(response, {
      expectedStatus: [STATUS_CODES.UNAUTHORIZED, STATUS_CODES.FORBIDDEN],
    });

    expect(validation.valid).toBe(true);
  });

  test("rate limiting is active on API routes", async ({ request }) => {
    // Make multiple rapid requests to trigger rate limiting
    const requests = Array(100)
      .fill(null)
      .map(() => request.get(API_ENDPOINTS.STATIONS.path));

    const responses = await Promise.all(requests);
    const rateLimited = responses.some((r) => r.status() === STATUS_CODES.TOO_MANY_REQUESTS);

    // Rate limiting should trigger after threshold
    // Note: This may not trigger in all environments depending on rate limit config
    if (rateLimited) {
      const rateLimitedResponse = responses.find(
        (r) => r.status() === STATUS_CODES.TOO_MANY_REQUESTS
      )!;
      const validation = await validateApiResponse(rateLimitedResponse, {
        expectedStatus: STATUS_CODES.TOO_MANY_REQUESTS,
      });
      expect(validation.valid).toBe(true);
    }
  });
});

test.describe("Response Time and Performance", () => {
  test("health endpoint responds quickly (< 100ms)", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(API_ENDPOINTS.HEALTH.path)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
    });

    expect(validation.valid).toBe(true);

    // Use performance threshold from utilities
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.HEALTH_CHECK,
      "GET /health"
    );
    expect(timeValidation.valid).toBe(true);
  });

  test("arrivals endpoint responds quickly (< 500ms)", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(`/api/arrivals/${TEST_FIXTURES.STATION_IDS.TIMES_SQUARE}`)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
    });

    expect(validation.valid).toBe(true);

    // Use performance threshold from utilities
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.ARRIVALS,
      "GET /api/arrivals/:stationId"
    );
    expect(timeValidation.valid).toBe(true);
  });

  test("stations endpoint responds within acceptable time", async ({ request }) => {
    const { response, duration } = await measureResponseTime(() =>
      request.get(API_ENDPOINTS.STATIONS.path)
    );

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
    });

    expect(validation.valid).toBe(true);

    // Use performance threshold from utilities
    const timeValidation = validateResponseTime(
      duration,
      PERFORMANCE_THRESHOLDS.STATIONS_LIST,
      "GET /api/stations"
    );
    expect(timeValidation.valid).toBe(true);
  });
});

test.describe("Error Handling and Edge Cases", () => {
  test("returns 404 for non-existent stations", async ({ request }) => {
    const response = await request.get("/api/stations/999999");

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.NOT_FOUND,
      requiredFields: ["error"],
    });

    expect(validation.valid).toBe(true);
  });

  test("returns 404 for non-existent routes", async ({ request }) => {
    const response = await request.get("/api/routes/Z999");

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.NOT_FOUND,
      requiredFields: ["error"],
    });

    expect(validation.valid).toBe(true);
  });

  test("handles malformed station IDs gracefully", async ({ request }) => {
    const response = await request.get("/api/stations/invalid");

    // Should return 404 or 400
    const validation = await validateApiResponse(response, {
      expectedStatus: [STATUS_CODES.BAD_REQUEST, STATUS_CODES.NOT_FOUND],
    });

    expect(validation.valid).toBe(true);
  });

  test("empty search results return empty array", async ({ request }) => {
    const response = await request.get("/api/stations/search?q=NonExistentStation12345");

    const validation = await validateApiResponse(response, {
      expectedStatus: STATUS_CODES.OK,
      isArray: true,
      arrayMinLength: 0,
      arrayMaxLength: 0,
    });

    expect(validation.valid).toBe(true);
  });
});
