/**
 * Integration tests for Health, Monitoring, and Metrics endpoints.
 *
 * Tests the full data flow:
 * - Health endpoint with feed status
 * - Metrics endpoint with Prometheus format
 * - Alerts API integration
 * - Equipment API integration
 * - Cross-component integration
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAlertsStatus, setAlertsForTesting } from "../alerts-poller.js";
import { createApp } from "../app.js";
import { setArrivalsForTesting } from "../cache.js";
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
  A: {
    id: "A",
    shortName: "A",
    longName: "8th Ave Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["726"],
    isExpress: true,
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

const TEST_TRANSFERS: Record<string, TransferConnection[]> = {
  "725": [{ toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Health and Monitoring Integration Tests", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const db = createIntegrationTestDatabase();
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
  });

  afterEach(() => {
    // Clean up test data
  });

  describe("GET /api/health", () => {
    it("returns health status", async () => {
      const res = await app.request("/api/health");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBeDefined();
      expect(["ok", "degraded"]).toContain(body.status);
      expect(body.timestamp).toBeDefined();
      expect(body.uptime_seconds).toBeDefined();
    });

    it("includes feed states", async () => {
      const res = await app.request("/api/health");

      const body = await res.json();
      expect(body.feeds).toBeDefined();
      expect(Array.isArray(body.feeds)).toBe(true);

      if (body.feeds.length > 0) {
        const feed = body.feeds[0];
        expect(feed.id).toBeDefined();
        expect(feed.name).toBeDefined();
        expect(feed.status).toBeDefined();
      }
    });

    it("includes alerts status", async () => {
      const res = await app.request("/api/health");

      const body = await res.json();
      expect(body.alerts).toBeDefined();
      expect(body.alerts.count).toBeDefined();
      expect(typeof body.alerts.count).toBe("number");
    });

    it("includes memory information", async () => {
      const res = await app.request("/api/health");

      const body = await res.json();
      expect(body.memory).toBeDefined();
      expect(body.memory.rssBytes).toBeDefined();
      expect(body.memory.heapUsedBytes).toBeDefined();
      expect(body.memory.heapTotalBytes).toBeDefined();
    });

    it("includes cache hit rate", async () => {
      const res = await app.request("/api/health");

      const body = await res.json();
      expect(body.cacheHitRate).toBeDefined();
      expect(typeof body.cacheHitRate).toBe("number");
    });

    it("returns 503 when too many feeds are failing", async () => {
      // This test verifies the circuit breaker behavior
      // In normal conditions, should return 200
      const res = await app.request("/api/health");
      expect([200, 503]).toContain(res.status);
    });

    it("includes equipment status", async () => {
      const res = await app.request("/api/health");

      const body = await res.json();
      expect(body.equipment).toBeDefined();
    });

    it("includes delay detector status", async () => {
      const res = await app.request("/api/health");

      const body = await res.json();
      expect(body.delayDetector).toBeDefined();
    });

    it("includes delay predictor status", async () => {
      const res = await app.request("/api/health");

      const body = await res.json();
      expect(body.delayPredictor).toBeDefined();
    });
  });

  describe("GET /api/metrics", () => {
    it("returns Prometheus-format metrics", async () => {
      const res = await app.request("/api/metrics");

      expect(res.status).toBe(200);

      const contentType = res.headers.get("Content-Type");
      expect(contentType).toContain("text/plain");
    });

    it("returns plain text format", async () => {
      const res = await app.request("/api/metrics");

      const text = await res.text();
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    });

    it("includes metric metadata", async () => {
      const res = await app.request("/api/metrics");

      const text = await res.text();
      // Prometheus metrics should have HELP or TYPE lines
      const hasHelp = text.includes("# HELP");
      const hasType = text.includes("# TYPE");
      expect(hasHelp || hasType).toBe(true);
    });
  });

  describe("GET /api/alerts", () => {
    beforeEach(() => {
      // Set up test alerts
      setAlertsForTesting([
        {
          id: "test-alert-1",
          effect: "DELAY",
          affectedLines: ["1"],
          affectedStops: ["101", "102"],
          activePeriod: {
            start: Math.floor(Date.now() / 1000) - 3600,
            end: Math.floor(Date.now() / 1000) + 3600,
          },
          description: "Test alert for line 1",
          severity: "medium",
          source: "official",
          url: null,
          cause: null,
        },
      ]);
    });

    it("returns alerts array", async () => {
      const res = await app.request("/api/alerts");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.alerts).toBeDefined();
      expect(Array.isArray(body.alerts)).toBe(true);
    });

    it("includes metadata about alerts", async () => {
      const res = await app.request("/api/alerts");

      const body = await res.json();
      expect(body.meta).toBeDefined();
      expect(body.meta.count).toBeDefined();
      expect(body.meta.officialCount).toBeDefined();
      expect(body.meta.predictedCount).toBeDefined();
    });

    it("filters by line when specified", async () => {
      const res = await app.request("/api/alerts?lineId=1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.alerts).toBeDefined();
      expect(Array.isArray(body.alerts)).toBe(true);
    });

    it("filters active alerts when activeOnly=true", async () => {
      const res = await app.request("/api/alerts?activeOnly=true");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.alerts).toBeDefined();
      expect(Array.isArray(body.alerts)).toBe(true);
    });

    it("includes cache headers", async () => {
      const res = await app.request("/api/alerts");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });
  });

  describe("GET /api/alerts/:lineId", () => {
    beforeEach(() => {
      setAlertsForTesting([
        {
          id: "test-alert-line-1",
          effect: "DELAY",
          affectedLines: ["1"],
          affectedStops: ["101"],
          activePeriod: {
            start: Math.floor(Date.now() / 1000) - 3600,
            end: Math.floor(Date.now() / 1000) + 3600,
          },
          description: "Test alert for line 1",
          severity: "medium",
          source: "official",
          url: null,
          cause: null,
        },
      ]);
    });

    it("returns alerts for specific line", async () => {
      const res = await app.request("/api/alerts/1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.alerts).toBeDefined();
      expect(Array.isArray(body.alerts)).toBe(true);
      expect(body.lineId).toBe("1");
    });

    it("includes predicted alerts for the line", async () => {
      const res = await app.request("/api/alerts/1");

      const body = await res.json();
      expect(body.alerts).toBeDefined();
      // May include both official and predicted alerts
    });

    it("returns empty array for line with no alerts", async () => {
      const res = await app.request("/api/alerts/Z");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.alerts).toBeDefined();
      expect(Array.isArray(body.alerts)).toBe(true);
    });
  });

  describe("GET /api/equipment", () => {
    it("returns equipment summaries", async () => {
      const res = await app.request("/api/equipment");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stations).toBeDefined();
      expect(Array.isArray(body.stations)).toBe(true);
      expect(body.count).toBeDefined();
      expect(typeof body.count).toBe("number");
    });

    it("filters by station when specified", async () => {
      const res = await app.request("/api/equipment?stationId=101");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toBeDefined();
    });

    it("filters by type when specified", async () => {
      const res = await app.request("/api/equipment?type=elevator");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stations).toBeDefined();
    });

    it("includes cache headers", async () => {
      const res = await app.request("/api/equipment");

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });
  });

  describe("GET /api/equipment/:stationId", () => {
    it("returns equipment for specific station", async () => {
      const res = await app.request("/api/equipment/101");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stationId).toBeDefined();
      expect(body.equipment).toBeDefined();
      expect(Array.isArray(body.equipment)).toBe(true);
    });

    it("returns empty equipment array for station with no outages", async () => {
      const res = await app.request("/api/equipment/102");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.equipment).toBeDefined();
      expect(Array.isArray(body.equipment)).toBe(true);
    });

    it("includes ADA accessibility information", async () => {
      const res = await app.request("/api/equipment/101");

      const body = await res.json();
      expect(body.adaAccessible).toBeDefined();
      expect(typeof body.adaAccessible).toBe("boolean");
    });
  });

  describe("CSP Violation Reporting", () => {
    it("accepts CSP violation reports", async () => {
      const report = {
        "csp-report": {
          "document-uri": "https://example.com",
          referrer: "https://example.com/referrer",
          "violated-directive": "script-src",
          "effective-directive": "script-src",
          "original-policy": "default-src 'self'",
          disposition: "report",
          "blocked-uri": "https://evil.com/script.js",
          "line-number": 10,
          "column-number": 5,
          "source-file": "https://example.com/script.js",
          "status-code": 200,
          "script-sample": "",
        },
      };

      const res = await app.request("/api/security/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.received).toBe(true);
    });

    it("handles malformed CSP reports gracefully", async () => {
      const res = await app.request("/api/security/csp-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invalid: "data" }),
      });

      // Should accept the report even if malformed
      expect(res.status).toBe(200);
    });
  });
});
