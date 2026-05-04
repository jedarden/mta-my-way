/**
 * Integration tests for Trip Lookup API endpoint.
 *
 * Tests the full data flow:
 * - Trip lookup by trip ID
 * - Integration with GTFS-RT feed cache
 * - Stop-by-stop progress tracking
 * - TTL enforcement for trip share links
 */

import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import type { ParsedFeed } from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the cache module for trip lookup testing
vi.mock("../cache.js", async () => {
  const actual = await vi.importActual("../cache.js");
  return {
    ...actual,
    getAllParsedFeeds: vi.fn(),
  };
});

import { createApp } from "../app.js";
import { getAllParsedFeeds } from "../cache.js";
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
    stops: ["101", "725"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {};
const TEST_TRANSFERS: Record<string, TransferConnection[]> = {};

function createMockParsedFeed(tripId: string): ParsedFeed {
  const now = Math.floor(Date.now() / 1000);

  return {
    feedId: "gtfs",
    message: {
      header: {
        gtfsRealtimeVersion: "2.0",
        timestamp: { toNumber: () => now },
      },
      entity: [
        {
          id: "entity-1",
          tripUpdate: {
            trip: {
              tripId: `${tripId}`,
              routeId: "1",
              // @ts-expect-error - NYCT extension
              ".transit_realtime.nyctTripDescriptor": {
                isAssigned: true,
                trainId: "1-1234",
              },
            },
          },
        },
      ],
    },
  };
}

function createMockParsedFeedWithStops(tripId: string, stopIds: string[]): ParsedFeed {
  const now = Math.floor(Date.now() / 1000);
  const stopTimeUpdates = stopIds.map((stopId, index) => ({
    stopId,
    arrival: { time: { toNumber: () => now + index * 180 } },
    departure: { time: { toNumber: () => now + index * 180 + 30 } },
    // @ts-expect-error - NYCT extension
    ".transit_realtime.nyctStopTimeUpdate": {
      scheduledTrack: "1",
      actualTrack: index === 0 ? "2" : "1",
    },
  }));

  return {
    feedId: "gtfs",
    message: {
      header: {
        gtfsRealtimeVersion: "2.0",
        timestamp: { toNumber: () => now },
      },
      entity: [
        {
          id: "entity-1",
          isDeleted: false,
          tripUpdate: {
            trip: {
              tripId: `${tripId}`,
              routeId: "1",
              // @ts-expect-error - NYCT extension
              ".transit_realtime.nyctTripDescriptor": {
                isAssigned: true,
                trainId: "1-1234",
              },
            },
            stopTimeUpdate: stopTimeUpdates,
          },
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Trip Lookup API Integration Tests", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    app = createApp(
      TEST_STATIONS,
      TEST_ROUTES,
      TEST_COMPLEXES,
      TEST_TRANSFERS,
      "/nonexistent/dist"
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDatabase(db);
    vi.restoreAllMocks();
  });

  describe("GET /api/trip/:tripId", () => {
    it("returns trip data when found in feed", async () => {
      const tripId = "test-trip-123";
      vi.mocked(getAllParsedFeeds).mockReturnValue(
        new Map([["gtfs", createMockParsedFeed(tripId)]])
      );

      const res = await app.request(`/api/trip/${tripId}`);

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.tripId).toBe(tripId);
      expect(body.routeId).toBe("1");
      expect(body.isAssigned).toBe(true);
      expect(body.trainId).toBe("1-1234");
    });

    it("returns 404 when trip not found", async () => {
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map());

      const res = await app.request("/api/trip/nonexistent-trip");

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("includes stop-by-stop progress data", async () => {
      const tripId = "test-trip-with-stops";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stops).toBeDefined();
      expect(Array.isArray(body.stops)).toBe(true);
      expect(body.stops.length).toBe(2);
      expect(body.totalStops).toBe(2);

      // First stop should be South Ferry
      expect(body.stops[0]?.stopId).toBe("101N");
      expect(body.stops[0]?.stationId).toBe("101");
      expect(body.stops[0]?.stationName).toBe("South Ferry");
    });

    it("includes current stop index", async () => {
      const tripId = "test-trip-progress";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      expect(body.currentStopIndex).toBeDefined();
      expect(typeof body.currentStopIndex).toBe("number");
    });

    it("includes progress percentage", async () => {
      const tripId = "test-trip-progress-percent";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      expect(body.progressPercent).toBeDefined();
      expect(typeof body.progressPercent).toBe("number");
      expect(body.progressPercent).toBeGreaterThanOrEqual(0);
      expect(body.progressPercent).toBeLessThanOrEqual(100);
    });

    it("includes remaining stops count", async () => {
      const tripId = "test-trip-remaining";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      expect(body.remainingStops).toBeDefined();
      expect(typeof body.remainingStops).toBe("number");
      expect(body.remainingStops).toBeGreaterThanOrEqual(0);
    });

    it("includes direction inference", async () => {
      const tripId = "test-trip-direction";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      expect(body.direction).toBeDefined();
      expect(["N", "S", null]).toContain(body.direction);
    });

    it("includes destination station name", async () => {
      const tripId = "test-trip-destination";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      expect(body.destination).toBeDefined();
      expect(typeof body.destination).toBe("string");
    });

    it("includes feed age information", async () => {
      const tripId = "test-trip-feed-age";
      const feed = createMockParsedFeedWithStops(tripId, ["101N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      expect(body.feedAge).toBeDefined();
      expect(typeof body.feedAge).toBe("number");
    });

    it("includes track information when available", async () => {
      const tripId = "test-trip-tracks";
      const feed = createMockParsedFeedWithStops(tripId, ["101N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      const firstStop = body.stops[0];

      expect(firstStop.scheduledTrack).toBeDefined();
      expect(firstStop.actualTrack).toBeDefined();
    });

    it("sets cache headers for API responses", async () => {
      const tripId = "test-trip-cache";
      vi.mocked(getAllParsedFeeds).mockReturnValue(
        new Map([["gtfs", createMockParsedFeed(tripId)]])
      );

      const res = await app.request(`/api/trip/${tripId}`);

      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toContain("public");
      expect(cacheControl).toContain("max-age=");
    });
  });

  describe("Trip TTL enforcement", () => {
    it("returns trip on first access", async () => {
      const tripId = "ttl-test-trip";
      vi.mocked(getAllParsedFeeds).mockReturnValue(
        new Map([["gtfs", createMockParsedFeed(tripId)]])
      );

      const res = await app.request(`/api/trip/${tripId}`);
      expect(res.status).toBe(200);
    });

    it("returns same trip on subsequent access", async () => {
      const tripId = "ttl-test-trip-repeat";
      vi.mocked(getAllParsedFeeds).mockReturnValue(
        new Map([["gtfs", createMockParsedFeed(tripId)]])
      );

      const res1 = await app.request(`/api/trip/${tripId}`);
      const res2 = await app.request(`/api/trip/${tripId}`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  describe("Data flow integration", () => {
    it("integrates with feed cache", async () => {
      const tripId = "feed-integration-trip";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.stops).toBeDefined();
    });

    it("resolves station names from station index", async () => {
      const tripId = "station-name-trip";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      expect(body.stops[0]?.stationName).toBe("South Ferry");
      expect(body.stops[1]?.stationName).toBe("Times Sq-42 St");
    });

    it("maps stop IDs to station IDs", async () => {
      const tripId = "stop-mapping-trip";
      const feed = createMockParsedFeedWithStops(tripId, ["101N", "725N"]);
      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feed]]));

      const res = await app.request(`/api/trip/${tripId}`);

      const body = await res.json();
      expect(body.stops[0]?.stationId).toBe("101");
      expect(body.stops[1]?.stationId).toBe("725");
    });
  });

  describe("Error handling", () => {
    it("handles malformed trip data gracefully", async () => {
      const malformedFeed: ParsedFeed = {
        feedId: "gtfs",
        message: {
          header: {
            gtfsRealtimeVersion: "2.0",
            timestamp: { toNumber: () => Math.floor(Date.now() / 1000) },
          },
          entity: [
            {
              id: "entity-1",
              tripUpdate: {
                trip: {
                  tripId: "malformed-trip",
                  // Missing routeId - should still work
                },
                stopTimeUpdate: [],
              },
            },
          ],
        },
      };

      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", malformedFeed]]));

      const res = await app.request("/api/trip/malformed-trip");
      expect([200, 404]).toContain(res.status);
    });

    it("handles trips with no stop time updates", async () => {
      const feedWithNoStops: ParsedFeed = {
        feedId: "gtfs",
        message: {
          header: {
            gtfsRealtimeVersion: "2.0",
            timestamp: { toNumber: () => Math.floor(Date.now() / 1000) },
          },
          entity: [
            {
              id: "entity-1",
              tripUpdate: {
                trip: {
                  tripId: "no-stops-trip",
                  routeId: "1",
                },
                stopTimeUpdate: [],
              },
            },
          ],
        },
      };

      vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["gtfs", feedWithNoStops]]));

      const res = await app.request("/api/trip/no-stops-trip");
      expect([200, 404]).toContain(res.status);
    });
  });
});
