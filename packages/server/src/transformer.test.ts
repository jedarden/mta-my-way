/**
 * Tests for transformer.ts
 *
 * Tests transformFeeds() and buildStopToStationMap() against synthetic fixtures:
 * - Correct StationArrivals shape
 * - Direction splitting (N/S)
 * - Past arrival filtering
 * - Reroute detection
 * - Confidence calculation per arrival
 * - Express detection via stop skipping
 * - Empty feeds produce no arrivals
 * - Deleted entities are skipped
 */

import type { RouteIndex, StationIndex } from "@mta-my-way/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedFeed } from "./parser.js";
import { parseFeed } from "./parser.js";
import {
  aDivisionFeed,
  bDivisionFeed,
  deletedEntitiesFeed,
  emptyFeed,
  pastArrivalsFeed,
  reroutedTrackFeed,
  unassignedTripsFeed,
} from "./test/fixtures.js";
import { buildStopToStationMap, transformFeeds } from "./transformer.js";

// ---------------------------------------------------------------------------
// Minimal test data
// ---------------------------------------------------------------------------

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
  "102": {
    id: "102",
    name: "Rector St",
    lat: 40.709,
    lon: -74.014,
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
    lat: 40.712,
    lon: -74.014,
    lines: ["1"],
    northStopId: "103N",
    southStopId: "103S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "100": {
    id: "100",
    name: "Whitehall St",
    lat: 40.703,
    lon: -74.014,
    lines: ["1"],
    northStopId: "100N",
    southStopId: "100S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    lat: 40.758,
    lon: -73.985,
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
    lat: 40.754,
    lon: -73.983,
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
    lat: 40.824,
    lon: -73.946,
    lines: ["D"],
    northStopId: "730N",
    southStopId: "730S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "724": {
    id: "724",
    name: "34 St-Herald Sq",
    lat: 40.75,
    lon: -73.988,
    lines: ["F"],
    northStopId: "724N",
    southStopId: "724S",
    transfers: [],
    ada: true,
    borough: "manhattan",
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
    stops: ["100", "101", "102", "103"],
  },
  "2": {
    id: "2",
    shortName: "2",
    longName: "7th Ave Express",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["100", "102", "103"],
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
  },
  D: {
    id: "D",
    shortName: "D",
    longName: "6th Ave Express",
    color: "#FF6319",
    textColor: "#FFFFFF",
    feedId: "gtfs-bdfm",
    division: "B",
    stops: ["725", "726", "730"],
  },
  A: {
    id: "A",
    shortName: "A",
    longName: "8th Ave Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["101", "102"],
  },
  C: {
    id: "C",
    shortName: "C",
    longName: "8th Ave Local",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["101", "102"],
  },
};

let stopToStation: ReturnType<typeof buildStopToStationMap>;

beforeEach(() => {
  stopToStation = buildStopToStationMap(STATIONS);
});

// ---------------------------------------------------------------------------
// buildStopToStationMap
// ---------------------------------------------------------------------------

describe("buildStopToStationMap", () => {
  it("maps each station's north/south stop IDs correctly", () => {
    const info = stopToStation.get("101N");
    expect(info).toEqual({ stationId: "101", direction: "N" });
  });

  it("maps south stop IDs", () => {
    const info = stopToStation.get("101S");
    expect(info).toEqual({ stationId: "101", direction: "S" });
  });

  it("returns undefined for unknown stop IDs", () => {
    expect(stopToStation.get("999N")).toBeUndefined();
  });

  it("has entries for all stations", () => {
    expect(stopToStation.size).toBe(Object.keys(STATIONS).length * 2);
  });
});

// ---------------------------------------------------------------------------
// transformFeeds: basic shape
// ---------------------------------------------------------------------------

describe("transformFeeds", () => {
  it("returns a Map of StationArrivals", () => {
    const parsed = parseFeed("gtfs", aDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);
    expect(result).toBeInstanceOf(Map);
  });

  it("each StationArrivals has required fields", () => {
    const parsed = parseFeed("gtfs", aDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    for (const [, arrivals] of result) {
      expect(arrivals.stationId).toBeDefined();
      expect(arrivals.stationName).toBeDefined();
      expect(arrivals.updatedAt).toBeGreaterThan(0);
      expect(arrivals.northbound).toBeInstanceOf(Array);
      expect(arrivals.southbound).toBeInstanceOf(Array);
      expect(arrivals.alerts).toBeInstanceOf(Array);
    }
  });
});

// ---------------------------------------------------------------------------
// transformFeeds: direction splitting
// ---------------------------------------------------------------------------

describe("transformFeeds - direction splitting", () => {
  it("splits arrivals into northbound and southbound arrays", () => {
    const parsed = parseFeed("gtfs", aDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    // 1-trip goes north (101N, 102N, 103N)
    const southFerry = result.get("101");
    expect(southFerry?.northbound.length).toBeGreaterThanOrEqual(1);

    // 2-trip goes south (101S, 100S)
    const whitehall = result.get("100");
    expect(whitehall?.southbound.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// transformFeeds: ArrivalTime fields
// ---------------------------------------------------------------------------

describe("transformFeeds - ArrivalTime fields", () => {
  it("each arrival has line, direction, arrivalTime, minutesAway", () => {
    const parsed = parseFeed("gtfs", aDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    let foundArrival = false;
    for (const [, arrivals] of result) {
      for (const a of [...arrivals.northbound, ...arrivals.southbound]) {
        expect(typeof a.line).toBe("string");
        expect(["N", "S"]).toContain(a.direction);
        expect(typeof a.arrivalTime).toBe("number");
        expect(typeof a.minutesAway).toBe("number");
        expect(typeof a.isAssigned).toBe("boolean");
        expect(typeof a.confidence).toBe("string");
        expect(a.feedName).toBe("gtfs");
        foundArrival = true;
        break;
      }
      if (foundArrival) break;
    }
    expect(foundArrival).toBe(true);
  });

  it("arrivals are sorted by arrivalTime within each direction", () => {
    const parsed = parseFeed("gtfs", aDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    for (const [, arrivals] of result) {
      for (const dir of [arrivals.northbound, arrivals.southbound]) {
        for (let i = 1; i < dir.length; i++) {
          expect(dir[i]!.arrivalTime).toBeGreaterThanOrEqual(dir[i - 1]!.arrivalTime);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// transformFeeds: confidence
// ---------------------------------------------------------------------------

describe("transformFeeds - confidence", () => {
  it("A Division assigned → high confidence", () => {
    const parsed = parseFeed("gtfs", aDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    // 1-trip is assigned, should be high
    const arrivals = result.get("101")?.northbound;
    expect(arrivals).toBeDefined();
    expect(arrivals!.length).toBeGreaterThan(0);
    expect(arrivals![0]!.confidence).toBe("high");
  });

  it("B Division assigned → medium confidence", () => {
    const parsed = parseFeed("gtfs-bdfm", bDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs-bdfm", parsed]]);
    const feedAges = new Map([["gtfs-bdfm", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    // F-trip-001 is assigned, should be medium
    const arrivals = result.get("725")?.northbound;
    expect(arrivals).toBeDefined();
    expect(arrivals!.length).toBeGreaterThan(0);
    expect(arrivals![0]!.confidence).toBe("medium");
  });

  it("B Division unassigned → low confidence", () => {
    const parsed = parseFeed("gtfs-bdfm", bDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs-bdfm", parsed]]);
    const feedAges = new Map([["gtfs-bdfm", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    // F-trip-002 is unassigned, should be low
    const arrivals = result.get("725")?.southbound;
    expect(arrivals).toBeDefined();
    expect(arrivals!.length).toBeGreaterThan(0);
    expect(arrivals![0]!.confidence).toBe("low");
  });
});

// ---------------------------------------------------------------------------
// transformFeeds: reroute detection
// ---------------------------------------------------------------------------

describe("transformFeeds - reroute detection", () => {
  it("detects rerouted trains via track mismatch", () => {
    const parsed = parseFeed("gtfs-bdfm", reroutedTrackFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs-bdfm", parsed]]);
    const feedAges = new Map([["gtfs-bdfm", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    const arrivals = result.get("725")?.northbound;
    expect(arrivals).toBeDefined();
    expect(arrivals!.length).toBeGreaterThan(0);
    // First stop has scheduled_track=1, actual_track=2 → rerouted
    expect(arrivals![0]!.isRerouted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// transformFeeds: past arrival filtering
// ---------------------------------------------------------------------------

describe("transformFeeds - past arrival filtering", () => {
  it("filters out arrivals more than 30s in the past", () => {
    const parsed = parseFeed("gtfs", pastArrivalsFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    // The pastArrivalsFeed has arrivals 2 minutes ago → should produce no results
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// transformFeeds: edge cases
// ---------------------------------------------------------------------------

describe("transformFeeds - edge cases", () => {
  it("empty feed produces no arrivals", () => {
    const parsed = parseFeed("gtfs", emptyFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);
    expect(result.size).toBe(0);
  });

  it("deleted entities are skipped", () => {
    const parsed = parseFeed("gtfs", deletedEntitiesFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    // Only the active entity should produce arrivals
    let totalArrivals = 0;
    for (const [, arrivals] of result) {
      totalArrivals += arrivals.northbound.length + arrivals.southbound.length;
    }
    expect(totalArrivals).toBe(1);
  });

  it("unknown stop IDs are skipped gracefully", () => {
    const parsed = parseFeed("gtfs", aDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 5]]);

    // Empty stations/routes means nothing matches
    const emptyStations: StationIndex = {};
    const emptyRoutes: RouteIndex = {};
    const result = transformFeeds(feeds, emptyStations, emptyRoutes, stopToStation, feedAges);
    expect(result.size).toBe(0);
  });

  it("multiple feeds produce combined arrivals", () => {
    const parsedGtfs = parseFeed("gtfs", aDivisionFeed());
    const parsedBdfm = parseFeed("gtfs-bdfm", bDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([
      ["gtfs", parsedGtfs],
      ["gtfs-bdfm", parsedBdfm],
    ]);
    const feedAges = new Map([
      ["gtfs", 5],
      ["gtfs-bdfm", 10],
    ]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);
    expect(result.size).toBeGreaterThan(0);
  });

  it("feedAge is propagated to arrivals", () => {
    const parsed = parseFeed("gtfs", aDivisionFeed());
    const feeds = new Map<string, ParsedFeed>([["gtfs", parsed]]);
    const feedAges = new Map([["gtfs", 42]]);
    const result = transformFeeds(feeds, STATIONS, ROUTES, stopToStation, feedAges);

    for (const [, arrivals] of result) {
      for (const a of [...arrivals.northbound, ...arrivals.southbound]) {
        expect(a.feedAge).toBe(42);
      }
    }
  });
});
