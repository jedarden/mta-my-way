/**
 * Unit tests for trip lookup functionality
 */

import type { StationIndex } from "@mta-my-way/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the cache module
vi.mock("./cache.js", () => ({
  getAllParsedFeeds: vi.fn(),
}));

import { getAllParsedFeeds } from "./cache.js";
// Import after mocking
import { lookupTrip } from "./trip-lookup.js";

// Mock station data
const mockStations: StationIndex = {
  R01: {
    id: "R01",
    name: "South Ferry",
    location: { lat: 40.702, lon: -74.013 },
    lines: ["1"],
    northStopId: "R01N",
    southStopId: "R01S",
    accessible: false,
  },
  R02: {
    id: "R02",
    name: "Rector Street",
    location: { lat: 40.704, lon: -74.013 },
    lines: ["1"],
    northStopId: "R02N",
    southStopId: "R02S",
    accessible: true,
  },
  R03: {
    id: "R03",
    name: "WTC Cortlandt",
    location: { lat: 40.707, lon: -74.013 },
    lines: ["1"],
    northStopId: "R03N",
    southStopId: "R03S",
    accessible: true,
  },
};

// Helper to create mock GTFS-RT feed data
function createMockFeed(
  tripId: string,
  routeId: string,
  stops: Array<{
    stopId: string;
    arrivalTime?: number;
    departureTime?: number;
    scheduledTrack?: string;
    actualTrack?: string;
  }>
) {
  const now = Math.floor(Date.now() / 1000);

  return {
    message: {
      header: {
        timestamp: { toNumber: () => now },
      },
      entity: [
        {
          isDeleted: false,
          tripUpdate: {
            trip: {
              tripId,
              routeId,
              // @ts-ignore - nyct extension
              ".transit_realtime.nyctTripDescriptor": {
                isAssigned: true,
                trainId: "123",
              },
            },
            stopTimeUpdate: stops.map((s, i) => ({
              stopId: s.stopId,
              arrival: s.arrivalTime ? { time: { toNumber: () => s.arrivalTime } } : undefined,
              departure: s.departureTime
                ? { time: { toNumber: () => s.departureTime } }
                : undefined,
              // @ts-ignore - nyct extension
              ".transit_realtime.nyctStopTimeUpdate": {
                scheduledTrack: s.scheduledTrack ?? null,
                actualTrack: s.actualTrack ?? null,
              },
            })),
          },
        },
      ],
    },
  };
}

describe("lookupTrip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear tripFirstSeen Map by setting a new trip to expire old entries
    const now = Date.now();
    // The tripFirstSeen Map is module-private, so we can't directly clear it
    // We'll work around this by using unique trip IDs in each test
  });

  it("returns null for unknown trip ID", () => {
    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map());

    const result = lookupTrip("unknown-trip-id", mockStations);
    expect(result).toBeNull();
  });

  it("returns trip data when trip is found", () => {
    const now = Math.floor(Date.now() / 1000);
    const futureTime = now + 600; // 10 minutes from now

    const mockFeed = createMockFeed("trip-123", "1", [
      {
        stopId: "R01N",
        departureTime: now - 60,
        arrivalTime: now - 70,
      },
      {
        stopId: "R02N",
        departureTime: futureTime,
        arrivalTime: futureTime - 30,
      },
      {
        stopId: "R03N",
        departureTime: futureTime + 300,
        arrivalTime: futureTime + 270,
      },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-123", mockStations);

    expect(result).not.toBeNull();
    expect(result?.tripId).toBe("trip-123");
    expect(result?.routeId).toBe("1");
    expect(result?.stops).toHaveLength(3);
  });

  it("includes station names from station index", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-456", "1", [
      {
        stopId: "R01N",
        departureTime: now - 60,
      },
      {
        stopId: "R02N",
        departureTime: now + 300,
      },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-456", mockStations);

    expect(result?.stops[0]?.stationName).toBe("South Ferry");
    expect(result?.stops[1]?.stationName).toBe("Rector Street");
  });

  it("includes track information from NYCT extensions", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-789", "1", [
      {
        stopId: "R01N",
        departureTime: now - 60,
        scheduledTrack: "1",
        actualTrack: "2",
      },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-789", mockStations);

    expect(result?.stops[0]?.scheduledTrack).toBe("1");
    expect(result?.stops[0]?.actualTrack).toBe("2");
  });

  it("infers direction from stop IDs", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-north", "1", [
      { stopId: "R01N", departureTime: now - 60 },
      { stopId: "R02N", departureTime: now + 300 },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-north", mockStations);
    expect(result?.direction).toBe("N");
  });

  it("infers southbound direction", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-south", "1", [
      { stopId: "R03S", departureTime: now - 60 },
      { stopId: "R02S", departureTime: now + 300 },
      { stopId: "R01S", departureTime: now + 600 },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-south", mockStations);
    expect(result?.direction).toBe("S");
  });

  it("returns null for direction when insufficient stops", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-single", "1", [
      { stopId: "R01N", departureTime: now - 60 },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-single", mockStations);
    expect(result?.direction).toBeNull();
  });

  it("calculates current stop index correctly", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-progress", "1", [
      { stopId: "R01N", departureTime: now - 300 }, // Past
      { stopId: "R02N", departureTime: now - 60 }, // Past
      { stopId: "R03N", departureTime: now + 300 }, // Future
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-progress", mockStations);
    expect(result?.currentStopIndex).toBe(1); // Last passed stop
  });

  it("calculates progress percentage correctly", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-calc", "1", [
      { stopId: "R01N", departureTime: now - 300 },
      { stopId: "R02N", departureTime: now - 60 },
      { stopId: "R03N", departureTime: now + 300 },
      { stopId: "R04N", departureTime: now + 600 },
      { stopId: "R05N", departureTime: now + 900 },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-calc", mockStations);
    expect(result?.progressPercent).toBeCloseTo(25, 0); // 1 out of 4 stops passed
    expect(result?.remainingStops).toBe(3);
    expect(result?.totalStops).toBe(5);
  });

  it("extracts trip assignment and train ID", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-assigned", "1", [
      { stopId: "R01N", departureTime: now - 60 },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-assigned", mockStations);
    expect(result?.isAssigned).toBe(true);
    expect(result?.trainId).toBe("123");
  });

  it("calculates feed age correctly", () => {
    const feedTime = Math.floor(Date.now() / 1000) - 45; // 45 seconds ago

    const mockFeed = createMockFeed("trip-age", "1", [{ stopId: "R01N", departureTime: feedTime }]);

    // Update header timestamp - mock as a Number-like object that converts properly
    const timestampObj = {
      toNumber: () => feedTime,
      valueOf: () => feedTime,
      [Symbol.toPrimitive]: () => feedTime,
    } as unknown as number;
    mockFeed.message.header.timestamp = timestampObj;

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-age", mockStations);
    expect(result?.feedAge).toBeGreaterThan(40); // Approximately 45 seconds
    expect(result?.feedAge).toBeLessThan(50); // Should be close to 45
  });

  it("sets destination from last stop", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-dest", "1", [
      { stopId: "R01N", departureTime: now - 60 },
      { stopId: "R02N", departureTime: now + 300 },
      { stopId: "R03N", departureTime: now + 600 },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-dest", mockStations);
    expect(result?.destination).toBe("WTC Cortlandt");
  });

  it("handles missing station names gracefully", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-unknown", "1", [
      { stopId: "UNKNOWNN", departureTime: now - 60 },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-unknown", mockStations);
    // Unknown stop IDs that don't map to a station return "Unknown" fallback
    expect(result?.stops[0]?.stationName).toBe("Unknown");
  });

  it("handles null arrival/departure times", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-null-times", "1", [
      {
        stopId: "R01N",
        // No arrival/departure times
      },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-null-times", mockStations);
    expect(result?.stops[0]?.arrivalTime).toBeNull();
    expect(result?.stops[0]?.departureTime).toBeNull();
  });

  it("returns zero values for zero timestamp", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-zero", "1", [
      {
        stopId: "R01N",
        arrivalTime: 0, // Should be treated as null
        departureTime: now - 60,
      },
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-zero", mockStations);
    expect(result?.stops[0]?.arrivalTime).toBeNull();
    expect(result?.stops[0]?.departureTime).toBe(now - 60);
  });

  it("finds current stop index using arrival time when departure is missing", () => {
    const now = Math.floor(Date.now() / 1000);

    const mockFeed = createMockFeed("trip-arrival-only", "1", [
      { stopId: "R01N", arrivalTime: now - 300 }, // Past
      { stopId: "R02N", arrivalTime: now - 60 }, // Past
      { stopId: "R03N", arrivalTime: now + 300 }, // Future
    ]);

    vi.mocked(getAllParsedFeeds).mockReturnValue(new Map([["feed1", mockFeed]]));

    const result = lookupTrip("trip-arrival-only", mockStations);
    expect(result?.currentStopIndex).toBe(1);
  });
});
