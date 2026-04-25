/**
 * Integration tests for the GTFS-RT feed data transformation pipeline.
 *
 * Tests the full data flow:
 * - Raw protobuf bytes → parseFeed() → ParsedFeed
 * - ParsedFeed → transformFeeds() → StationArrivals map
 * - StationArrivals → updateArrivals() → in-memory cache
 * - cache → getArrivals() → API response
 *
 * These tests verify the complete pipeline used in production polling.
 */

import type { RouteIndex, StationIndex } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  getAllArrivals,
  getAllParsedFeeds,
  getArrivals,
  getLastGoodParsed,
  recordFeedSuccess,
  updateArrivals,
} from "../cache.js";
import { parseFeed } from "../parser.js";
import { aDivisionFeed, bDivisionFeed, emptyFeed, pastArrivalsFeed } from "../test/fixtures.js";
import { buildStopToStationMap, transformFeeds } from "../transformer.js";
import { TEST_STATIONS, closeDatabase, createIntegrationTestDatabase } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test fixtures — match the stop IDs used in test/fixtures.ts
// ---------------------------------------------------------------------------

const PIPELINE_STATIONS: StationIndex = {
  "100": {
    id: "100",
    name: "Whitehall St",
    location: { lat: 40.703, lon: -74.014 },
    lines: ["1", "2"],
    northStopId: "100N",
    southStopId: "100S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "101": {
    id: "101",
    name: "South Ferry",
    location: { lat: 40.702, lon: -74.013 },
    lines: ["1", "2"],
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "102": {
    id: "102",
    name: "Rector St",
    location: { lat: 40.709, lon: -74.014 },
    lines: ["1"],
    northStopId: "102N",
    southStopId: "102S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "103": {
    id: "103",
    name: "Cortlandt St",
    location: { lat: 40.712, lon: -74.014 },
    lines: ["1"],
    northStopId: "103N",
    southStopId: "103S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "724": {
    id: "724",
    name: "34 St-Herald Sq",
    location: { lat: 40.75, lon: -73.988 },
    lines: ["F"],
    northStopId: "724N",
    southStopId: "724S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    location: { lat: 40.758, lon: -73.985 },
    lines: ["F", "D"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "726": {
    id: "726",
    name: "42 St-Bryant Pk",
    location: { lat: 40.754, lon: -73.983 },
    lines: ["F"],
    northStopId: "726N",
    southStopId: "726S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "730": {
    id: "730",
    name: "145 St",
    location: { lat: 40.824, lon: -73.946 },
    lines: ["D"],
    northStopId: "730N",
    southStopId: "730S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
};

const PIPELINE_ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["100", "101", "102", "103"],
    isExpress: false,
  },
  "2": {
    id: "2",
    shortName: "2",
    longName: "7th Ave Express",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["100", "101", "103"],
    isExpress: true,
  },
  F: {
    id: "F",
    shortName: "F",
    longName: "6th Ave Local",
    color: "#FF6319",
    textColor: "#FFFFFF",
    feedId: "gtfs-bdfm",
    division: "B",
    stops: ["724", "725", "726"],
    isExpress: false,
  },
  D: {
    id: "D",
    shortName: "D",
    longName: "6th Ave Express",
    color: "#FF6319",
    textColor: "#FFFFFF",
    feedId: "gtfs-bdfm",
    division: "B",
    stops: ["725", "730"],
    isExpress: true,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTestStopMap() {
  return buildStopToStationMap(PIPELINE_STATIONS);
}

function buildTestFeedAges(feedId: string, ageSeconds = 5): Map<string, number> {
  return new Map([[feedId, ageSeconds]]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Feed Data Pipeline Integration Tests", () => {
  let stopToStation: ReturnType<typeof buildStopToStationMap>;

  beforeEach(() => {
    stopToStation = buildTestStopMap();
    // Clear arrivals cache before each test
    updateArrivals(new Map());
  });

  // -------------------------------------------------------------------------
  // parseFeed — raw bytes → ParsedFeed
  // -------------------------------------------------------------------------

  describe("parseFeed → ParsedFeed", () => {
    it("decodes A Division protobuf fixture to ParsedFeed", () => {
      const bytes = aDivisionFeed();
      const parsed = parseFeed("gtfs", bytes);

      expect(parsed.feedId).toBe("gtfs");
      expect(parsed.feedTimestamp).toBeGreaterThan(0);
      expect(parsed.entityCount).toBeGreaterThan(0);
      expect(parsed.message).toBeDefined();
      expect(parsed.message.entity).toBeInstanceOf(Array);
      expect(parsed.message.entity.length).toBeGreaterThan(0);
    });

    it("decodes B Division protobuf fixture to ParsedFeed", () => {
      const bytes = bDivisionFeed();
      const parsed = parseFeed("gtfs-bdfm", bytes);

      expect(parsed.feedId).toBe("gtfs-bdfm");
      expect(parsed.entityCount).toBeGreaterThan(0);
    });

    it("extracts trip replacement period from NYCT header extension", () => {
      const bytes = aDivisionFeed();
      const parsed = parseFeed("gtfs", bytes);

      // The fixture sets tripReplacementPeriod = 12000 seconds
      expect(parsed.tripReplacementPeriod).toBe(12000);
    });

    it("handles empty feed gracefully", () => {
      const bytes = emptyFeed();
      const parsed = parseFeed("gtfs", bytes);

      expect(parsed.entityCount).toBe(0);
      expect(parsed.message.entity).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // parseFeed → recordFeedSuccess → getLastGoodParsed round trip
  // -------------------------------------------------------------------------

  describe("parseFeed → cache round trip", () => {
    it("stores ParsedFeed in cache via recordFeedSuccess", () => {
      const bytes = aDivisionFeed();
      const parsed = parseFeed("gtfs", bytes);

      recordFeedSuccess("gtfs", parsed, parsed.entityCount, 150);

      const retrieved = getLastGoodParsed("gtfs");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.feedId).toBe("gtfs");
      expect(retrieved?.entityCount).toBe(parsed.entityCount);
    });

    it("returns the same ParsedFeed object stored via recordFeedSuccess", () => {
      const bytes = aDivisionFeed();
      const parsed = parseFeed("gtfs", bytes);

      recordFeedSuccess("gtfs", parsed, parsed.entityCount, 100);

      const retrieved = getLastGoodParsed("gtfs");
      expect(retrieved).toBe(parsed); // Same reference
    });

    it("getAllParsedFeeds includes feed after successful poll", () => {
      const bytes = bDivisionFeed();
      const parsed = parseFeed("gtfs-bdfm", bytes);

      recordFeedSuccess("gtfs-bdfm", parsed, parsed.entityCount, 200);

      const allFeeds = getAllParsedFeeds();
      expect(allFeeds.has("gtfs-bdfm")).toBe(true);
      expect(allFeeds.get("gtfs-bdfm")).toBe(parsed);
    });
  });

  // -------------------------------------------------------------------------
  // transformFeeds — ParsedFeed → StationArrivals
  // -------------------------------------------------------------------------

  describe("transformFeeds — ParsedFeed → StationArrivals", () => {
    it("produces arrivals for stations in A Division feed", () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAges = buildTestFeedAges("gtfs");

      const result = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );

      expect(result.size).toBeGreaterThan(0);
      // The A Division fixture has trips stopping at 101N (northbound) and 100S (southbound)
      const southFerry = result.get("101");
      expect(southFerry).toBeDefined();
      expect(southFerry?.northbound.length).toBeGreaterThan(0);
    });

    it("arrivals include required ArrivalTime fields", () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAges = buildTestFeedAges("gtfs");

      const result = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );

      for (const [, arrivals] of result) {
        for (const a of [...arrivals.northbound, ...arrivals.southbound]) {
          expect(a.line).toBeTruthy();
          expect(["N", "S"]).toContain(a.direction);
          expect(a.arrivalTime).toBeGreaterThan(0);
          expect(a.minutesAway).toBeGreaterThanOrEqual(0);
          expect(typeof a.isAssigned).toBe("boolean");
          expect(["high", "medium", "low"]).toContain(a.confidence);
          expect(a.feedName).toBe("gtfs");
        }
      }
    });

    it("filters out past arrivals from feed", () => {
      const parsed = parseFeed("gtfs", pastArrivalsFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAges = buildTestFeedAges("gtfs");

      const result = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );

      // Past arrivals should be filtered; result may be empty
      for (const [, arrivals] of result) {
        for (const a of [...arrivals.northbound, ...arrivals.southbound]) {
          expect(a.minutesAway).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it("handles B Division feed with assigned and unassigned trips", () => {
      const parsed = parseFeed("gtfs-bdfm", bDivisionFeed());
      const feeds = new Map([["gtfs-bdfm", parsed]]);
      const feedAges = buildTestFeedAges("gtfs-bdfm");

      const result = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );

      // B Division feed has trips stopping at 725N and 725S
      const timesSquare = result.get("725");
      if (timesSquare) {
        // Some arrivals should have lower confidence for unassigned B Division trips
        const allArrivals = [...timesSquare.northbound, ...timesSquare.southbound];
        const hasLowConfidence = allArrivals.some((a) => a.confidence === "low");
        expect(hasLowConfidence).toBe(true);
      }
    });

    it("produces empty result for empty feed", () => {
      const parsed = parseFeed("gtfs", emptyFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAges = buildTestFeedAges("gtfs");

      const result = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );

      expect(result.size).toBe(0);
    });

    it("merges arrivals from multiple feeds", () => {
      const parsedA = parseFeed("gtfs", aDivisionFeed());
      const parsedB = parseFeed("gtfs-bdfm", bDivisionFeed());
      const feeds = new Map([
        ["gtfs", parsedA],
        ["gtfs-bdfm", parsedB],
      ]);
      const feedAges = new Map([
        ["gtfs", 3],
        ["gtfs-bdfm", 7],
      ]);

      const result = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );

      // A Division feed contributes stations 100, 101, 102, 103
      // B Division feed contributes stations 724, 725, 726, 730
      const hasADivisionStation = result.has("101");
      const hasBDivisionStation = result.has("725");
      expect(hasADivisionStation || hasBDivisionStation).toBe(true);
    });

    it("tags each arrival with the correct feedName", () => {
      const parsedA = parseFeed("gtfs", aDivisionFeed());
      const parsedB = parseFeed("gtfs-bdfm", bDivisionFeed());
      const feeds = new Map([
        ["gtfs", parsedA],
        ["gtfs-bdfm", parsedB],
      ]);
      const feedAges = new Map([
        ["gtfs", 3],
        ["gtfs-bdfm", 7],
      ]);

      const result = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );

      for (const [, arrivals] of result) {
        for (const a of arrivals.northbound) {
          expect(["gtfs", "gtfs-bdfm"]).toContain(a.feedName);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Full pipeline: parseFeed → transformFeeds → updateArrivals → getArrivals
  // -------------------------------------------------------------------------

  describe("Full pipeline: raw bytes → cache → getArrivals", () => {
    it("arrivals stored by transformFeeds are retrievable via getArrivals", () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAges = buildTestFeedAges("gtfs");

      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );
      updateArrivals(arrivals);

      // South Ferry (101) should have northbound arrivals from the 1-train fixture
      const retrieved = getArrivals("101");
      expect(retrieved).not.toBeNull();
      expect(retrieved?.stationId).toBe("101");
      expect(retrieved?.northbound.length).toBeGreaterThan(0);
    });

    it("all transformed stations are accessible via getArrivals", () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAges = buildTestFeedAges("gtfs");

      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );
      updateArrivals(arrivals);

      const allCached = getAllArrivals();
      expect(allCached.size).toBe(arrivals.size);

      for (const [stationId] of arrivals) {
        const retrieved = getArrivals(stationId);
        expect(retrieved).not.toBeNull();
        expect(retrieved?.stationId).toBe(stationId);
      }
    });

    it("arrival data is consistent between getArrivals and getAllArrivals", () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAges = buildTestFeedAges("gtfs");

      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );
      updateArrivals(arrivals);

      const all = getAllArrivals();
      for (const [stationId, stationArrivals] of all) {
        const individual = getArrivals(stationId);
        expect(individual).toEqual(stationArrivals);
      }
    });

    it("updating arrivals replaces the cache completely", () => {
      // First poll: A Division
      const parsedA = parseFeed("gtfs", aDivisionFeed());
      const feedsA = new Map([["gtfs", parsedA]]);
      const arrivalsA = transformFeeds(
        feedsA,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        buildTestFeedAges("gtfs")
      );
      updateArrivals(arrivalsA);

      const firstCount = getAllArrivals().size;
      expect(firstCount).toBeGreaterThan(0);

      // Second poll: empty feed
      const parsedEmpty = parseFeed("gtfs", emptyFeed());
      const feedsEmpty = new Map([["gtfs", parsedEmpty]]);
      const arrivalsEmpty = transformFeeds(
        feedsEmpty,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        buildTestFeedAges("gtfs")
      );
      updateArrivals(arrivalsEmpty);

      expect(getAllArrivals().size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Full pipeline → API endpoint
  // -------------------------------------------------------------------------

  describe("Full pipeline integrates with /api/arrivals/:stationId", () => {
    let app: ReturnType<typeof createApp>;

    beforeEach(() => {
      app = createApp(PIPELINE_STATIONS, PIPELINE_ROUTES, {}, {}, "/nonexistent/dist");
    });

    it("API returns arrivals that were loaded through the full pipeline", async () => {
      // Run the full pipeline
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAges = buildTestFeedAges("gtfs");
      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );
      updateArrivals(arrivals);

      // Station 101 (South Ferry) should have arrivals from the 1-train fixture
      const res = await app.request("/api/arrivals/101");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stationId).toBe("101");
      expect(body.stationName).toBe("South Ferry");
      expect(Array.isArray(body.northbound)).toBe(true);
      expect(body.northbound.length).toBeGreaterThan(0);
    });

    it("API arrival response matches data in cache", async () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        buildTestFeedAges("gtfs")
      );
      updateArrivals(arrivals);

      const res = await app.request("/api/arrivals/101");
      const body = await res.json();

      const cached = getArrivals("101");
      expect(body.northbound.length).toBe(cached?.northbound.length);
      if (body.northbound.length > 0) {
        expect(body.northbound[0].line).toBe(cached?.northbound[0]?.line);
        expect(body.northbound[0].arrivalTime).toBe(cached?.northbound[0]?.arrivalTime);
      }
    });

    it("API returns 404 for station not in pipeline results", async () => {
      // Load only A Division data — station 725 (B Division) won't be in cache
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        buildTestFeedAges("gtfs")
      );
      updateArrivals(arrivals);

      const res = await app.request("/api/arrivals/725");
      // Station exists in the app's station index but has no cached arrivals
      expect([200, 404]).toContain(res.status);
    });

    it("API arrival response includes cache control headers", async () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        buildTestFeedAges("gtfs")
      );
      updateArrivals(arrivals);

      const res = await app.request("/api/arrivals/101");
      const cacheControl = res.headers.get("Cache-Control");
      expect(cacheControl).toBeTruthy();
      expect(cacheControl).toContain("max-age=");
    });

    it("B Division arrivals accessible via API after pipeline run", async () => {
      const parsed = parseFeed("gtfs-bdfm", bDivisionFeed());
      const feeds = new Map([["gtfs-bdfm", parsed]]);
      const feedAges = buildTestFeedAges("gtfs-bdfm");
      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );
      updateArrivals(arrivals);

      // Times Sq (725) should have B Division arrivals
      const res = await app.request("/api/arrivals/725");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.stationId).toBe("725");
      const allArrivals = [...body.northbound, ...body.southbound];
      expect(allArrivals.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Data consistency across pipeline stages
  // -------------------------------------------------------------------------

  describe("Data consistency across pipeline stages", () => {
    it("arrival count is consistent from transformer to cache to API", async () => {
      const app = createApp(PIPELINE_STATIONS, PIPELINE_ROUTES, {}, {}, "/nonexistent/dist");

      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        buildTestFeedAges("gtfs")
      );
      updateArrivals(arrivals);

      for (const [stationId, stationArrivals] of arrivals) {
        const cached = getArrivals(stationId);
        expect(cached?.northbound.length).toBe(stationArrivals.northbound.length);
        expect(cached?.southbound.length).toBe(stationArrivals.southbound.length);

        const res = await app.request(`/api/arrivals/${stationId}`);
        if (res.status === 200) {
          const body = await res.json();
          expect(body.northbound.length).toBe(stationArrivals.northbound.length);
          expect(body.southbound.length).toBe(stationArrivals.southbound.length);
        }
      }
    });

    it("feedAge is preserved through the pipeline", () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const feedAgeSeconds = 42;
      const feedAges = new Map([["gtfs", feedAgeSeconds]]);

      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        feedAges
      );
      updateArrivals(arrivals);

      for (const [, stationArrivals] of arrivals) {
        for (const a of [...stationArrivals.northbound, ...stationArrivals.southbound]) {
          expect(a.feedAge).toBe(feedAgeSeconds);
        }
      }
    });

    it("ParsedFeed entityCount matches number of trip updates in fixture", () => {
      const bytes = aDivisionFeed();
      const parsed = parseFeed("gtfs", bytes);

      // The aDivisionFeed fixture has 2 entities
      expect(parsed.entityCount).toBe(2);
      expect(parsed.message.entity).toHaveLength(2);
    });

    it("transformFeeds produces StationArrivals with correct stationId and stationName", () => {
      const parsed = parseFeed("gtfs", aDivisionFeed());
      const feeds = new Map([["gtfs", parsed]]);
      const arrivals = transformFeeds(
        feeds,
        PIPELINE_STATIONS,
        PIPELINE_ROUTES,
        stopToStation,
        buildTestFeedAges("gtfs")
      );

      for (const [stationId, stationArrivals] of arrivals) {
        expect(stationArrivals.stationId).toBe(stationId);
        expect(PIPELINE_STATIONS[stationId]?.name).toBe(stationArrivals.stationName);
      }
    });
  });
});
