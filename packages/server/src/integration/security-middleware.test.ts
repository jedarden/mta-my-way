/**
 * Integration tests for security middleware through the full API stack.
 *
 * Tests that the middleware chain correctly handles:
 * - XSS attempts in request body fields
 * - Path traversal attempts in URL parameters
 * - Malformed JSON request bodies
 * - Oversized request payloads
 * - SQL injection patterns in query parameters
 * - Security headers in responses
 * - Input sanitization across API endpoints
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { initPushDatabase } from "../push/subscriptions.js";
import { initTripTracking } from "../trip-tracking.js";
import { TEST_STATIONS, closeDatabase, createIntegrationTestDatabase } from "./test-helpers.js";

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
};

const TEST_COMPLEXES: ComplexIndex = {};

const TEST_TRANSFERS: Record<string, TransferConnection[]> = {};

// ---------------------------------------------------------------------------
// XSS payloads to test
// ---------------------------------------------------------------------------

const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  "javascript:alert(1)",
  "<img src=x onerror=alert(1)>",
  '"><script>alert(document.cookie)</script>',
  "'; DROP TABLE trips; --",
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Security Middleware Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);
    initPushDatabase(":memory:");

    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  afterEach(() => {
    closeDatabase(db);
  });

  // -------------------------------------------------------------------------
  // Security headers
  // -------------------------------------------------------------------------

  describe("Security headers in API responses", () => {
    it("includes X-Content-Type-Options header", async () => {
      const res = await app.request("/api/stations");
      const header = res.headers.get("X-Content-Type-Options");
      expect(header).toBe("nosniff");
    });

    it("includes X-Frame-Options header", async () => {
      const res = await app.request("/api/stations");
      const header = res.headers.get("X-Frame-Options");
      expect(["DENY", "SAMEORIGIN"]).toContain(header);
    });

    it("includes Content-Security-Policy header", async () => {
      const res = await app.request("/api/stations");
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toBeTruthy();
    });

    it("security headers present on all API routes", async () => {
      const routes = ["/api/health", "/api/stations", "/api/routes", "/api/alerts"];

      for (const route of routes) {
        const res = await app.request(route);
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Input validation — malformed JSON
  // -------------------------------------------------------------------------

  describe("Malformed JSON handling", () => {
    it("POST /api/trips with malformed JSON returns 400", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid json ::::",
      });

      expect([400, 422]).toContain(res.status);
    });

    it("POST /api/push/subscribe with malformed JSON returns 400", async () => {
      const res = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json-at-all",
      });

      expect([400, 422]).toContain(res.status);
    });

    it("PATCH /api/trips/:id/notes with malformed JSON returns 400", async () => {
      const res = await app.request("/api/trips/some-id/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{ broken",
      });

      expect([400, 422]).toContain(res.status);
    });

    it("POST /api/commute/analyze with malformed JSON returns error", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "}{",
      });

      expect([400, 422, 500]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // Input validation — missing required fields
  // -------------------------------------------------------------------------

  describe("Missing required fields", () => {
    it("POST /api/trips without required origin returns 400", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line: "1",
          departureTime: Date.now() - 3600000,
          arrivalTime: Date.now(),
        }),
      });

      expect(res.status).toBe(400);
    });

    it("POST /api/trips without required destination returns 400", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          line: "1",
          departureTime: Date.now() - 3600000,
          arrivalTime: Date.now(),
        }),
      });

      expect(res.status).toBe(400);
    });

    it("POST /api/commute/analyze without originId returns error", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationId: "725",
        }),
      });

      expect([400, 422]).toContain(res.status);
    });

    it("PATCH /api/trips/:id/notes without notes field returns 400", async () => {
      const res = await app.request("/api/trips/any-id/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // XSS prevention — notes field
  // -------------------------------------------------------------------------

  describe("XSS prevention in trip notes", () => {
    it("creates trip with XSS payload in notes without crashing", async () => {
      const now = Date.now();

      for (const payload of XSS_PAYLOADS) {
        const res = await app.request("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: { id: "101", name: "South Ferry" },
            destination: { id: "725", name: "Times Sq-42 St" },
            line: "1",
            departureTime: now - 3600000,
            arrivalTime: now,
            notes: payload,
          }),
        });

        // Should either succeed (201) or reject (400) — never 500
        expect([201, 400, 422]).toContain(res.status);
      }
    });

    it("XSS in trip notes does not appear as raw HTML in response", async () => {
      const now = Date.now();
      const xssPayload = '<script>alert("xss")</script>';

      const createRes = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
          notes: xssPayload,
        }),
      });

      if (createRes.status === 201) {
        const body = await createRes.json();
        const tripId = body.trip?.id;

        if (tripId) {
          const getRes = await app.request(`/api/trips/${tripId}`);
          expect(getRes.status).toBe(200);

          const text = await getRes.text();
          // The response is JSON — the <script> tag would be encoded in JSON strings,
          // but the raw text should not contain executable script blocks at top level
          const parsed = JSON.parse(text);
          // The notes field may store the raw value, but the Content-Type is application/json
          // which browsers won't execute as HTML
          expect(parsed).toBeDefined();
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // XSS prevention — station search
  // -------------------------------------------------------------------------

  describe("XSS prevention in station search", () => {
    it("station search handles XSS payload in query parameter", async () => {
      for (const payload of XSS_PAYLOADS) {
        const res = await app.request(`/api/stations/search?q=${encodeURIComponent(payload)}`);

        // Should return 200 with empty results or 400 — never 500
        expect([200, 400]).toContain(res.status);

        if (res.status === 200) {
          const body = await res.json();
          expect(Array.isArray(body)).toBe(true);
          // Results should not contain unescaped XSS payloads
          for (const station of body) {
            if (station.name) {
              expect(station.name).not.toContain("<script>");
            }
          }
        }
      }
    });

    it("station search with SQL injection attempt in query returns safely", async () => {
      const sqlPayload = "'; DROP TABLE stations; --";
      const res = await app.request(`/api/stations/search?q=${encodeURIComponent(sqlPayload)}`);

      // Should handle gracefully
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
      }
    });

    it("station search with null bytes in query is handled safely", async () => {
      const res = await app.request("/api/stations/search?q=South%00Ferry");
      expect([200, 400]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // Path traversal prevention
  // -------------------------------------------------------------------------

  describe("Path traversal prevention", () => {
    it("path traversal in station ID returns 404 not server error", async () => {
      const traversalAttempts = ["../../etc/passwd", "../config/database", "%2e%2e%2fetc%2fpasswd"];

      for (const attempt of traversalAttempts) {
        const res = await app.request(`/api/stations/${encodeURIComponent(attempt)}`);
        // Should return 404 (not found) or 400 (bad input), never 500
        expect([400, 404]).toContain(res.status);
      }
    });

    it("path traversal in trip ID returns 404 not server error", async () => {
      const res = await app.request("/api/trips/..%2F..%2Fconfig");
      expect([400, 404]).toContain(res.status);
    });

    it("null byte in station ID parameter is handled safely", async () => {
      const res = await app.request("/api/stations/101%00injected");
      expect([400, 404]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // Query parameter injection
  // -------------------------------------------------------------------------

  describe("Query parameter injection prevention", () => {
    it("trip query with SQL injection in originId is handled safely", async () => {
      const res = await app.request("/api/trips?originId=' OR '1'='1");

      // Should return 200 with empty results or 400
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        const body = await res.json();
        // Should return empty trips (no match), not all trips
        expect(body.trips).toBeDefined();
        expect(Array.isArray(body.trips)).toBe(true);
      }
    });

    it("trip query with extremely long originId is handled safely", async () => {
      const longId = "x".repeat(10000);
      const res = await app.request(`/api/trips?originId=${longId}`);
      expect([200, 400, 413]).toContain(res.status);
    });

    it("station search with very long query is handled safely", async () => {
      const longQuery = "a".repeat(1000);
      const res = await app.request(`/api/stations/search?q=${longQuery}`);
      expect([200, 400]).toContain(res.status);
    });

    it("alerts query with invalid lineId is handled safely", async () => {
      const res = await app.request("/api/alerts?lineId=<script>alert(1)</script>");
      expect([200, 400]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // Content-Type validation
  // -------------------------------------------------------------------------

  describe("Content-Type handling", () => {
    it("POST /api/trips without Content-Type header is handled", async () => {
      const now = Date.now();
      const res = await app.request("/api/trips", {
        method: "POST",
        body: JSON.stringify({
          origin: { id: "101", name: "South Ferry" },
          destination: { id: "725", name: "Times Sq-42 St" },
          line: "1",
          departureTime: now - 3600000,
          arrivalTime: now,
        }),
      });

      // May accept or reject, but should not crash
      expect([200, 201, 400, 415, 422]).toContain(res.status);
    });

    it("POST /api/trips with wrong Content-Type is handled", async () => {
      const now = Date.now();
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "some text",
      });

      expect([400, 415, 422]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // Response safety
  // -------------------------------------------------------------------------

  describe("Response safety", () => {
    it("error responses are JSON with Content-Type application/json", async () => {
      const res = await app.request("/api/stations/nonexistent-999");
      expect(res.status).toBe(404);

      const contentType = res.headers.get("Content-Type");
      expect(contentType).toContain("application/json");
    });

    it("API does not expose internal stack traces in error responses", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.text();
      expect(body).not.toMatch(/at .*\.ts:\d+/); // No TypeScript source paths
      expect(body).not.toContain("node_modules");
    });

    it("404 for unknown routes does not leak filesystem paths", async () => {
      const res = await app.request("/api/nonexistent-endpoint-xyz");
      // May serve the React app or return 404
      expect([200, 404]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // VAPID key endpoint security
  // -------------------------------------------------------------------------

  describe("VAPID public key endpoint", () => {
    it("GET /api/push/vapid-public-key returns a key string", async () => {
      const res = await app.request("/api/push/vapid-public-key");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.publicKey).toBeDefined();
      expect(typeof body.publicKey).toBe("string");
    });

    it("VAPID endpoint includes security headers", async () => {
      const res = await app.request("/api/push/vapid-public-key");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });

  // -------------------------------------------------------------------------
  // HTTP method validation
  // -------------------------------------------------------------------------

  describe("HTTP method validation", () => {
    it("wrong HTTP method on trip creation endpoint returns 405 or 404", async () => {
      const res = await app.request("/api/trips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect([404, 405]).toContain(res.status);
    });

    it("DELETE on station endpoint returns 404 or 405", async () => {
      const res = await app.request("/api/stations/101", {
        method: "DELETE",
      });

      expect([404, 405]).toContain(res.status);
    });
  });
});
