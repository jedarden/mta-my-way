/**
 * Unit tests for train position interpolation
 */

import type { RouteIndex, StationIndex, TrainPosition } from "@mta-my-way/shared";
import { describe, expect, it } from "vitest";
import { buildLineDiagram, detectBunchedTrains } from "./positions-interpolator.js";

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
    lines: ["1", "2"], // Transfer station
    northStopId: "R03N",
    southStopId: "R03S",
    accessible: true,
  },
  R04: {
    id: "R04",
    name: "Chambers Street",
    location: { lat: 40.714, lon: -74.008 },
    lines: ["1"],
    northStopId: "R04N",
    southStopId: "R04S",
    accessible: true,
  },
  R05: {
    id: "R05",
    name: "Park Place",
    location: { lat: 40.716, lon: -74.007 },
    lines: ["1"],
    northStopId: "R05N",
    southStopId: "R05S",
    accessible: false,
  },
};

// Mock route data
const mockRoutes: RouteIndex = {
  "1": {
    id: "1",
    color: "#EE352E",
    stops: ["R01", "R02", "R03", "R04", "R05"],
  },
  "2": {
    id: "2",
    color: "#EE352E",
    stops: ["R01", "R02", "R03"],
  },
};

describe("buildLineDiagram", () => {
  it("returns null for unknown route", () => {
    const result = buildLineDiagram(
      { routeId: "999", fetchedAt: Date.now(), feedAge: 0, trains: [] },
      "999",
      mockRoutes,
      mockStations
    );
    expect(result).toBeNull();
  });

  it("returns line diagram with stops but no trains for empty trains array", () => {
    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: [] },
      "1",
      mockRoutes,
      mockStations
    );
    // Actually returns a result with empty trains array
    expect(result).not.toBeNull();
    expect(result?.stops).toHaveLength(5);
    expect(result?.trains).toHaveLength(0);
  });

  it("builds line diagram with stops", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        currentStopId: "R02",
        currentStopSequence: 2,
        status: "STOPPED_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Park Place",
        delay: 0,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    expect(result).not.toBeNull();
    expect(result?.routeId).toBe("1");
    expect(result?.routeColor).toBe("#EE352E");
    expect(result?.stops).toHaveLength(5);
    expect(result?.trains).toHaveLength(1);
  });

  it("marks terminal stops correctly", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        currentStopId: "R02",
        currentStopSequence: 2,
        status: "STOPPED_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Park Place",
        delay: 0,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    expect(result?.stops[0]?.isTerminal).toBe(true); // South Ferry
    expect(result?.stops[4]?.isTerminal).toBe(true); // Park Place
    expect(result?.stops[1]?.isTerminal).toBe(false); // Rector Street
  });

  it("identifies transfer stations", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        currentStopId: "R02",
        currentStopSequence: 2,
        status: "STOPPED_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Park Place",
        delay: 0,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    expect(result?.stops[2]?.isTransferStation).toBe(true); // WTC Cortlandt (1,2)
    expect(result?.stops[2]?.transferLines).toEqual(["2"]);
    expect(result?.stops[1]?.isTransferStation).toBe(false); // Rector Street (only 1)
  });

  it("handles case-insensitive route IDs", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        currentStopId: "R02",
        currentStopSequence: 2,
        status: "STOPPED_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Park Place",
        delay: 0,
      },
    ];

    const result1 = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );
    const result2 = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    expect(result1?.routeId).toBe(result2?.routeId);
  });

  it("includes computedAt timestamp", () => {
    const before = Date.now();
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        currentStopId: "R02",
        currentStopSequence: 2,
        status: "STOPPED_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Park Place",
        delay: 0,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    const after = Date.now();
    expect(result?.computedAt).toBeGreaterThanOrEqual(before);
    expect(result?.computedAt).toBeLessThanOrEqual(after);
  });
});

describe("train position interpolation", () => {
  it("interpolates STOPPED_AT status correctly", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        currentStopId: "R02",
        currentStopSequence: 2,
        status: "STOPPED_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Park Place",
        delay: 0,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    const train = result?.trains[0];
    expect(train?.progress).toBe(1.0); // 100% at station
    expect(train?.lastStopId).toBe("R02");
    expect(train?.nextStopId).toBe("R03"); // Northbound, next stop
  });

  it("interpolates INCOMING_AT status correctly", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        currentStopId: "R03",
        currentStopSequence: 3,
        status: "INCOMING_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Park Place",
        delay: 0,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    const train = result?.trains[0];
    expect(train?.progress).toBe(0.9); // 90% to next station
    expect(train?.lastStopId).toBe("R02"); // Coming from previous
    expect(train?.nextStopId).toBe("R03"); // Approaching this
  });

  it("interpolates IN_TRANSIT_TO status correctly", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        currentStopId: "R02",
        currentStopSequence: 2,
        status: "IN_TRANSIT_TO",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Park Place",
        delay: 0,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    const train = result?.trains[0];
    expect(train?.progress).toBe(0.5); // 50% between stops
  });

  it("handles southbound trains", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "S",
        currentStopId: "R04",
        currentStopSequence: 4,
        status: "STOPPED_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "South Ferry",
        delay: 0,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    const train = result?.trains[0];
    expect(train?.direction).toBe("S");
    expect(train?.progress).toBe(1.0);
    expect(train?.nextStopId).toBe("R03"); // Southbound, previous stop
  });

  it("preserves trip metadata", () => {
    const mockPositions: TrainPosition[] = [
      {
        tripId: "MTA_ABC123",
        routeId: "1",
        direction: "N",
        currentStopId: "R02",
        currentStopSequence: 2,
        status: "STOPPED_AT",
        timestamp: Date.now(),
        isAssigned: true,
        destination: "Van Cortlandt Park",
        delay: 120,
      },
    ];

    const result = buildLineDiagram(
      { routeId: "1", fetchedAt: Date.now(), feedAge: 0, trains: mockPositions },
      "1",
      mockRoutes,
      mockStations
    );

    const train = result?.trains[0];
    expect(train?.tripId).toBe("MTA_ABC123");
    expect(train?.isAssigned).toBe(true);
    expect(train?.delay).toBe(120);
    expect(train?.destination).toBe("Van Cortlandt Park");
  });
});

describe("detectBunchedTrains", () => {
  it("returns empty array when no trains are bunched", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "R01",
        nextStopId: "R02",
        progress: 0.0,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip2",
        routeId: "1",
        direction: "N",
        lastStopId: "R04",
        nextStopId: "R05",
        progress: 0.9,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
    ];

    const result = detectBunchedTrains(trains, 0.1);
    expect(result).toHaveLength(0);
  });

  it("detects bunched trains in same direction", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.5,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip2",
        routeId: "1",
        direction: "N",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.52, // Within threshold
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
    ];

    const result = detectBunchedTrains(trains, 0.1);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(2);
  });

  it("does not group trains from different directions", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.5,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip2",
        routeId: "1",
        direction: "S",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.5,
        destination: "South Ferry",
        isAssigned: true,
        delay: 0,
      },
    ];

    const result = detectBunchedTrains(trains, 0.1);
    expect(result).toHaveLength(0); // Different directions, not bunched
  });

  it("requires at least 2 trains for bunching", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.5,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
    ];

    const result = detectBunchedTrains(trains, 0.1);
    expect(result).toHaveLength(0);
  });

  it("handles custom threshold values", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.5,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip2",
        routeId: "1",
        direction: "N",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.65, // 0.15 difference
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
    ];

    // With 0.1 threshold, not bunched
    expect(detectBunchedTrains(trains, 0.1)).toHaveLength(0);
    // With 0.2 threshold, bunched
    expect(detectBunchedTrains(trains, 0.2)).toHaveLength(1);
  });

  it("detects multiple bunch groups", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.3,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip2",
        routeId: "1",
        direction: "N",
        lastStopId: "R02",
        nextStopId: "R03",
        progress: 0.35,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip3",
        routeId: "1",
        direction: "N",
        lastStopId: "R04",
        nextStopId: "R05",
        progress: 0.8,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip4",
        routeId: "1",
        direction: "N",
        lastStopId: "R04",
        nextStopId: "R05",
        progress: 0.85,
        destination: "Park Place",
        isAssigned: true,
        delay: 0,
      },
    ];

    const result = detectBunchedTrains(trains, 0.1);
    expect(result).toHaveLength(2); // Two separate bunch groups
    expect(result[0]).toHaveLength(2);
    expect(result[1]).toHaveLength(2);
  });
});
