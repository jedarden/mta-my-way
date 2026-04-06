/**
 * Tests for parser.ts
 *
 * Tests parseFeed() against synthetic protobuf fixtures covering:
 * - Normal A Division and B Division feeds
 * - Empty feed
 * - Unassigned trips
 * - NYCT header extensions (trip replacement period)
 * - Deleted entities
 * - No NYCT extension (no trip replacement period)
 */

import { describe, expect, it } from "vitest";
import { parseFeed } from "./parser.js";
import {
  aDivisionFeed,
  bDivisionFeed,
  deletedEntitiesFeed,
  emptyFeed,
  lLineFeed,
  noNyctExtensionFeed,
  nqrwFeed,
  pastArrivalsFeed,
  reroutedTrackFeed,
  unassignedTripsFeed,
} from "./test/fixtures.js";

// ---------------------------------------------------------------------------
// Normal feeds
// ---------------------------------------------------------------------------

describe("parseFeed", () => {
  it("parses A Division feed with correct entity count", () => {
    const result = parseFeed("gtfs", aDivisionFeed());
    expect(result.feedId).toBe("gtfs");
    expect(result.entityCount).toBe(2);
    expect(result.feedTimestamp).toBeGreaterThan(0);
    expect(result.tripReplacementPeriod).toBe(12000);
  });

  it("parses B Division feed with mixed assignment status", () => {
    const result = parseFeed("gtfs-bdfm", bDivisionFeed());
    expect(result.feedId).toBe("gtfs-bdfm");
    expect(result.entityCount).toBe(3);
  });

  it("parses L Line feed (CBTC)", () => {
    const result = parseFeed("gtfs-l", lLineFeed());
    expect(result.feedId).toBe("gtfs-l");
    expect(result.entityCount).toBe(1);
  });

  it("parses NQRW feed with multiple lines", () => {
    const result = parseFeed("gtfs-nqrw", nqrwFeed());
    expect(result.feedId).toBe("gtfs-nqrw");
    expect(result.entityCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("parseFeed - edge cases", () => {
  it("empty feed returns zero entities", () => {
    const result = parseFeed("gtfs", emptyFeed());
    expect(result.entityCount).toBe(0);
    expect(result.feedTimestamp).toBeGreaterThan(0);
  });

  it("unassigned trips feed parses correctly", () => {
    const result = parseFeed("gtfs-ace", unassignedTripsFeed());
    expect(result.entityCount).toBe(2);
    // Verify entities are accessible
    expect(result.message.entity).toHaveLength(2);
  });

  it("feed with deleted entities still counts all entities", () => {
    const result = parseFeed("gtfs", deletedEntitiesFeed());
    expect(result.entityCount).toBe(3); // 2 deleted + 1 active
  });

  it("feed without NYCT extension has null tripReplacementPeriod", () => {
    const result = parseFeed("gtfs", noNyctExtensionFeed());
    expect(result.tripReplacementPeriod).toBeNull();
  });

  it("feed with NYCT extension has non-null tripReplacementPeriod", () => {
    const result = parseFeed("gtfs", aDivisionFeed());
    expect(result.tripReplacementPeriod).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Field presence
// ---------------------------------------------------------------------------

describe("parseFeed - field presence", () => {
  it("trip update entities have routeId", () => {
    const result = parseFeed("gtfs", aDivisionFeed());
    for (const entity of result.message.entity) {
      if (entity.tripUpdate) {
        expect(entity.tripUpdate.trip?.routeId).toBeDefined();
      }
    }
  });

  it("trip updates have stop time updates with stopId", () => {
    const result = parseFeed("gtfs", aDivisionFeed());
    for (const entity of result.message.entity) {
      if (entity.tripUpdate?.stopTimeUpdate) {
        for (const stu of entity.tripUpdate.stopTimeUpdate) {
          expect(stu.stopId).toBeDefined();
        }
      }
    }
  });

  it("stop time updates have arrival time", () => {
    const result = parseFeed("gtfs", aDivisionFeed());
    for (const entity of result.message.entity) {
      if (entity.tripUpdate?.stopTimeUpdate) {
        for (const stu of entity.tripUpdate.stopTimeUpdate) {
          expect(stu.arrival?.time).toBeDefined();
        }
      }
    }
  });

  it("NYCT trip descriptor is accessible via extension key", () => {
    const result = parseFeed("gtfs", aDivisionFeed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = result.message.entity[0] as any;
    const nyctTrip = entity.tripUpdate?.trip?.[".transit_realtime.nyctTripDescriptor"];
    expect(nyctTrip).toBeDefined();
    expect(nyctTrip.isAssigned).toBe(true);
  });

  it("NYCT stop time update is accessible for rerouted feed", () => {
    const result = parseFeed("gtfs-bdfm", reroutedTrackFeed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = result.message.entity[0] as any;
    const stu = entity.tripUpdate?.stopTimeUpdate?.[0];
    const nyctStu = stu?.[".transit_realtime.nyctStopTimeUpdate"];
    expect(nyctStu).toBeDefined();
    expect(nyctStu.scheduledTrack).toBe("1");
    expect(nyctStu.actualTrack).toBe("2");
  });

  it("feedTimestamp is a positive number", () => {
    const result = parseFeed("gtfs", aDivisionFeed());
    expect(result.feedTimestamp).toBeGreaterThan(0);
    expect(Number.isInteger(result.feedTimestamp)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Reroute detection via NYCT stop time extensions
// ---------------------------------------------------------------------------

describe("parseFeed - NYCT stop time extensions", () => {
  it("rerouted feed has mismatched scheduled/actual track", () => {
    const result = parseFeed("gtfs-bdfm", reroutedTrackFeed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = result.message.entity[0] as any;
    const firstStu = entity.tripUpdate.stopTimeUpdate[0];
    const nyctStu = firstStu[".transit_realtime.nyctStopTimeUpdate"];
    // Protobufjs converts snake_case to camelCase
    expect(nyctStu.scheduledTrack).not.toBe(nyctStu.actualTrack);
  });

  it("normal feed has matching scheduled/actual track (or no extension)", () => {
    const result = parseFeed("gtfs", aDivisionFeed());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entity = result.message.entity[0] as any;
    const nyctStu =
      entity.tripUpdate?.stopTimeUpdate?.[0]?.[".transit_realtime.nyctStopTimeUpdate"];
    // Normal feeds may not have track info at all
    if (nyctStu?.scheduledTrack && nyctStu?.actualTrack) {
      expect(nyctStu.scheduledTrack).toBe(nyctStu.actualTrack);
    }
  });
});

// ---------------------------------------------------------------------------
// Past arrivals feed
// ---------------------------------------------------------------------------

describe("parseFeed - past arrivals", () => {
  it("past arrivals feed parses correctly (filtering is transformer's job)", () => {
    const result = parseFeed("gtfs", pastArrivalsFeed());
    expect(result.entityCount).toBe(1);
    const entity = result.message.entity[0];
    expect(entity.tripUpdate).toBeDefined();
    // Protobuf time fields may be Long objects - convert to number
    const arrivalTime = entity.tripUpdate?.stopTimeUpdate?.[0]?.arrival?.time;
    expect(Number(arrivalTime)).toBeLessThan(Math.floor(Date.now() / 1000));
  });
});
