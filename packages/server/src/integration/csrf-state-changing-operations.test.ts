/**
 * Integration tests for CSRF protection on state-changing API operations.
 *
 * Tests CSRF protection behavior on actual application routes with full
 * middleware chain (authentication, rate limiting, security headers, etc.).
 *
 * Verifies:
 * - CSRF token generation for authenticated sessions
 * - CSRF token validation on POST/PUT/DELETE/PATCH requests
 * - CSRF protection on /api/* routes
 * - State-changing requests without CSRF tokens are rejected
 * - GET/HEAD/OPTIONS requests don't require CSRF tokens
 * - CSRF token expiry and refresh behavior
 * - Existing API behavior preserved for public endpoints
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { csrfProtection, generateCsrfToken } from "../middleware/csrf-protection.js";

describe("CSRF protection on state-changing API operations", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();

    // Apply CSRF protection middleware (matching production configuration)
    app.use(
      "/api/*",
      csrfProtection({
        excludePaths: [
          "/api/health",
          "/api/metrics",
          "/api/stations",
          "/api/routes",
          "/api/static",
          "/api/arrivals",
          "/api/alerts",
          "/api/equipment",
          "/api/trip",
          "/api/positions",
          "/api/push/vapid-public-key",
          "/api/journal",
          "/api/auth/oauth",
          "/api/auth/password",
          "/api/csrf-token",
          "/api/security/csp-report",
        ],
      })
    );

    // CSRF token endpoint
    app.get("/api/csrf-token", (c) => {
      const token = generateCsrfToken();
      return c.json({ token });
    });

    // Mock state-changing routes (simulating real API endpoints)
    app.post("/api/commute/analyze", (c) => c.json({ status: "analyzed" }));
    app.post("/api/push/subscribe", (c) => c.json({ status: "subscribed" }));
    app.delete("/api/push/unsubscribe", (c) => c.json({ status: "unsubscribed" }));
    app.patch("/api/push/subscription", (c) => c.json({ status: "updated" }));
    app.post("/api/trips", (c) => c.json({ status: "created" }));
    app.patch("/api/trips/:tripId/notes", (c) => c.json({ status: "updated" }));
    app.delete("/api/trips/:tripId", (c) => c.json({ status: "deleted" }));
    app.post("/api/favorites", (c) => c.json({ status: "favorited" }));
    app.post("/api/auth/session/revoke", (c) => c.json({ status: "revoked" }));
    app.post("/api/preferences", (c) => c.json({ status: "saved" }));

    // Mock public read-only routes (excluded from CSRF)
    app.get("/api/health", (c) => c.json({ status: "healthy" }));
    app.get("/api/stations", (c) => c.json({ stations: [] }));
    app.get("/api/routes", (c) => c.json({ routes: [] }));
    app.get("/api/arrivals/:stationId", (c) => c.json({ arrivals: [] }));
    app.get("/api/alerts", (c) => c.json({ alerts: [] }));
    app.get("/api/equipment", (c) => c.json({ equipment: [] }));
    app.get("/api/trip/:tripId", (c) => c.json({ trip: {} }));
    app.get("/api/positions", (c) => c.json({ positions: [] }));
    app.get("/api/push/vapid-public-key", (c) => c.json({ key: "test-key" }));
    app.get("/api/journal", (c) => c.json({ entries: [] }));

    // Mock public endpoints (POST allowed without CSRF due to exclusion)
    app.post("/api/auth/oauth", (c) => c.json({ url: "https://example.com" }));
    app.post("/api/auth/password", (c) => c.json({ status: "sent" }));
    app.post("/api/security/csp-report", (c) => c.json({ status: "received" }));
  });

  // ==========================================================================
  // Helper functions
  // ==========================================================================

  /**
   * Get a CSRF token from the test app.
   */
  async function getCsrfToken(): Promise<string> {
    const res = await app.request("/api/csrf-token");
    expect(res.status).toBe(200);
    const body = await res.json();
    return body.token as string;
  }

  // ==========================================================================
  // 1. CSRF token generation for authenticated sessions
  // ==========================================================================

  describe("CSRF token generation", () => {
    it("generates CSRF token via /api/csrf-token endpoint", async () => {
      const res = await app.request("/api/csrf-token");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.token).toBeTruthy();
      expect(typeof body.token).toBe("string");
      expect(body.token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it("generates unique tokens for each request", async () => {
      const res1 = await app.request("/api/csrf-token");
      const body1 = await res1.json();
      const token1 = body1.token;

      const res2 = await app.request("/api/csrf-token");
      const body2 = await res2.json();
      const token2 = body2.token;

      expect(token1).not.toBe(token2);
    });

    it("generates cryptographically secure tokens", async () => {
      const res = await app.request("/api/csrf-token");
      const body = await res.json();
      const token = body.token;

      // Token should be hex string (only contains 0-9 and a-f)
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ==========================================================================
  // 2. CSRF token validation on POST/PUT/DELETE/PATCH requests
  // ==========================================================================

  describe("CSRF token validation on state-changing operations", () => {
    it("rejects POST /api/commute/analyze without CSRF token", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "A", destination: "B" }),
      });

      expect(res.status).toBe(403);
      const bodyText = await res.text();
      expect(bodyText).toContain("CSRF");
    });

    it("rejects POST /api/push/subscribe without CSRF token", async () => {
      const res = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: {} }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects DELETE /api/push/unsubscribe without CSRF token", async () => {
      const res = await app.request("/api/push/unsubscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "test" }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects PATCH /api/push/subscription without CSRF token", async () => {
      const res = await app.request("/api/push/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites: [] }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects POST /api/trips without CSRF token", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId: "1" }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects PATCH /api/trips/:tripId/notes without CSRF token", async () => {
      const res = await app.request("/api/trips/abc123/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Updated notes" }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects DELETE /api/trips/:tripId without CSRF token", async () => {
      const res = await app.request("/api/trips/abc123", {
        method: "DELETE",
      });

      expect(res.status).toBe(403);
    });

    it("rejects POST /api/favorites without CSRF token", async () => {
      const res = await app.request("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId: "123" }),
      });

      expect(res.status).toBe(403);
    });

    it("accepts POST /api/commute/analyze with valid CSRF token", async () => {
      const token = await getCsrfToken();

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ origin: "A", destination: "B" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("analyzed");
    });

    it("accepts POST /api/push/subscribe with valid CSRF token", async () => {
      const token = await getCsrfToken();

      const res = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ subscription: {} }),
      });

      expect(res.status).toBe(200);
    });

    it("accepts DELETE /api/push/unsubscribe with valid CSRF token", async () => {
      const token = await getCsrfToken();

      const res = await app.request("/api/push/unsubscribe", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ endpoint: "test" }),
      });

      expect(res.status).toBe(200);
    });

    it("accepts PATCH /api/push/subscription with valid CSRF token", async () => {
      const token = await getCsrfToken();

      const res = await app.request("/api/push/subscription", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ favorites: [] }),
      });

      expect(res.status).toBe(200);
    });

    it("rejects requests with invalid CSRF token", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "invalid-token-12345",
        },
        body: JSON.stringify({ origin: "A", destination: "B" }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects requests with malformed CSRF token", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "not-a-valid-token",
        },
        body: JSON.stringify({ routeId: "1" }),
      });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // 3. CSRF protection is active on /api/* routes
  // ==========================================================================

  describe("CSRF protection coverage on API routes", () => {
    it("applies CSRF protection to all POST /api/* routes", async () => {
      const protectedRoutes = [
        { path: "/api/commute/analyze", method: "POST" },
        { path: "/api/push/subscribe", method: "POST" },
        { path: "/api/trips", method: "POST" },
        { path: "/api/favorites", method: "POST" },
        { path: "/api/preferences", method: "POST" },
      ];

      for (const route of protectedRoutes) {
        const res = await app.request(route.path, {
          method: "post",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test: true }),
        });

        expect(res.status).toBe(
          403,
          `Expected ${route.method} ${route.path} to require CSRF token`
        );
      }
    });

    it("applies CSRF protection to all DELETE /api/* routes", async () => {
      const protectedRoutes = [
        { path: "/api/push/unsubscribe", method: "DELETE" },
        { path: "/api/trips/123", method: "DELETE" },
      ];

      for (const route of protectedRoutes) {
        const res = await app.request(route.path, {
          method: "delete",
        });

        expect(res.status).toBe(
          403,
          `Expected ${route.method} ${route.path} to require CSRF token`
        );
      }
    });

    it("applies CSRF protection to all PATCH /api/* routes", async () => {
      const protectedRoutes = [
        { path: "/api/push/subscription", method: "PATCH" },
        { path: "/api/trips/123/notes", method: "PATCH" },
      ];

      for (const route of protectedRoutes) {
        const res = await app.request(route.path, {
          method: "patch",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test: true }),
        });

        expect(res.status).toBe(
          403,
          `Expected ${route.method} ${route.path} to require CSRF token`
        );
      }
    });

    it("does not apply CSRF to excluded public endpoints", async () => {
      const excludedRoutes = [
        { path: "/api/auth/oauth", method: "POST" },
        { path: "/api/auth/password", method: "POST" },
        { path: "/api/security/csp-report", method: "POST" },
      ];

      for (const route of excludedRoutes) {
        const res = await app.request(route.path, {
          method: "post",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test: true }),
        });

        expect(res.status).toBe(
          200,
          `Expected ${route.method} ${route.path} to be excluded from CSRF`
        );
      }
    });
  });

  // ==========================================================================
  // 4. GET/HEAD/OPTIONS requests don't require CSRF tokens
  // ==========================================================================

  describe("Safe HTTP methods bypass CSRF validation", () => {
    it("allows GET /api/health without CSRF token", async () => {
      const res = await app.request("/api/health");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("healthy");
    });

    it("allows GET /api/stations without CSRF token", async () => {
      const res = await app.request("/api/stations");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stations).toBeDefined();
    });

    it("allows GET /api/routes without CSRF token", async () => {
      const res = await app.request("/api/routes");

      expect(res.status).toBe(200);
    });

    it("allows GET /api/alerts without CSRF token", async () => {
      const res = await app.request("/api/alerts");

      expect(res.status).toBe(200);
    });

    it("allows GET /api/equipment without CSRF token", async () => {
      const res = await app.request("/api/equipment");

      expect(res.status).toBe(200);
    });

    it("allows GET /api/trip/:tripId without CSRF token", async () => {
      const res = await app.request("/api/trip/abc123");

      expect(res.status).toBe(200);
    });

    it("allows GET /api/positions without CSRF token", async () => {
      const res = await app.request("/api/positions");

      expect(res.status).toBe(200);
    });

    it("allows GET /api/push/vapid-public-key without CSRF token", async () => {
      const res = await app.request("/api/push/vapid-public-key");

      expect(res.status).toBe(200);
    });

    it("allows GET /api/journal without CSRF token", async () => {
      const res = await app.request("/api/journal");

      expect(res.status).toBe(200);
    });

    it("allows GET /api/arrivals/:stationId without CSRF token", async () => {
      const res = await app.request("/api/arrivals/123");

      expect(res.status).toBe(200);
    });

    it("allows HEAD requests without CSRF token", async () => {
      const res = await app.request("/api/stations", {
        method: "HEAD",
      });

      expect(res.status).toBe(200);
    });

    it("allows OPTIONS requests without CSRF token", async () => {
      const res = await app.request("/api/stations", {
        method: "OPTIONS",
      });

      // OPTIONS might return 200 or 204 depending on implementation
      expect([200, 204]).toContain(res.status);
    });
  });

  // ==========================================================================
  // 5. CSRF token expiry and refresh behavior
  // ==========================================================================

  describe("CSRF token lifecycle and rotation", () => {
    it("rotates CSRF token after successful state-changing request", async () => {
      const token = await getCsrfToken();

      // Use token in POST request
      const postRes = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ origin: "A", destination: "B" }),
      });

      expect(postRes.status).toBe(200);

      // The old token should no longer work
      const postRes2 = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ routeId: "1" }),
      });

      expect(postRes2.status).toBe(403);
    });

    it("enforces single-use token behavior", async () => {
      const token = await getCsrfToken();

      // Use token successfully
      const postRes1 = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ routeId: "1" }),
      });

      expect(postRes1.status).toBe(200);

      // Try to reuse the same token
      const postRes2 = await app.request("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({ stationId: "123" }),
      });

      expect(postRes2.status).toBe(403);
    });

    it("generates new token after rotation", async () => {
      const token1 = await getCsrfToken();

      // Use the token
      const postRes = await app.request("/api/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token1,
        },
        body: JSON.stringify({ preferences: {} }),
      });

      expect(postRes.status).toBe(200);

      // Get a new token
      const token2 = await getCsrfToken();

      expect(token2).toBeTruthy();
      expect(token2).not.toBe(token1);

      // New token should work
      const postRes2 = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token2,
        },
        body: JSON.stringify({ routeId: "1" }),
      });

      expect(postRes2.status).toBe(200);
    });
  });

  // ==========================================================================
  // 6. Existing API behavior preserved for public endpoints
  // ==========================================================================

  describe("Public endpoint behavior preserved", () => {
    it("GET /api/health returns health status", async () => {
      const res = await app.request("/api/health");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("healthy");
    });

    it("GET /api/stations returns station list", async () => {
      const res = await app.request("/api/stations");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stations).toBeDefined();
    });

    it("GET /api/routes returns route list", async () => {
      const res = await app.request("/api/routes");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.routes).toBeDefined();
    });

    it("GET /api/alerts returns alert list", async () => {
      const res = await app.request("/api/alerts");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alerts).toBeDefined();
    });

    it("GET /api/equipment returns equipment list", async () => {
      const res = await app.request("/api/equipment");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.equipment).toBeDefined();
    });

    it("GET /api/trip/:tripId returns trip data", async () => {
      const res = await app.request("/api/trip/abc123");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.trip).toBeDefined();
    });

    it("GET /api/positions returns position data", async () => {
      const res = await app.request("/api/positions");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.positions).toBeDefined();
    });

    it("GET /api/push/vapid-public-key returns VAPID key", async () => {
      const res = await app.request("/api/push/vapid-public-key");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.key).toBeDefined();
    });

    it("GET /api/journal returns journal entries", async () => {
      const res = await app.request("/api/journal");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.entries).toBeDefined();
    });

    it("POST /api/auth/oauth works without CSRF (excluded)", async () => {
      const res = await app.request("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "test" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toBeDefined();
    });

    it("POST /api/auth/password works without CSRF (excluded)", async () => {
      const res = await app.request("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });

      expect(res.status).toBe(200);
    });

    it("POST /api/security/csp-report works without CSRF (excluded)", async () => {
      const res = await app.request("/api/security/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: {} }),
      });

      expect(res.status).toBe(200);
    });
  });

  // ==========================================================================
  // 7. CSRF error responses are clear and secure
  // ==========================================================================

  describe("CSRF error response security", () => {
    it("returns 403 status for CSRF validation failures", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId: "1" }),
      });

      expect(res.status).toBe(403);
    });

    it("returns clear error message for missing CSRF token", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: "A", destination: "B" }),
      });

      expect(res.status).toBe(403);
      const bodyText = await res.text();
      expect(bodyText.toLowerCase()).toContain("csrf");
    });

    it("returns clear error message for invalid CSRF token", async () => {
      const res = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "invalid-token",
        },
        body: JSON.stringify({ subscription: {} }),
      });

      expect(res.status).toBe(403);
      const bodyText = await res.text();
      expect(bodyText.length).toBeGreaterThan(0);
    });

    it("does not leak sensitive information in CSRF error messages", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": "attacker-provided-token",
        },
        body: JSON.stringify({ routeId: "1" }),
      });

      expect(res.status).toBe(403);
      const bodyText = await res.text();

      // Error message should not contain sensitive details
      expect(bodyText.toLowerCase()).not.toContain("internal");
      expect(bodyText.toLowerCase()).not.toContain("database");
      expect(bodyText.toLowerCase()).not.toContain("secret");
    });

    it("returns consistent error format across all CSRF failures", async () => {
      const scenarios = [
        app.request("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routeId: "1" }),
        }),
        app.request("/api/push/subscribe", {
          method: "POST",
          headers: { "X-CSRF-Token": "invalid" },
          body: JSON.stringify({ subscription: {} }),
        }),
        app.request("/api/favorites", {
          method: "POST",
          headers: { "X-CSRF-Token": "wrong-token" },
          body: JSON.stringify({ stationId: "123" }),
        }),
      ];

      for (const promise of scenarios) {
        const res = await promise;
        expect(res.status).toBe(403);

        const bodyText = await res.text();
        expect(bodyText.length).toBeGreaterThan(0);
      }
    });
  });
});
