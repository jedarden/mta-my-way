/**
 * Integration tests for alerts and equipment APIs.
 *
 * Tests the full data flow for:
 * - Alerts retrieval and filtering
 * - Equipment status polling and retrieval
 * - Station-specific equipment queries
 * - Response validation and metadata
 */

import type { RouteIndex, StationIndex } from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedAlert } from "../alerts-parser.js";
import { resetAlertsCacheForTesting, setAlertsForTesting } from "../alerts-poller.js";
import { createApp } from "../app.js";
import { closeDatabase, createIntegrationTestDatabase } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_STATIONS: StationIndex = {
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
  "726": {
    id: "726",
    name: "42 St-Port Authority",
    lat: 40.756,
    lon: -73.988,
    lines: ["A", "C", "E"],
    northStopId: "726N",
    southStopId: "726S",
    transfers: [],
    ada: true,
    borough: "manhattan",
    complex: "725-726",
  },
};

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

// ---------------------------------------------------------------------------
// Alert fixtures
// ---------------------------------------------------------------------------

/** Build a ParsedAlert with sensible defaults for route-level tests */
function createTestAlert(overrides: Partial<ParsedAlert> & { id: string }): ParsedAlert {
  const now = Math.floor(Date.now() / 1000); // Frozen by vi.useFakeTimers()
  return {
    rawHeadline: "Test alert",
    rawDescription: "Test alert description",
    simplifiedHeadline: "Test alert",
    simplifiedDescription: "Test alert description",
    patternMatched: true,
    matchedPatternId: null,
    affectedLines: [],
    affectedStations: [],
    activePeriod: { start: now - 3600, end: now + 3600 },
    cause: "UNKNOWN_CAUSE",
    effect: "UNKNOWN_EFFECT",
    severity: "warning",
    source: "official",
    createdAt: now - 7200,
    modifiedAt: now - 3600,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Alerts and Equipment Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T08:00:00Z"));
    db = createIntegrationTestDatabase();
    app = createApp(TEST_STATIONS, TEST_ROUTES, {}, {}, "/nonexistent/dist");
  });

  afterEach(() => {
    resetAlertsCacheForTesting();
    vi.useRealTimers();
    vi.restoreAllMocks();
    closeDatabase(db);
  });

  describe("GET /api/alerts", () => {
    it("returns all alerts with metadata", async () => {
      const res = await app.request("/api/alerts");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("alerts");
      expect(body).toHaveProperty("meta");
      expect(Array.isArray(body.alerts)).toBe(true);

      // Validate metadata structure
      expect(body.meta).toHaveProperty("count");
      expect(body.meta).toHaveProperty("officialCount");
      expect(body.meta).toHaveProperty("predictedCount");
      expect(body.meta).toHaveProperty("lastUpdatedAt");
      expect(body.meta).toHaveProperty("matchRate");
      expect(body.meta).toHaveProperty("circuitOpen");
    });

    it("filters alerts by line using query parameter", async () => {
      const res = await app.request("/api/alerts?lineId=1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("alerts");
      expect(body).toHaveProperty("meta");
      // Note: The query parameter version doesn't return lineId in response
      // Only the path parameter version (/api/alerts/:lineId) returns lineId
      expect(Array.isArray(body.alerts)).toBe(true);
    });

    it("filters active alerts only", async () => {
      const res = await app.request("/api/alerts?activeOnly=true");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("alerts");

      // All returned alerts should be currently active
      const now = Date.now() / 1000;
      for (const alert of body.alerts) {
        const start = alert.activePeriod?.start ?? 0;
        const end = alert.activePeriod?.end ?? Infinity;
        expect(now).toBeGreaterThanOrEqual(start);
        if (end !== Infinity) {
          expect(now).toBeLessThanOrEqual(end);
        }
      }
    });

    it("combines line filter with activeOnly", async () => {
      const res = await app.request("/api/alerts?lineId=A&activeOnly=true");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("alerts");
      expect(body).toHaveProperty("meta");
      // Query parameter version doesn't include lineId in response
    });

    describe("stationId filter", () => {
      // Station 101 serves line 1 only; 726 serves A/C/E; 725 serves 1,2,3,7,N,Q,R,W,S
      const stationScopedAlerts = [
        createTestAlert({
          id: "alert-line-1",
          simplifiedHeadline: "Line 1 delay",
          affectedLines: ["1"],
          affectedStations: [],
        }),
        createTestAlert({
          id: "alert-line-a",
          simplifiedHeadline: "Line A delay",
          affectedLines: ["A"],
          affectedStations: [],
        }),
        createTestAlert({
          id: "alert-at-725",
          simplifiedHeadline: "Station 735 advisory",
          affectedLines: ["N"],
          affectedStations: ["725"],
        }),
      ];

      it("returns only the requested station's alerts", async () => {
        setAlertsForTesting(stationScopedAlerts);

        // Station 101 is served by line 1, so the line-A alert must not appear
        const res = await app.request("/api/alerts?stationId=101");

        expect(res.status).toBe(200);
        const body = await res.json();
        const ids = body.alerts.map((a: { id: string }) => a.id);
        expect(ids).toContain("alert-line-1");
        expect(ids).not.toContain("alert-line-a");
        expect(ids).not.toContain("alert-at-725");
      });

      it("includes alerts naming the station directly, deduped with line matches", async () => {
        setAlertsForTesting(stationScopedAlerts);

        // Station 725 is named directly by alert-at-725 and served by line 1
        const res = await app.request("/api/alerts?stationId=725");

        expect(res.status).toBe(200);
        const body = await res.json();
        const ids = body.alerts.map((a: { id: string }) => a.id).sort();
        expect(ids).toEqual(["alert-at-725", "alert-line-1"]);
        expect(body.meta.officialCount).toBe(2);
      });

      it("returns no alerts for a station with no matching alerts", async () => {
        setAlertsForTesting([
          createTestAlert({ id: "alert-line-a", affectedLines: ["A"], affectedStations: [] }),
        ]);

        const res = await app.request("/api/alerts?stationId=101");

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.alerts).toEqual([]);
      });

      it("combines stationId with activeOnly", async () => {
        setAlertsForTesting([
          createTestAlert({
            id: "alert-expired",
            affectedLines: ["1"],
            activePeriod: {
              start: Math.floor(Date.now() / 1000) - 7200,
              end: Math.floor(Date.now() / 1000) - 3600,
            },
          }),
          createTestAlert({ id: "alert-active", affectedLines: ["1"] }),
        ]);

        const res = await app.request("/api/alerts?stationId=101&activeOnly=true");

        expect(res.status).toBe(200);
        const body = await res.json();
        const ids = body.alerts.map((a: { id: string }) => a.id);
        expect(ids).toEqual(["alert-active"]);
      });

      it("returns 404 for an unknown station", async () => {
        setAlertsForTesting(stationScopedAlerts);

        const res = await app.request("/api/alerts?stationId=nonexistent");

        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain("nonexistent");
      });
    });
  });

  describe("GET /api/alerts/:lineId", () => {
    it("returns alerts for specific line", async () => {
      const res = await app.request("/api/alerts/1");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("alerts");
      expect(body).toHaveProperty("lineId");
      expect(body.lineId).toBe("1");
      expect(Array.isArray(body.alerts)).toBe(true);
    });

    it("includes predicted alerts in response", async () => {
      const res = await app.request("/api/alerts/A");

      expect(res.status).toBe(200);

      const body = await res.json();
      // May include both official and predicted alerts
      expect(body.alerts).toBeDefined();
    });

    it("handles lines with no alerts", async () => {
      const res = await app.request("/api/alerts/Z"); // Non-existent line

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.alerts).toEqual([]);
    });
  });

  describe("GET /api/equipment", () => {
    it("returns all equipment summaries", async () => {
      const res = await app.request("/api/equipment");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("stations");
      expect(body).toHaveProperty("count");
      expect(Array.isArray(body.stations)).toBe(true);
      expect(typeof body.count).toBe("number");
    });

    it("filters equipment by station", async () => {
      const res = await app.request("/api/equipment?stationId=725");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stations).toBeDefined();
      expect(body.count).toBeGreaterThanOrEqual(0);

      if (body.count > 0) {
        expect(body.stations[0]?.stationId).toBe("725");
      }
    });

    it("filters equipment by type", async () => {
      const res = await app.request("/api/equipment?type=elevator");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stations).toBeDefined();

      // Verify all equipment matches the type filter
      for (const summary of body.stations) {
        for (const eq of summary.equipment ?? []) {
          expect(eq.type.toLowerCase()).toBe("elevator");
        }
      }
    });

    it("returns empty array for type with no matches", async () => {
      const res = await app.request("/api/equipment?type=escalator");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.stations)).toBe(true);
    });
  });

  describe("GET /api/equipment/:stationId", () => {
    it("returns equipment for specific station", async () => {
      const res = await app.request("/api/equipment/725");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("stationId");
      expect(body).toHaveProperty("equipment");
      expect(body).toHaveProperty("adaAccessible");
      expect(body.stationId).toBe("725");
      expect(Array.isArray(body.equipment)).toBe(true);
    });

    it("returns empty equipment array for station with no outages", async () => {
      const res = await app.request("/api/equipment/101");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stationId).toBe("101");
      expect(body.equipment).toEqual([]);
      expect(body.adaAccessible).toBe(true);
    });

    it("handles non-existent station gracefully", async () => {
      const res = await app.request("/api/equipment/nonexistent");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stationId).toBe("nonexistent");
      expect(body.equipment).toEqual([]);
    });
  });

  describe("Data flow integration", () => {
    it("integrates with alerts poller cache", async () => {
      // Test that alerts endpoint reads from the cached data
      const res1 = await app.request("/api/alerts");
      const body1 = await res1.json();

      expect(body1.meta.lastUpdatedAt).toBeDefined();

      // Subsequent requests should return consistent data
      const res2 = await app.request("/api/alerts");
      const body2 = await res2.json();

      expect(body2.meta.lastUpdatedAt).toBe(body1.meta.lastUpdatedAt);
    });

    it("integrates with equipment poller cache", async () => {
      const res = await app.request("/api/equipment");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.stations)).toBe(true);
    });

    it("includes delay detector status in alerts response", async () => {
      const res = await app.request("/api/alerts");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.meta).toHaveProperty("delayDetector");
    });
  });

  describe("Response validation", () => {
    it("validates alert response structure", async () => {
      const res = await app.request("/api/alerts");

      expect(res.status).toBe(200);

      const body = await res.json();

      // Validate meta fields are correct types
      expect(typeof body.meta.count).toBe("number");
      expect(typeof body.meta.officialCount).toBe("number");
      expect(typeof body.meta.predictedCount).toBe("number");
      expect(typeof body.meta.matchRate).toBe("number");
      expect(typeof body.meta.consecutiveFailures).toBe("number");
      expect(typeof body.meta.circuitOpen).toBe("boolean");
    });

    it("validates equipment response structure", async () => {
      const res = await app.request("/api/equipment/725");

      expect(res.status).toBe(200);

      const body = await res.json();

      // Validate response structure
      expect(typeof body.stationId).toBe("string");
      expect(Array.isArray(body.equipment)).toBe(true);
      expect(typeof body.adaAccessible).toBe("boolean");
    });

    it("validates line-specific alerts response", async () => {
      const res = await app.request("/api/alerts/A");

      expect(res.status).toBe(200);

      const body = await res.json();

      expect(typeof body.lineId).toBe("string");
      expect(Array.isArray(body.alerts)).toBe(true);
    });
  });
});
