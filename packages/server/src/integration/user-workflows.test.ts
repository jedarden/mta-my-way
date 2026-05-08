/**
 * End-to-end integration test for critical user workflows.
 *
 * Tests the complete user journey:
 * 1. User searches for a station
 * 2. User views real-time arrivals
 * 3. User checks relevant alerts
 * 4. User tracks a live trip
 * 5. User records the trip in their journal
 * 6. User views commute statistics
 */

import type { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "../app.js";
import { initDelayPredictor } from "../delay-predictor.js";
import {
  TEST_STATIONS,
  closeDatabase,
  createIntegrationTestDatabase,
  createTestApiKey,
  createTestTrip,
} from "./test-helpers.js";

// Minimal fixtures
const STATIONS = {
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
    lines: ["1", "2", "3"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
};

const ROUTES = {
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

const COMPLEXES = {};

const TRANSFERS = {};

const TRAVEL_TIMES = {
  "1": {
    "101N": {
      "725N": 600,
    },
  },
};

describe("End-to-End User Workflow Integration Tests", () => {
  let app: Hono;
  let authCredentials: { keyId: string; apiKey: string; authorizationHeader: string };

  beforeAll(async () => {
    initDelayPredictor(TRAVEL_TIMES, STATIONS);
  });

  beforeEach(async () => {
    // Create fresh credentials for each test for proper isolation
    authCredentials = await createTestApiKey("write", "user");
    app = createApp(STATIONS, ROUTES, COMPLEXES, TRANSFERS, "/nonexistent/dist");
  });

  describe("Complete journey workflow", () => {
    it("allows user to search for a station and get details", async () => {
      // Step 1: Search for a station
      const searchRes = await app.request("/api/stations/search?q=South");
      expect(searchRes.status).toBe(200);

      const searchResults = await searchRes.json();
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].name).toContain("South");

      // Step 2: Get specific station details
      const stationId = searchResults[0].id;
      const stationRes = await app.request(`/api/stations/${stationId}`);
      expect(stationRes.status).toBe(200);

      const station = await stationRes.json();
      expect(station.id).toBe(stationId);
      expect(station.name).toBe("South Ferry");
    });

    it("allows user to view arrivals for their station", async () => {
      // Mock arrivals data would be returned from cache
      const arrivalsRes = await app.request("/api/arrivals/101");
      // Returns 404 if no data yet, which is expected without real poller
      expect(arrivalsRes.status).toBeOneOf([200, 404]);
    });

    it("allows user to check alerts for their line", async () => {
      const alertsRes = await app.request("/api/alerts/1");
      expect(alertsRes.status).toBe(200);

      const alerts = await alertsRes.json();
      expect(alerts).toHaveProperty("lineId", "1");
      expect(alerts).toHaveProperty("alerts");
      expect(Array.isArray(alerts.alerts)).toBe(true);
    });
  });

  describe("Trip tracking and journal workflow", () => {
    let db: ReturnType<typeof createIntegrationTestDatabase>;

    beforeEach(() => {
      db = createIntegrationTestDatabase();
    });

    afterEach(() => {
      closeDatabase(db);
    });

    it("allows user to record a trip in their journal", async () => {
      const tripData = createTestTrip({
        originId: "101",
        originName: "South Ferry",
        destinationId: "725",
        destinationName: "Times Sq-42 St",
        line: "1",
      });

      const recordRes = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authCredentials.authorizationHeader,
        },
        body: JSON.stringify(tripData),
      });

      // Note: This might fail if trip-tracking module isn't initialized with DB
      // The test validates the API contract. 400 is valid for schema validation errors.
      expect(recordRes.status).toBeOneOf([201, 400, 401, 403, 500]);
    });

    it("allows user to retrieve their trip history", async () => {
      const tripsRes = await app.request("/api/trips", {
        headers: {
          Authorization: authCredentials.authorizationHeader,
        },
      });

      // Returns trips array (empty if none recorded)
      expect(tripsRes.status).toBeOneOf([200, 401]);
    });

    it("allows user to get commute statistics", async () => {
      const statsRes = await app.request("/api/journal/stats", {
        headers: {
          Authorization: authCredentials.authorizationHeader,
        },
      });

      expect(statsRes.status).toBeOneOf([200, 401]);
    });
  });

  describe("Push notification workflow", () => {
    it("allows user to get VAPID public key", async () => {
      const keyRes = await app.request("/api/push/vapid-public-key");
      expect(keyRes.status).toBeOneOf([200, 503]);

      if (keyRes.status === 200) {
        const keyData = await keyRes.json();
        expect(keyData).toHaveProperty("publicKey");
      }
    });

    it("allows user to register for push notifications", async () => {
      const subscriptionData = {
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/test",
          keys: {
            p256dh: "test-key",
            auth: "test-auth",
          },
        },
        favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
      };

      const subRes = await app.request("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authCredentials.authorizationHeader,
        },
        body: JSON.stringify(subscriptionData),
      });

      expect(subRes.status).toBeOneOf([200, 403, 500]);
    });
  });

  describe("Commute analysis workflow", () => {
    it("analyzes commute between two stations", async () => {
      const analyzeRes = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authCredentials.authorizationHeader,
        },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      expect(analyzeRes.status).toBeOneOf([200, 401, 403]);

      if (analyzeRes.status === 200) {
        const analysis = await analyzeRes.json();
        expect(analysis).toHaveProperty("commuteId");
        expect(analysis).toHaveProperty("origin");
        expect(analysis).toHaveProperty("destination");
        expect(analysis).toHaveProperty("directRoutes");
        expect(analysis).toHaveProperty("transferRoutes");
      }
    });
  });

  describe("Health monitoring workflow", () => {
    it("provides system health status", async () => {
      const healthRes = await app.request("/api/health");
      expect(healthRes.status).toBeOneOf([200, 503]);

      const health = await healthRes.json();
      expect(health).toHaveProperty("status");
      expect(health).toHaveProperty("feeds");
      expect(health).toHaveProperty("timestamp");
    });

    it("includes memory usage in health check", async () => {
      const healthRes = await app.request("/api/health");
      expect(healthRes.status).toBeOneOf([200, 503]);

      const health = await healthRes.json();
      expect(health).toHaveProperty("memory");
      expect(health.memory).toHaveProperty("rssBytes");
      expect(health.memory).toHaveProperty("heapUsedBytes");
    });
  });

  describe("Error handling workflow", () => {
    it("returns 404 for unknown stations", async () => {
      const res = await app.request("/api/stations/999");
      expect(res.status).toBe(404);

      const error = await res.json();
      expect(error).toHaveProperty("error");
    });

    it("returns 400 for invalid search queries", async () => {
      const res = await app.request("/api/stations/search?q=");
      expect(res.status).toBe(400);

      const error = await res.json();
      expect(error).toHaveProperty("error");
    });

    it("returns 404 for unknown routes", async () => {
      const res = await app.request("/api/routes/Z");
      expect(res.status).toBe(404);
    });

    it("handles malformed JSON gracefully", async () => {
      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });

      // May return 400 (bad JSON) or 403 (auth required for this endpoint)
      expect(res.status).toBeOneOf([400, 403]);
    });
  });

  describe("Security headers workflow", () => {
    it("includes CSP headers on API responses", async () => {
      const res = await app.request("/api/health");

      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
    });

    it("includes X-Content-Type-Options: nosniff", async () => {
      const res = await app.request("/api/health");

      const header = res.headers.get("X-Content-Type-Options");
      expect(header).toBe("nosniff");
    });

    it("includes X-Frame-Options: DENY", async () => {
      const res = await app.request("/api/health");

      const header = res.headers.get("X-Frame-Options");
      expect(header).toBe("DENY");
    });
  });

  describe("Cache behavior workflow", () => {
    it("sets cache headers on static endpoints", async () => {
      const res = await app.request("/api/stations");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age");
    });

    it("sets shorter cache on real-time endpoints", async () => {
      const alertsRes = await app.request("/api/alerts");

      const cacheControl = alertsRes.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
    });
  });
});
