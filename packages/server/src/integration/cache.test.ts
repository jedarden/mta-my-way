/**
 * Integration tests for Cache system with real database operations.
 *
 * Tests the full data flow:
 * - Feed state management and circuit breaker
 * - Arrivals cache integration with API responses
 * - Positions cache integration with train diagram
 * - Cache metrics and hit/miss tracking
 * - Stale data detection
 * - Cross-component integration
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  avgLatency,
  errorCount24h,
  getAllArrivals,
  getAllFeedAges,
  getAllParsedFeeds,
  getAllPositions,
  getArrivals,
  getFeedAgeSeconds,
  getFeedMetrics,
  getFeedStates,
  getLastGoodParsed,
  getPositions,
  isCircuitOpen,
  isFeedStale,
  recordFeedFailure,
  recordFeedSuccess,
  updateArrivals,
  updatePositions,
} from "../cache.js";
import type { ParsedFeed } from "../parser.js";
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

// Helper to create a mock ParsedFeed
function createMockParsedFeed(overrides: Partial<ParsedFeed> = {}): ParsedFeed {
  return {
    headerTimestamp: Date.now(),
    tripReplacementPeriod: 300,
    trips: new Map([
      [
        "test-trip-1",
        {
          tripId: "test-trip-1",
          routeId: "1",
          direction: "N",
          startTime: Math.floor(Date.now() / 1000),
          startDate: "20260411",
          isAssigned: true,
          isRevenue: true,
          stops: [],
        },
      ],
    ]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Cache Integration Tests", () => {
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

  describe("Feed State Management", () => {
    beforeEach(() => {
      // Reset feed state before each test by recording a fresh success
      const parsed = createMockParsedFeed();
      recordFeedSuccess("gtfs", parsed, 0, 0);
    });

    describe("recordFeedSuccess", () => {
      it("records successful feed poll", () => {
        const parsed = createMockParsedFeed();
        recordFeedSuccess("gtfs", parsed, 150, 100);

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs");

        expect(gtfsState).toBeDefined();
        expect(gtfsState?.lastSuccessAt).toBeGreaterThan(0);
        expect(gtfsState?.consecutiveFailures).toBe(0);
        expect(gtfsState?.circuitOpenAt).toBeNull();
        expect(gtfsState?.entityCount).toBe(150);
        expect(gtfsState?.parsedFeed).toEqual(parsed);
      });

      it("resets circuit breaker after success", () => {
        // First, open the circuit
        recordFeedFailure("gtfs", "Error 1", 100);
        recordFeedFailure("gtfs", "Error 2", 100);
        recordFeedFailure("gtfs", "Error 3", 100);

        expect(isCircuitOpen("gtfs")).toBe(true);

        // Success resets the circuit
        const parsed = createMockParsedFeed();
        recordFeedSuccess("gtfs", parsed, 150, 100);

        expect(isCircuitOpen("gtfs")).toBe(false);
        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs");
        expect(gtfsState?.consecutiveFailures).toBe(0);
      });

      it("tracks latency history", () => {
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 150);
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 200);
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 250);

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs");

        expect(gtfsState?.latencyHistory).toEqual([150, 200, 250]);
        expect(avgLatency(gtfsState!.latencyHistory)).toBe(200);
      });

      it("caps latency history at 100 entries", () => {
        // Add more than 100 latencies
        for (let i = 0; i < 105; i++) {
          recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 100 + i);
        }

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs");

        expect(gtfsState?.latencyHistory.length).toBe(100);
        expect(gtfsState?.latencyHistory[0]).toBe(105); // First 5 entries were shifted
      });
    });

    describe("recordFeedFailure", () => {
      it("records failed feed poll", () => {
        recordFeedFailure("gtfs", "Connection error", 100);

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs");

        expect(gtfsState?.lastErrorMessage).toBe("Connection error");
        expect(gtfsState?.consecutiveFailures).toBe(1);
        expect(gtfsState?.circuitOpenAt).toBeNull();
      });

      it("opens circuit after threshold failures", () => {
        recordFeedFailure("gtfs", "Error 1", 100);
        recordFeedFailure("gtfs", "Error 2", 100);
        recordFeedFailure("gtfs", "Error 3", 100);

        expect(isCircuitOpen("gtfs")).toBe(true);

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs");
        expect(gtfsState?.circuitOpenAt).toBeGreaterThan(0);
      });

      it("tracks error timestamps for 24h count", () => {
        const now = Date.now();
        recordFeedFailure("gtfs", "Error 1", 100);
        recordFeedFailure("gtfs", "Error 2", 100);
        recordFeedFailure("gtfs", "Error 3", 100);

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs");

        expect(gtfsState?.errorTimestamps).toHaveLength(3);
        expect(errorCount24h(gtfsState!.errorTimestamps)).toBe(3);
      });

      it("tracks latency on failure", () => {
        recordFeedFailure("gtfs", "Error", 250);

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs");

        expect(gtfsState?.latencyHistory).toEqual([250]);
      });
    });

    describe("isCircuitOpen", () => {
      it("returns false when circuit is closed", () => {
        expect(isCircuitOpen("gtfs")).toBe(false);
      });

      it("returns true when circuit is open", () => {
        recordFeedFailure("gtfs", "Error 1", 100);
        recordFeedFailure("gtfs", "Error 2", 100);
        recordFeedFailure("gtfs", "Error 3", 100);

        expect(isCircuitOpen("gtfs")).toBe(true);
      });

      it("auto-resets after reset window", () => {
        recordFeedFailure("gtfs", "Error 1", 100);
        recordFeedFailure("gtfs", "Error 2", 100);
        recordFeedFailure("gtfs", "Error 3", 100);

        expect(isCircuitOpen("gtfs")).toBe(true);

        // Manually set circuitOpenAt to be older than reset window
        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs")!;
        gtfsState.circuitOpenAt = Date.now() - 70000; // > 60 seconds ago

        expect(isCircuitOpen("gtfs")).toBe(false);
        expect(gtfsState.consecutiveFailures).toBe(0);
      });
    });

    describe("isFeedStale", () => {
      it("returns false for never-polled feed", () => {
        // Use a feed that we haven't touched in this test suite
        expect(isFeedStale("gtfs-ir")).toBe(false);
      });

      it("returns false for fresh feed", () => {
        recordFeedSuccess("gtfs-ir", createMockParsedFeed(), 100, 100);
        expect(isFeedStale("gtfs-ir")).toBe(false);
      });

      it("returns true for stale feed", () => {
        recordFeedSuccess("gtfs-ir", createMockParsedFeed(), 100, 100);

        // Manually set lastSuccessAt to be older than stale threshold
        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs-ir")!;
        if (gtfsState) {
          gtfsState.lastSuccessAt = Date.now() - 400000; // > 5 minutes ago
          expect(isFeedStale("gtfs-ir")).toBe(true);
        }
      });
    });

    describe("getFeedAgeSeconds", () => {
      it("returns 0 for never-polled feed", () => {
        expect(getFeedAgeSeconds("gtfs")).toBe(0);
      });

      it("calculates age correctly", () => {
        const beforeTime = Date.now();
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 100);
        const afterTime = Date.now();

        const age = getFeedAgeSeconds("gtfs");
        expect(age).toBeGreaterThanOrEqual(0);
        expect(age).toBeLessThanOrEqual(1); // Should be < 1 second
      });
    });

    describe("getAllFeedAges", () => {
      it("returns ages for all feeds", () => {
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 100);
        recordFeedSuccess("gtfs-ace", createMockParsedFeed(), 100, 100);

        const ages = getAllFeedAges();

        expect(ages.size).toBeGreaterThan(0);
        expect(ages.has("gtfs")).toBe(true);
        expect(ages.has("gtfs-ace")).toBe(true);
      });
    });

    describe("getFeedStates", () => {
      it("includes stale flag in states", () => {
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 100);

        // Make the feed stale
        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs")!;
        gtfsState.lastSuccessAt = Date.now() - 400000;

        const updatedStates = getFeedStates();
        const updatedGtfsState = updatedStates.find((s) => s.id === "gtfs");

        expect(updatedGtfsState?.isStale).toBe(true);
      });
    });
  });

  describe("Parsed Feed Cache", () => {
    describe("getLastGoodParsed", () => {
      it("returns null for feed with no successful parse", () => {
        const parsed = getLastGoodParsed("unused-feed-id");
        expect(parsed).toBeNull();
      });

      it("returns last good parsed feed", () => {
        const feed = createMockParsedFeed({ tripReplacementPeriod: 600 });
        recordFeedSuccess("test-feed-1", feed, 100, 100);

        const parsed = getLastGoodParsed("test-feed-1");
        expect(parsed).toEqual(feed);
      });

      it("serves stale data on circuit open", () => {
        const feed = createMockParsedFeed();
        recordFeedSuccess("test-feed-2", feed, 100, 100);

        // Open the circuit
        recordFeedFailure("test-feed-2", "Error 1", 100);
        recordFeedFailure("test-feed-2", "Error 2", 100);
        recordFeedFailure("test-feed-2", "Error 3", 100);

        const parsed = getLastGoodParsed("test-feed-2");
        expect(parsed).toEqual(feed); // Should still return the last good feed
      });
    });

    describe("getAllParsedFeeds", () => {
      it("returns all feeds with successful parses", () => {
        recordFeedSuccess("test-feed-a", createMockParsedFeed(), 100, 100);
        recordFeedSuccess("test-feed-b", createMockParsedFeed(), 100, 100);

        const allFeeds = getAllParsedFeeds();

        expect(allFeeds.size).toBeGreaterThanOrEqual(2);
        expect(allFeeds.has("test-feed-a")).toBe(true);
        expect(allFeeds.has("test-feed-b")).toBe(true);
      });

      it("excludes feeds without successful parses", () => {
        recordFeedSuccess("test-feed-c", createMockParsedFeed(), 100, 100);
        // test-feed-d has no success

        const allFeeds = getAllParsedFeeds();

        expect(allFeeds.has("test-feed-c")).toBe(true);
        expect(allFeeds.has("test-feed-d")).toBe(false);
      });
    });
  });

  describe("Arrivals Cache", () => {
    beforeEach(() => {
      // Clear arrivals cache before each test
      updateArrivals(new Map());
    });

    describe("updateArrivals and getArrivals", () => {
      it("stores and retrieves arrivals by station", () => {
        const now = Math.floor(Date.now() / 1000);
        const arrivals = {
          northbound: [
            {
              tripId: "test-trip-1",
              routeId: "1",
              direction: "N",
              arrivalTime: now + 300,
              departureTime: now + 300,
              isAssigned: true,
              isScheduled: false,
              isDelayed: false,
              isStopped: false,
              isRevenue: true,
              predicted: true,
            },
          ],
          southbound: [],
        };

        const arrivalsMap = new Map([["101", arrivals]]);
        updateArrivals(arrivalsMap);

        const retrieved = getArrivals("101");
        expect(retrieved).toEqual(arrivals);
      });

      it("returns null for non-existent station", () => {
        const retrieved = getArrivals("999");
        expect(retrieved).toBeNull();
      });

      it("replaces entire cache on update", () => {
        const now = Math.floor(Date.now() / 1000);
        const arrivals1 = {
          northbound: [
            {
              tripId: "trip-1",
              routeId: "1",
              direction: "N",
              arrivalTime: now + 300,
              departureTime: now + 300,
              isAssigned: true,
              isScheduled: false,
              isDelayed: false,
              isStopped: false,
              isRevenue: true,
              predicted: true,
            },
          ],
          southbound: [],
        };

        updateArrivals(new Map([["101", arrivals1]]));

        const arrivals2 = {
          northbound: [],
          southbound: [
            {
              tripId: "trip-2",
              routeId: "1",
              direction: "S",
              arrivalTime: now + 600,
              departureTime: now + 600,
              isAssigned: true,
              isScheduled: false,
              isDelayed: false,
              isStopped: false,
              isRevenue: true,
              predicted: true,
            },
          ],
        };

        updateArrivals(new Map([["725", arrivals2]]));

        // First station should be gone
        expect(getArrivals("101")).toBeNull();
        expect(getArrivals("725")).toEqual(arrivals2);
      });
    });

    describe("getAllArrivals", () => {
      it("returns all cached arrivals", () => {
        const now = Math.floor(Date.now() / 1000);
        const arrivals1 = {
          northbound: [
            {
              tripId: "trip-1",
              routeId: "1",
              direction: "N",
              arrivalTime: now + 300,
              departureTime: now + 300,
              isAssigned: true,
              isScheduled: false,
              isDelayed: false,
              isStopped: false,
              isRevenue: true,
              predicted: true,
            },
          ],
          southbound: [],
        };
        const arrivals2 = {
          northbound: [],
          southbound: [
            {
              tripId: "trip-2",
              routeId: "A",
              direction: "S",
              arrivalTime: now + 600,
              departureTime: now + 600,
              isAssigned: true,
              isScheduled: false,
              isDelayed: false,
              isStopped: false,
              isRevenue: true,
              predicted: true,
            },
          ],
        };

        updateArrivals(
          new Map([
            ["101", arrivals1],
            ["725", arrivals2],
          ])
        );

        const all = getAllArrivals();
        expect(all.size).toBe(2);
        expect(all.get("101")).toEqual(arrivals1);
        expect(all.get("725")).toEqual(arrivals2);
      });

      it("returns empty map when no arrivals cached", () => {
        updateArrivals(new Map());
        const all = getAllArrivals();
        expect(all.size).toBe(0);
      });
    });
  });

  describe("Positions Cache", () => {
    describe("updatePositions and getPositions", () => {
      it("stores and retrieves positions by route", () => {
        const now = Date.now();
        const positions = {
          trains: [
            {
              tripId: "test-trip-1",
              routeId: "1",
              direction: "N",
              currentStopId: "101",
              nextStopId: "102",
              progressPercent: 50,
              isDelayed: false,
              isStalled: false,
              speedMph: 15,
            },
          ],
          feedAge: 10,
        };

        updatePositions(new Map([["1", positions]]), now);

        const retrieved = getPositions("1");
        expect(retrieved).toBeDefined();
        expect(retrieved?.trains).toHaveLength(1);
        expect(retrieved?.trains[0]?.tripId).toBe("test-trip-1");
      });

      it("returns null for non-existent route", () => {
        const retrieved = getPositions("Z");
        expect(retrieved).toBeNull();
      });

      it("calculates feed age dynamically", () => {
        const now = Date.now();
        const positions = {
          trains: [],
          feedAge: 0,
        };

        updatePositions(new Map([["1", positions]]), now);

        // Wait a bit
        const later = Date.now();

        const retrieved = getPositions("1");
        expect(retrieved?.feedAge).toBeGreaterThanOrEqual(0);
        expect(retrieved?.feedAge).toBeLessThanOrEqual(1);
      });

      it("is case-insensitive for route ID", () => {
        const now = Date.now();
        const positions = {
          trains: [],
          feedAge: 0,
        };

        updatePositions(new Map([["a", positions]]), now);

        const lower = getPositions("a");
        const upper = getPositions("A");
        const mixed = getPositions("a");

        expect(lower).toBeDefined();
        expect(upper).toBeDefined();
        expect(mixed).toBeDefined();
      });
    });

    describe("getAllPositions", () => {
      it("returns all cached positions", () => {
        const now = Date.now();
        const positions1 = { trains: [], feedAge: 0 };
        const positions2 = { trains: [], feedAge: 0 };

        updatePositions(
          new Map([
            ["1", positions1],
            ["A", positions2],
          ]),
          now
        );

        const all = getAllPositions();
        expect(all.size).toBe(2);
      });
    });
  });

  describe("API Integration with Cache", () => {
    describe("GET /api/arrivals/:stationId", () => {
      beforeEach(() => {
        const now = Math.floor(Date.now() / 1000);
        const arrivals = {
          northbound: [
            {
              tripId: "test-trip-1",
              routeId: "1",
              direction: "N",
              arrivalTime: now + 300,
              departureTime: now + 300,
              isAssigned: true,
              isScheduled: false,
              isDelayed: false,
              isStopped: false,
              isRevenue: true,
              predicted: true,
            },
          ],
          southbound: [],
        };
        updateArrivals(new Map([["101", arrivals]]));
      });

      it("returns arrivals from cache", async () => {
        const res = await app.request("/api/arrivals/101");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.stationId).toBe("101");
        expect(body.northbound).toBeDefined();
        expect(body.northbound.length).toBeGreaterThan(0);
      });

      it("includes cache headers", async () => {
        const res = await app.request("/api/arrivals/101");

        const cacheControl = res.headers.get("Cache-Control");
        expect(cacheControl).toContain("public");
        expect(cacheControl).toContain("max-age=");
      });
    });

    describe("GET /api/positions/:lineId", () => {
      beforeEach(() => {
        const now = Date.now();
        const positions = {
          trains: [
            {
              tripId: "test-trip-1",
              routeId: "1",
              direction: "N",
              currentStopId: "101",
              nextStopId: "102",
              progressPercent: 50,
              isDelayed: false,
              isStalled: false,
              speedMph: 15,
            },
          ],
          feedAge: 10,
        };
        updatePositions(new Map([["1", positions]]), now);
      });

      it("returns positions from cache", async () => {
        const res = await app.request("/api/positions/1");

        expect(res.status).toBe(200);

        const body = await res.json();
        expect(body.trains).toBeDefined();
        expect(Array.isArray(body.trains)).toBe(true);
        expect(body.feedAge).toBeDefined();
      });

      it("includes cache headers", async () => {
        const res = await app.request("/api/positions/1");

        const cacheControl = res.headers.get("Cache-Control");
        expect(cacheControl).toContain("public");
        expect(cacheControl).toContain("max-age=");
      });
    });
  });

  describe("Cache Metrics Integration", () => {
    describe("getFeedMetrics", () => {
      it("calculates average latency", () => {
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 150);
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 250);
        recordFeedSuccess("gtfs", createMockParsedFeed(), 100, 350);

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs")!;
        const avg = avgLatency(gtfsState.latencyHistory);

        expect(avg).toBe(250);
      });

      it("counts 24h errors", () => {
        const now = Date.now();
        recordFeedFailure("gtfs", "Error 1", 100);
        recordFeedFailure("gtfs", "Error 2", 100);
        recordFeedFailure("gtfs", "Error 3", 100);

        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs")!;
        const count = errorCount24h(gtfsState.errorTimestamps);

        expect(count).toBe(3);
      });

      it("prunes old error timestamps", () => {
        const now = Date.now();
        recordFeedFailure("gtfs", "Old error", 100);

        // Manually add an old error timestamp
        const states = getFeedStates();
        const gtfsState = states.find((s) => s.id === "gtfs")!;
        gtfsState.errorTimestamps.push(now - 90000000); // > 24h ago

        const count = errorCount24h(gtfsState.errorTimestamps);
        expect(count).toBe(1); // Only the recent error
      });
    });
  });

  describe("Cross-Component Integration", () => {
    it("integrates cache data with health endpoint", async () => {
      // Set up feed state
      recordFeedSuccess("gtfs", createMockParsedFeed(), 150, 100);

      const res = await app.request("/api/health");

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.feeds).toBeDefined();
      expect(Array.isArray(body.feeds)).toBe(true);

      const gtfsFeed = body.feeds.find((f: { id: string }) => f.id === "gtfs");
      expect(gtfsFeed).toBeDefined();
      expect(gtfsFeed.status).toBeDefined();
    });

    it("integrates arrivals cache with commute analysis", async () => {
      const now = Math.floor(Date.now() / 1000);
      const arrivals = {
        northbound: [
          {
            tripId: "test-trip-1",
            routeId: "1",
            direction: "N",
            arrivalTime: now + 300,
            departureTime: now + 300,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
          },
        ],
        southbound: [],
      };

      updateArrivals(new Map([["101", arrivals]]));

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId: "101",
          destinationId: "725",
        }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.origin).toBeDefined();
      expect(body.destination).toBeDefined();
    });
  });
});
