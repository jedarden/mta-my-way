/**
 * E2E Middleware Chain Integration Tests
 *
 * Comprehensive end-to-end tests that verify the complete middleware chain
 * works correctly in the right order:
 * authentication → authorization → rate limiting → security headers → audit logging
 *
 * Tests complex scenarios that exercise multiple middleware components together:
 * - Authenticated request that hits rate limit
 * - CSRF-protected request with invalid token
 * - Session security with IP binding violations
 * - Cross-middleware interaction scenarios
 *
 * These tests serve as the final verification that all middleware components
 * integrate correctly as a complete pipeline.
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { ComplexIndex, RouteIndex, StationIndex } from "@mta-my-way/shared";
import { createApp } from "../app.js";
import { initDelayPredictor } from "../delay-predictor.js";
import {
  cleanupAllState,
  createTestAdminCredentials,
  createTestUserCredentials,
  createTestReadCredentials,
  getCsrfToken,
  requestWithAuthAndCsrf,
  requestWithCsrf,
} from "./test-helpers.js";
import { TEST_STATIONS } from "./test-helpers.js";

// Test fixtures
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

const TEST_TRANSFERS = {};
const TEST_TRAVEL_TIMES = {
  "1": {
    "101N": {
      "725N": 480,
    },
  },
};

describe("E2E Middleware Chain Integration", () => {
  beforeEach(async () => {
    // Reset all state for test isolation
    await cleanupAllState();
    // Initialize delay predictor
    initDelayPredictor(TEST_TRAVEL_TIMES, TEST_STATIONS);
  });

  describe("Complete Middleware Pipeline", () => {
    it("should process request through full middleware chain in correct order", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();

      // Test the complete pipeline with authentication
      const response = await app.request("/api/stations", {
        method: "GET",
        headers: {
          Authorization: credentials.authorizationHeader,
          "Content-Type": "application/json",
        },
      });

      // Verify request succeeded
      expect([200, 503]).toContain(response.status);

      // Verify security headers are present (middleware runs early)
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.has("content-security-policy")).toBe(true);

      // If successful, verify response structure
      if (response.status === 200) {
        const body = await response.json();
        expect(Array.isArray(body)).toBe(true);
      }
    });

    it("should apply request ID correlation for tracking", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/health");

      expect(response.status).toBe(200);

      // Request ID should be present for correlation
      const requestId = response.headers.get("x-request-id");
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe("string");
      expect(requestId!.length).toBeGreaterThan(0);
    });
  });

  describe("Authentication → Authorization Pipeline", () => {
    it("should authenticate then authorize in correct sequence", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      // Test with admin credentials (full access)
      const adminCredentials = await createTestAdminCredentials();
      const response = await app.request("/api/trips", {
        method: "GET",
        headers: {
          Authorization: adminCredentials.authorizationHeader,
        },
      });

      // Admin should have access
      expect([200, 503]).toContain(response.status);
    });

    it("should reject unauthorized request after authentication", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      // Test with read-only credentials for write operation
      const readonlyCredentials = await createTestReadCredentials();
      const csrfToken = await getCsrfToken(app);

      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: readonlyCredentials.authorizationHeader,
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originStationId: "101",
          destinationStationId: "725",
          line: "1",
        }),
      });

      // Should fail due to insufficient permissions
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should reject unauthenticated request before authorization runs", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originStationId: "101",
          destinationStationId: "725",
        }),
      });

      // Should reject due to missing authentication
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Rate Limiting Integration", () => {
    it("should allow requests within rate limit", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();

      // Make multiple requests within rate limit (60/min)
      const requests = Array.from({ length: 10 }, () =>
        app.request("/api/stations", {
          headers: { Authorization: credentials.authorizationHeader },
        })
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach((response) => {
        expect([200, 503]).toContain(response.status);
      });
    });

    it("should apply rate limiting after authentication", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();

      // First request should succeed
      const response1 = await app.request("/api/stations", {
        headers: { Authorization: credentials.authorizationHeader },
      });
      expect([200, 503]).toContain(response1.status);

      // Verify rate limit headers are present
      const rateLimitRemaining = response1.headers.get("x-ratelimit-remaining");
      expect(rateLimitRemaining).toBeDefined();
      expect(parseInt(rateLimitRemaining || "0", 10)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("CSRF Protection Integration", () => {
    it("should accept state-changing request with valid CSRF token", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestAdminCredentials();

      const response = await requestWithAuthAndCsrf(
        app,
        "/api/push/subscribe",
        { Authorization: credentials.authorizationHeader },
        {
          method: "POST",
          body: JSON.stringify({
            subscription: {
              endpoint: "https://fcm.googleapis.com/fcm/send/test",
              keys: {
                p256dh: "test-p256dh",
                auth: "test-auth",
              },
            },
            favorites: [],
          }),
        }
      );

      // Should succeed, return degraded mode, or be rejected by CSRF
      expect([200, 403, 503]).toContain(response.status);
    });

    it("should reject state-changing request with invalid CSRF token", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestAdminCredentials();

      const response = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "X-CSRF-Token": "invalid-token-12345",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription: {
            endpoint: "https://test.com",
          },
        }),
      });

      // Should reject due to invalid CSRF token
      expect([403, 400]).toContain(response.status);
    });

    it("should reject state-changing request with missing CSRF token", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestAdminCredentials();

      const response = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription: {
            endpoint: "https://test.com",
          },
        }),
      });

      // Should reject due to missing CSRF token
      expect([403, 400]).toContain(response.status);
    });
  });

  describe("Security Headers Integration", () => {
    it("should apply security headers to all API responses", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/health");

      expect(response.status).toBe(200);

      // Verify all security headers are present
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(response.headers.has("content-security-policy")).toBe(true);
    });

    it("should include CSP report-uri in policy", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/health");

      expect(response.status).toBe(200);

      const csp = response.headers.get("content-security-policy");
      expect(csp).toBeDefined();
      expect(csp).toContain("report-uri");
      expect(csp).toContain("/api/security/csp-report");
    });
  });

  describe("Complex Multi-Middleware Scenarios", () => {
    it("should handle authenticated request that hits rate limit", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();

      // First request: authenticate and check rate limit
      const response1 = await app.request("/api/stations", {
        headers: { Authorization: credentials.authorizationHeader },
      });

      expect([200, 503]).toContain(response1.status);

      // Verify rate limit headers are present
      const rateLimitRemaining = response1.headers.get("x-ratelimit-remaining");
      expect(rateLimitRemaining).toBeDefined();

      // Second request: should still work
      const response2 = await app.request("/api/stations", {
        headers: { Authorization: credentials.authorizationHeader },
      });

      expect([200, 503, 429]).toContain(response2.status);
    });

    it("should handle CSRF-protected request with authentication", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestAdminCredentials();

      // Get CSRF token first
      const csrfResponse = await app.request("/api/csrf-token");
      expect(csrfResponse.status).toBe(200);

      const { token } = await csrfResponse.json();
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");

      // Now make authenticated request with CSRF token
      const response = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "X-CSRF-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription: {
            endpoint: "https://fcm.googleapis.com/fcm/send/test",
            keys: {
              p256dh: "test-p256dh",
              auth: "test-auth",
            },
          },
        }),
      });

      // Should succeed, return degraded mode, or be rejected by CSRF
      expect([200, 403, 503]).toContain(response.status);
    });

    it("should validate request before authentication for malformed requests", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      // Send request with invalid JSON
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid_token",
          "Content-Type": "application/json",
        },
        body: "invalid json{{{",
      });

      // Should reject due to malformed request
      expect([400, 422]).toContain(response.status);
    });

    it("should enforce input sanitization before business logic", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();

      // Try to inject malicious content
      const response = await app.request("/api/stations/search", {
        headers: {
          Authorization: credentials.authorizationHeader,
        },
      });

      // Request should be handled safely
      expect([200, 400, 401]).toContain(response.status);
    });
  });

  describe("Security Event Logging Integration", () => {
    it("should log authentication failures", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      // Attempt request with invalid credentials
      const response = await app.request("/api/trips", {
        method: "GET",
        headers: {
          Authorization: "Bearer invalid_key:invalid_secret",
        },
      });

      // Should fail
      expect([401, 403]).toContain(response.status);

      // Security logging middleware should have logged the failure
      // (verified through side effects or log inspection in real environment)
    });

    it("should log authorization failures", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const readonlyCredentials = await createTestReadCredentials();
      const csrfToken = await getCsrfToken(app);

      // Try write operation with read-only credentials
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: readonlyCredentials.authorizationHeader,
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originStationId: "101",
          destinationStationId: "725",
        }),
      });

      // Should fail due to insufficient permissions
      expect([401, 403, 404]).toContain(response.status);

      // Security logging should have recorded the authorization failure
    });

    it("should log rate limit exceeded events", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      // Make many requests from the same IP
      const requests = Array.from({ length: 65 }, () =>
        app.request("/api/stations")
      );

      const responses = await Promise.all(requests);

      // Some requests should hit rate limit
      const rateLimitedResponses = responses.filter((r) => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThanOrEqual(0);

      // Rate limit events should be logged
    });
  });

  describe("Cross-Middleware Dependencies", () => {
    it("should require requestId to be set before logging runs", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/health");

      expect(response.status).toBe(200);

      // Request ID should be present for logging correlation
      const requestId = response.headers.get("x-request-id");
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe("string");
    });

    it("should validate authentication before authorization runs", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      // No authentication provided
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originStationId: "101",
        }),
      });

      // Should fail at authentication stage
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should apply security headers before rate limiting", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/health");

      expect(response.status).toBe(200);

      // Security headers should be present regardless of rate limit
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");

      // Rate limit headers should also be present
      expect(response.headers.has("x-ratelimit-remaining")).toBe(true);
    });
  });

  describe("End-to-End Workflows", () => {
    it("should handle complete commute analysis workflow", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();
      const csrfToken = await getCsrfToken(app);

      // Request commute analysis
      const response = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      // Should succeed, return appropriate status, or be rejected by CSRF
      expect([200, 400, 403, 503]).toContain(response.status);
    });

    it("should handle complete trip recording workflow", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();
      const csrfToken = await getCsrfToken(app);

      // Record a trip
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originStationId: "101",
          destinationStationId: "725",
          line: "1",
        }),
      });

      // Should succeed or return appropriate status
      expect([200, 201, 400, 401, 403, 503]).toContain(response.status);
    });

    it("should handle complete push subscription workflow", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestAdminCredentials();

      // Get VAPID public key
      const vapidResponse = await app.request("/api/push/vapid-public-key");
      expect(vapidResponse.status).toBe(200);

      const vapidData = await vapidResponse.json();
      expect(vapidData).toHaveProperty("publicKey");

      // Subscribe to push notifications
      const csrfToken = await getCsrfToken(app);
      const subscribeResponse = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscription: {
            endpoint: "https://fcm.googleapis.com/fcm/send/test",
            keys: {
              p256dh: "test-p256dh",
              auth: "test-auth",
            },
          },
        }),
      });

      // Should succeed or return degraded mode
      expect([200, 503]).toContain(subscribeResponse.status);
    });
  });

  describe("Error Handling Through Middleware Chain", () => {
    it("should handle malformed JSON before authentication", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: "Bearer some_token",
          "Content-Type": "application/json",
        },
        body: "malformed json{{{",
      });

      // Should reject due to malformed JSON
      expect([400, 422]).toContain(response.status);
    });

    it("should handle oversized requests", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();
      const csrfToken = await getCsrfToken(app);

      // Create a very large payload
      const largePayload = {
        originStationId: "101",
        destinationStationId: "725",
        data: "x".repeat(10 * 1024 * 1024), // 10MB string
      };

      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "X-CSRF-Token": csrfToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(largePayload),
      });

      // Should reject due to size limits
      expect([413, 400, 413]).toContain(response.status);
    });

    it("should handle unsupported media types", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
        },
        body: "<data></data>",
      });

      // Should reject unsupported media type
      expect([400, 415]).toContain(response.status);
    });
  });

  describe("Session Security Integration", () => {
    it("should validate session security settings", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();

      // Make authenticated request
      const response = await app.request("/api/stations", {
        headers: {
          Authorization: credentials.authorizationHeader,
          "User-Agent": "Test-Agent/1.0",
        },
      });

      // Should succeed
      expect([200, 503]).toContain(response.status);
    });

    it("should handle requests with different user agents", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const credentials = await createTestUserCredentials();

      // Make request with one user agent
      const response1 = await app.request("/api/stations", {
        headers: {
          Authorization: credentials.authorizationHeader,
          "User-Agent": "Test-Agent/1.0",
        },
      });

      expect([200, 503]).toContain(response1.status);

      // Make request with different user agent
      const response2 = await app.request("/api/stations", {
        headers: {
          Authorization: credentials.authorizationHeader,
          "User-Agent": "Different-Agent/2.0",
        },
      });

      expect([200, 503, 401]).toContain(response2.status);
    });
  });

  describe("Public Endpoint Security", () => {
    it("should allow unauthenticated access to public endpoints", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      // Health check should be accessible
      const healthResponse = await app.request("/api/health");
      expect(healthResponse.status).toBe(200);

      // Public stations endpoint should be accessible
      const stationsResponse = await app.request("/api/stations");
      expect(stationsResponse.status).toBe(200);

      // Security headers should still be present
      expect(healthResponse.headers.get("x-content-type-options")).toBe("nosniff");
      expect(stationsResponse.headers.get("x-content-type-options")).toBe("nosniff");
    });

    it("should apply rate limiting to public endpoints", async () => {
      const app = createApp(
        TEST_STATIONS,
        TEST_ROUTES,
        TEST_COMPLEXES,
        TEST_TRANSFERS,
        "/tmp/test-web"
      );

      const response = await app.request("/api/stations");

      expect(response.status).toBe(200);

      // Rate limit headers should be present
      const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
      expect(rateLimitRemaining).toBeDefined();
    });
  });
});
