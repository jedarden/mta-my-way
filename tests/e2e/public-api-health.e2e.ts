/**
 * E2E API Health Test Suite
 *
 * Comprehensive end-to-end tests for public API health monitoring.
 * Tests verify that all public endpoints respond correctly, maintain
 * proper response structure, and meet performance expectations from
 * a client/browser perspective.
 *
 * Test Coverage:
 * - Health endpoint availability and structure
 * - Core API endpoints (stations, routes, alerts)
 * - Response time and performance validation
 * - Error handling and edge cases
 * - Cache header validation
 * - Concurrent request handling
 *
 * Run with: npm run test:e2e public-api-health
 */

import { expect, test } from "@playwright/test";

/**
 * Test configuration object
 * Defines timeouts, retry settings, and performance thresholds
 */
const TEST_CONFIG = {
  // Timeout settings (in milliseconds)
  timeouts: {
    default: 10000, // Default test timeout
    slowEndpoint: 15000, // Timeout for slower endpoints
    healthCheck: 5000, // Timeout for health checks
  },

  // Retry configuration for flaky endpoints
  retries: {
    default: 2, // Default retry attempts
    networkErrors: 3, // Retries for network-related failures
  },

  // Performance thresholds (in milliseconds)
  performance: {
    healthEndpoint: 1000, // Health endpoint should respond in <1s
    staticEndpoints: 2000, // Static data endpoints <2s
    dynamicEndpoints: 3000, // Dynamic endpoints <3s
    maxAcceptable: 5000, // Maximum acceptable response time
  },

  // Cache header expectations
  cache: {
    maxAgeHealth: 0, // Health endpoints should not cache
    maxAgeStatic: 3600, // Static data can cache for 1 hour
    maxAgeDynamic: 300, // Dynamic data can cache for 5 minutes
  },

  // Expected response structures
  responses: {
    health: {
      required: ["status", "timestamp", "uptime_seconds"],
      optional: ["deploymentMode", "feeds", "alerts", "memory"],
    },
    stations: {
      itemType: "object",
      requiredFields: ["id", "name", "lat", "lon", "lines"],
    },
    routes: {
      itemType: "object",
      requiredFields: ["id", "shortName", "longName", "color"],
    },
    alerts: {
      structure: ["alerts", "meta"],
      metaFields: ["count", "lastUpdatedAt", "circuitOpen"],
    },
  },
};

/**
 * Performance assertion helper
 * @param startTime Request start time in milliseconds
 * @param maxMs Maximum acceptable response time
 * @param description Description of what was measured
 */
function assertPerformance(startTime: number, maxMs: number, description: string): void {
  const responseTime = Date.now() - startTime;
  expect(responseTime, `${description} took ${responseTime}ms`).toBeLessThan(maxMs);
}

/**
 * Validate cache headers
 * @param response Response object
 * @param expectedMaxAge Expected max-age value
 */
function validateCacheHeaders(response: any, expectedMaxAge: number): void {
  const cacheControl = response.headers()["cache-control"];
  if (expectedMaxAge === 0) {
    // Should not cache
    expect(
      cacheControl?.includes("no-store") || cacheControl?.includes("no-cache"),
      `Expected no-cache headers, got: ${cacheControl}`
    ).toBe(true);
  } else {
    // Should have public cache with max-age
    expect(
      cacheControl?.includes("public") && cacheControl?.includes(`max-age=${expectedMaxAge}`),
      `Expected cache headers with max-age=${expectedMaxAge}, got: ${cacheControl}`
    ).toBe(true);
  }
}

test.describe("Public API Health Tests", () => {
  test.describe.configure({ timeout: TEST_CONFIG.timeouts.default });

  test.describe("Health Endpoint (/api/health)", () => {
    test.configure({ retry: TEST_CONFIG.retries.default });

    test("should return 200 OK status", async ({ request }) => {
      const response = await request.get("/api/health");
      expect(response.status()).toBe(200);
    });

    test("should return valid health structure", async ({ request }) => {
      const response = await request.get("/api/health");
      expect(response.status()).toBe(200);

      const body = await response.json();

      // Validate required fields
      for (const field of TEST_CONFIG.responses.health.required) {
        expect(body).toHaveProperty(field);
      }

      // Validate data types
      expect(typeof body.status).toBe("string");
      expect(typeof body.timestamp).toBe("number");
      expect(typeof body.uptime_seconds).toBe("number");
    });

    test("should respond within performance threshold", async ({ request }) => {
      const startTime = Date.now();
      const response = await request.get("/api/health");
      assertPerformance(startTime, TEST_CONFIG.performance.healthEndpoint, "Health check");
      expect(response.status()).toBe(200);
    });

    test("should include deployment mode information", async ({ request }) => {
      const response = await request.get("/api/health");
      const body = await response.json();

      // Deployment mode is optional but should be present if available
      if (body.deploymentMode) {
        expect(["core-only", "full"]).toContain(body.deploymentMode);
      }
    });

    test("should have appropriate cache headers", async ({ request }) => {
      const response = await request.get("/api/health");
      validateCacheHeaders(response, TEST_CONFIG.cache.maxAgeHealth);
    });
  });

  test.describe("Stations Endpoint (/api/stations)", () => {
    test.configure({ retry: TEST_CONFIG.retries.default });

    test("should return 200 OK status", async ({ request }) => {
      const response = await request.get("/api/stations");
      expect(response.status()).toBe(200);
    });

    test("should return array of stations", async ({ request }) => {
      const response = await request.get("/api/stations");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    test("should have correct station structure", async ({ request }) => {
      const response = await request.get("/api/stations");
      expect(response.status()).toBe(200);

      const body = await response.json();
      const station = body[0];

      // Validate required fields
      for (const field of TEST_CONFIG.responses.stations.requiredFields) {
        expect(station).toHaveProperty(field);
      }

      // Validate data types
      expect(typeof station.id).toBe("string");
      expect(typeof station.name).toBe("string");
      expect(typeof station.lat).toBe("number");
      expect(typeof station.lon).toBe("number");
      expect(Array.isArray(station.lines)).toBe(true);
    });

    test("should respond within performance threshold", async ({ request }) => {
      const startTime = Date.now();
      const response = await request.get("/api/stations");
      assertPerformance(startTime, TEST_CONFIG.performance.staticEndpoints, "Stations endpoint");
      expect(response.status()).toBe(200);
    });

    test("should have appropriate cache headers", async ({ request }) => {
      const response = await request.get("/api/stations");
      validateCacheHeaders(response, TEST_CONFIG.cache.maxAgeStatic);
    });

    test("should handle geographic coordinate validation", async ({ request }) => {
      const response = await request.get("/api/stations");
      const body = await response.json();

      // Check a few stations for valid coordinates
      for (const station of body.slice(0, 5)) {
        expect(station.lat).toBeGreaterThanOrEqual(-90);
        expect(station.lat).toBeLessThanOrEqual(90);
        expect(station.lon).toBeGreaterThanOrEqual(-180);
        expect(station.lon).toBeLessThanOrEqual(180);
      }
    });
  });

  test.describe("Station Detail Endpoint (/api/stations/:id)", () => {
    test.configure({ retry: TEST_CONFIG.retries.default });

    test("should return 200 for valid station ID", async ({ request }) => {
      // Test with a known station (Times Square - 725)
      const response = await request.get("/api/stations/725");
      expect(response.status()).toBe(200);
    });

    test("should return 404 for non-existent station", async ({ request }) => {
      const response = await request.get("/api/stations/999999");
      expect(response.status()).toBe(404);
    });

    test("should return valid station data structure", async ({ request }) => {
      const response = await request.get("/api/stations/725");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("id", "725");
      expect(body).toHaveProperty("name");
      expect(body).toHaveProperty("lines");
    });

    test("should handle path traversal attempts safely", async ({ request }) => {
      const response = await request.get("/api/stations/../../etc/passwd");
      // Should be rejected with 400 or return 404
      expect([400, 404]).toContain(response.status());
    });
  });

  test.describe("Routes Endpoint (/api/routes)", () => {
    test.configure({ retry: TEST_CONFIG.retries.default });

    test("should return 200 OK status", async ({ request }) => {
      const response = await request.get("/api/routes");
      expect(response.status()).toBe(200);
    });

    test("should return array of routes", async ({ request }) => {
      const response = await request.get("/api/routes");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
    });

    test("should have correct route structure", async ({ request }) => {
      const response = await request.get("/api/routes");
      const body = await response.json();
      const route = body[0];

      // Validate required fields
      for (const field of TEST_CONFIG.responses.routes.requiredFields) {
        expect(route).toHaveProperty(field);
      }

      // Validate data types
      expect(typeof route.id).toBe("string");
      expect(typeof route.shortName).toBe("string");
      expect(typeof route.longName).toBe("string");
      expect(typeof route.color).toBe("string");
    });

    test("should respond within performance threshold", async ({ request }) => {
      const startTime = Date.now();
      const response = await request.get("/api/routes");
      assertPerformance(startTime, TEST_CONFIG.performance.staticEndpoints, "Routes endpoint");
      expect(response.status()).toBe(200);
    });

    test("should have appropriate cache headers", async ({ request }) => {
      const response = await request.get("/api/routes");
      validateCacheHeaders(response, TEST_CONFIG.cache.maxAgeStatic);
    });
  });

  test.describe("Alerts Endpoint (/api/alerts)", () => {
    test.configure({ retry: TEST_CONFIG.retries.default });

    test("should return 200 OK status", async ({ request }) => {
      const response = await request.get("/api/alerts");
      expect(response.status()).toBe(200);
    });

    test("should return valid alerts structure", async ({ request }) => {
      const response = await request.get("/api/alerts");
      expect(response.status()).toBe(200);

      const body = await response.json();

      // Validate top-level structure
      for (const prop of TEST_CONFIG.responses.alerts.structure) {
        expect(body).toHaveProperty(prop);
      }

      expect(Array.isArray(body.alerts)).toBe(true);
      expect(typeof body.meta).toBe("object");
    });

    test("should have correct metadata structure", async ({ request }) => {
      const response = await request.get("/api/alerts");
      const body = await response.json();

      // Validate metadata fields
      for (const field of TEST_CONFIG.responses.alerts.metaFields) {
        expect(body.meta).toHaveProperty(field);
      }

      // Validate data types
      expect(typeof body.meta.count).toBe("number");
      expect(body.meta.lastUpdatedAt === null || typeof body.meta.lastUpdatedAt === "number").toBe(
        true
      );
      expect(typeof body.meta.circuitOpen).toBe("boolean");
    });

    test("should respond within performance threshold", async ({ request }) => {
      const startTime = Date.now();
      const response = await request.get("/api/alerts");
      assertPerformance(startTime, TEST_CONFIG.performance.dynamicEndpoints, "Alerts endpoint");
      expect(response.status()).toBe(200);
    });

    test("should have appropriate cache headers", async ({ request }) => {
      const response = await request.get("/api/alerts");
      validateCacheHeaders(response, TEST_CONFIG.cache.maxAgeDynamic);
    });

    test("should filter alerts by line", async ({ request }) => {
      const response = await request.get("/api/alerts/1");
      expect(response.status()).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("alerts");
      expect(body).toHaveProperty("lineId", "1");
    });
  });

  test.describe("Performance and Reliability", () => {
    test("all core endpoints should respond within thresholds", async ({ request }) => {
      const endpoints = [
        { path: "/api/health", maxTime: TEST_CONFIG.performance.healthEndpoint },
        { path: "/api/stations", maxTime: TEST_CONFIG.performance.staticEndpoints },
        { path: "/api/routes", maxTime: TEST_CONFIG.performance.staticEndpoints },
        { path: "/api/alerts", maxTime: TEST_CONFIG.performance.dynamicEndpoints },
      ];

      for (const { path, maxTime } of endpoints) {
        const startTime = Date.now();
        const response = await request.get(path);
        const responseTime = Date.now() - startTime;

        expect(response.status(), `${path} returned ${response.status()}`).toBe(200);
        expect(responseTime, `${path} took ${responseTime}ms`).toBeLessThan(maxTime);
      }
    });

    test("should handle concurrent requests without errors", async ({ request }) => {
      const requests = [
        request.get("/api/health"),
        request.get("/api/stations"),
        request.get("/api/routes"),
        request.get("/api/alerts"),
      ];

      const responses = await Promise.all(requests);

      // All requests should complete successfully
      responses.forEach((response, index) => {
        const paths = ["/api/health", "/api/stations", "/api/routes", "/api/alerts"];
        expect(response.status(), `${paths[index]} returned ${response.status()}`).toBe(200);
      });
    });

    test("should maintain consistent response formats", async ({ request }) => {
      const endpoints = ["/api/stations", "/api/routes", "/api/alerts"];

      for (const endpoint of endpoints) {
        const response = await request.get(endpoint);

        // All should return JSON
        const contentType = response.headers()["content-type"];
        expect(contentType).toMatch(/application\/json/);

        // All should have 200 status
        expect(response.status()).toBe(200);
      }
    });
  });

  test.describe("Error Handling and Edge Cases", () => {
    test("should handle invalid endpoint paths gracefully", async ({ request }) => {
      const response = await request.get("/api/invalid-endpoint");
      expect(response.status()).toBe(404);
    });

    test("should handle malformed requests gracefully", async ({ request }) => {
      const response = await request.get("/api/stations/invalid-id");
      expect([400, 404]).toContain(response.status());
    });

    test("should handle empty query parameters", async ({ request }) => {
      const response = await request.get("/api/alerts?");
      expect(response.status()).toBe(200);
    });

    test("should reject unsupported HTTP methods", async ({ request }) => {
      const response = await request.post("/api/health");
      // Should return 404 or 405 (Method Not Allowed)
      expect([404, 405]).toContain(response.status());
    });
  });

  test.describe("Security Headers", () => {
    test("should have proper content-type headers", async ({ request }) => {
      const endpoints = ["/api/health", "/api/stations", "/api/routes", "/api/alerts"];

      for (const endpoint of endpoints) {
        const response = await request.get(endpoint);
        const contentType = response.headers()["content-type"];

        expect(contentType).toMatch(/application\/json/);
        expect(response.status()).toBe(200);
      }
    });

    test("should include CORS headers if configured", async ({ request }) => {
      const response = await request.get("/api/stations");

      // CORS headers may or may not be present depending on config
      // If present, they should be valid
      const corsHeader = response.headers()["access-control-allow-origin"];
      if (corsHeader) {
        expect(["*", "http://localhost:3001", null]).toContain(corsHeader);
      }

      expect(response.status()).toBe(200);
    });
  });

  test.describe("Data Integrity", () => {
    test("should maintain data consistency across repeated requests", async ({ request }) => {
      const endpoint = "/api/stations";

      const response1 = await request.get(endpoint);
      const body1 = await response1.json();

      const response2 = await request.get(endpoint);
      const body2 = await response2.json();

      // Both responses should have the same structure and length
      expect(Array.isArray(body1)).toBe(true);
      expect(Array.isArray(body2)).toBe(true);
      expect(body1.length).toBe(body2.length);
    });

    test("should return valid geographic coordinates", async ({ request }) => {
      const response = await request.get("/api/stations");
      const body = await response.json();

      // All stations should have valid coordinates
      for (const station of body) {
        expect(station.lat).toBeDefined();
        expect(station.lon).toBeDefined();
        expect(typeof station.lat).toBe("number");
        expect(typeof station.lon).toBe("number");
      }
    });
  });
});

/**
 * Test Results Summary
 *
 * This test suite validates:
 *
 * ✅ Health Endpoint (/api/health):
 *    - Returns 200 status with proper structure
 *    - Responds within performance threshold (<1s)
 *    - Includes required fields (status, timestamp, uptime_seconds)
 *    - Has appropriate cache headers (no-cache)
 *    - Optionally includes deployment mode
 *
 * ✅ Stations Endpoint (/api/stations):
 *    - Returns 200 with array of stations
 *    - Correct station structure with required fields
 *    - Valid geographic coordinates
 *    - Responds within performance threshold (<2s)
 *    - Has appropriate cache headers (1 hour)
 *
 * ✅ Station Detail (/api/stations/:id):
 *    - Returns 200 for valid IDs, 404 for non-existent
 *    - Valid station data structure
 *    - Handles path traversal attempts safely
 *
 * ✅ Routes Endpoint (/api/routes):
 *    - Returns 200 with array of routes
 *    - Correct route structure with required fields
 *    - Responds within performance threshold (<2s)
 *    - Has appropriate cache headers (1 hour)
 *
 * ✅ Alerts Endpoint (/api/alerts):
 *    - Returns 200 with valid alerts structure
 *    - Correct metadata structure
 *    - Filters alerts by line
 *    - Responds within performance threshold (<3s)
 *    - Has appropriate cache headers (5 minutes)
 *
 * ✅ Performance and Reliability:
 *    - All endpoints respond within thresholds
 *    - Handles concurrent requests correctly
 *    - Consistent response formats
 *
 * ✅ Error Handling:
 *    - Handles invalid endpoints gracefully
 *    - Rejects malformed requests
 *    - Handles empty query parameters
 *    - Rejects unsupported HTTP methods
 *
 * ✅ Security:
 *    - Proper content-type headers
 *    - CORS headers if configured
 *
 * ✅ Data Integrity:
 *    - Consistent data across repeated requests
 *    - Valid geographic coordinates
 *
 * Run command: npm run test:e2e public-api-health
 */
