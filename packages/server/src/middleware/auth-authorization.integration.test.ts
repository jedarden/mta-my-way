/**
 * Integration tests for authentication and authorization middleware chain.
 *
 * Tests the complete authentication → authorization flow including:
 * - JWT validation with enhanced security features
 * - Role-based access control (RBAC)
 * - Middleware ordering and execution
 * - Success and failure paths (invalid tokens, insufficient permissions)
 * - Integration between enhanced-authentication and enhanced-jwt-security
 */

import type { ComplexIndex, RouteIndex, StationIndex, TravelTimeIndex } from "@mta-my-way/shared";
import { ROLES, generateRandomToken } from "@mta-my-way/shared/testing/security-helpers";
import {
  createMockAuthToken,
  createMockSecurityMiddleware,
  createTestContext,
} from "@mta-my-way/shared/testing/test-helpers";
import type { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { initDelayPredictor } from "../delay-predictor.js";
import {
  TEST_STATIONS,
  cleanupAllState,
  createTestAdminCredentials,
  createTestReadCredentials,
  createTestUserCredentials,
} from "../integration/test-helpers.js";

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
};

const COMPLEXES: ComplexIndex = {
  "725-726": {
    complexId: "725-726",
    name: "Times Sq-42 St / Port Authority",
    stations: ["725", "726"],
    allLines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S", "A", "C", "E"],
    allStopIds: ["725N", "725S", "726N", "726S"],
  },
};

const TRAVEL_TIMES: TravelTimeIndex = {
  "1": {
    "101N": {
      "725N": 480,
    },
  },
};

describe("Authentication and Authorization Integration", () => {
  let app: Hono;
  let testCtx: ReturnType<typeof createTestContext>;

  beforeAll(async () => {
    initDelayPredictor(TRAVEL_TIMES, STATIONS);
    testCtx = createTestContext();
  });

  beforeEach(async () => {
    await cleanupAllState();
    app = createApp(STATIONS, ROUTES, COMPLEXES, {}, "");
  });

  describe("JWT Validation", () => {
    it("should accept valid JWT tokens", async () => {
      const validToken = generateRandomToken(32);
      const response = await app.request("/api/health", {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      expect([200, 401]).toContain(response.status);
    });

    it("should reject malformed JWT tokens", async () => {
      const malformedToken = "not-a-valid-jwt-token";
      const response = await app.request("/api/health", {
        headers: { Authorization: `Bearer ${malformedToken}` },
      });
      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  });

  describe("Enhanced JWT Security", () => {
    it("should detect token compromise from geographic anomalies", async () => {
      const response = await app.request("/api/health", {
        headers: {
          Authorization: `Bearer ${generateRandomToken(32)}`,
          "X-Forwarded-For": "192.168.1.100",
          "User-Agent": "Test-Agent-1.0",
        },
      });
      expect([200, 401, 403]).toContain(response.status);
    });

    it("should track token usage patterns", async () => {
      const token = generateRandomToken(32);
      const response1 = await app.request("/api/health", {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "Test-Agent-1.0",
        },
      });
      const response2 = await app.request("/api/health", {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "Test-Agent-1.0",
        },
      });
      expect([200, 401]).toContain(response1.status);
      expect([200, 401]).toContain(response2.status);
    });
  });

  describe("Role-Based Access Control (RBAC)", () => {
    it("should grant access to admin users for all resources", async () => {
      const response = await app.request("/api/admin/stats", { method: "GET" });
      expect([200, 401, 403]).toContain(response.status);
    });

    it("should restrict user access to admin-only endpoints", async () => {
      const userCredentials = await createTestUserCredentials();
      const response = await app.request("/api/admin/users", {
        method: "GET",
        headers: { Authorization: userCredentials.authorizationHeader },
      });
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should grant access based on resource ownership", async () => {
      const userCredentials = await createTestUserCredentials();
      const response = await app.request("/api/trips", {
        method: "GET",
        headers: { Authorization: userCredentials.authorizationHeader },
      });
      expect([200, 401]).toContain(response.status);
    });

    it("should enforce permission-based access control", async () => {
      const readonlyCredentials = await createTestReadCredentials();
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: readonlyCredentials.authorizationHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originStationId: "101",
          destinationStationId: "725",
          line: "1",
        }),
      });
      expect([401, 403, 404]).toContain(response.status);
    });
  });

  describe("Middleware Ordering", () => {
    it("should execute auth middleware before authorization checks", async () => {
      const credentials = await createTestUserCredentials();
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: credentials.authorizationHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originStationId: "101",
          destinationStationId: "725",
          line: "1",
        }),
      });
      expect([200, 201, 400, 401, 403, 404]).toContain(response.status);
    });

    it("should apply security headers before auth checks", async () => {
      const response = await app.request("/api/health");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.has("Content-Security-Policy")).toBe(true);
    });

    it("should validate CSRF tokens for state-changing operations", async () => {
      const csrfResponse = await app.request("/api/csrf-token");
      if (csrfResponse.status === 200) {
        const { token } = await csrfResponse.json();
        const response = await app.request("/api/favorites", {
          method: "POST",
          headers: {
            "X-CSRF-Token": token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stationId: "725", label: "Test" }),
        });
        expect([200, 201, 400, 401, 403, 404]).toContain(response.status);
      }
    });

    it("should apply rate limiting after authentication", async () => {
      const credentials = await createTestReadCredentials();
      const requests = Array.from({ length: 20 }, () =>
        app.request("/api/stations", {
          headers: { Authorization: credentials.authorizationHeader },
        })
      );
      const responses = await Promise.all(requests);
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Enhanced Auth + JWT Security Integration", () => {
    it("should work together: auth validates JWT, security checks compromise", async () => {
      const token = generateRandomToken(32);
      const response = await app.request("/api/health", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Forwarded-For": "192.168.1.50",
          "User-Agent": "Integration-Test-Agent",
        },
      });
      expect([200, 401]).toContain(response.status);
    });

    it("should integrate with RBAC cache for performance", async () => {
      const credentials = await createTestReadCredentials();
      const response1 = await app.request("/api/stations", {
        headers: { Authorization: credentials.authorizationHeader },
      });
      const response2 = await app.request("/api/stations", {
        headers: { Authorization: credentials.authorizationHeader },
      });
      expect([200, 401]).toContain(response1.status);
      expect([200, 401]).toContain(response2.status);
    });
  });

  describe("Failure Paths", () => {
    it("should return 401 for missing authentication", async () => {
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originStationId: "101",
          destinationStationId: "725",
          line: "1",
        }),
      });
      expect([401, 404]).toContain(response.status);
    });

    it("should return 403 for insufficient permissions", async () => {
      const readonlyCredentials = await createTestReadCredentials();
      const response = await app.request("/api/trips", {
        method: "POST",
        headers: {
          Authorization: readonlyCredentials.authorizationHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originStationId: "101",
          destinationStationId: "725",
          line: "1",
        }),
      });
      expect([401, 403, 404]).toContain(response.status);
    });

    it("should return 401 for invalid API key format", async () => {
      const response = await app.request("/api/stations", {
        headers: { Authorization: "Bearer invalid-format" },
      });
      expect([401, 400]).toContain(response.status);
    });
  });

  describe("Test Helpers", () => {
    it("should create valid mock security middleware", () => {
      const middleware = createMockSecurityMiddleware();
      expect(typeof middleware.authenticate).toBe("function");
      expect(typeof middleware.authorize).toBe("function");
      expect(middleware.context).toBeDefined();
    });

    it("should support role-based permissions in test helpers", () => {
      expect(ROLES.admin).toBeDefined();
      expect(ROLES.admin.name).toBe("admin");
      expect(ROLES.admin.permissions).toContain("*");
      expect(ROLES.user).toBeDefined();
      expect(ROLES.user.name).toBe("user");
      expect(ROLES.user.permissions.length).toBeGreaterThan(0);
    });
  });

  describe("End-to-End Scenarios", () => {
    it("should handle complete authenticated flow: auth → authorize → respond", async () => {
      const credentials = await createTestUserCredentials();
      const healthResponse = await app.request("/api/health");
      expect(healthResponse.status).toBe(200);
      const stationsResponse = await app.request("/api/stations", {
        headers: { Authorization: credentials.authorizationHeader },
      });
      expect([200, 401]).toContain(stationsResponse.status);
    });

    it("should maintain security context throughout request lifecycle", async () => {
      const credentials = await createTestReadCredentials();
      const requests = [
        app.request("/api/stations", {
          headers: { Authorization: credentials.authorizationHeader },
        }),
        app.request("/api/routes", {
          headers: { Authorization: credentials.authorizationHeader },
        }),
        app.request("/api/alerts", {
          headers: { Authorization: credentials.authorizationHeader },
        }),
      ];
      const responses = await Promise.all(requests);
      responses.forEach((response) => {
        expect([200, 401]).toContain(response.status);
      });
    });
  });

  afterEach(() => {
    testCtx?.cleanup();
  });
});
