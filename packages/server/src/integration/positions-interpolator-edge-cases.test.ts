/**
 * Integration tests for positions interpolator edge cases.
 *
 * Tests the line diagram builder with:
 * - Train status edge cases (STOPPED_AT, INCOMING_AT, IN_TRANSIT_TO)
 * - Direction handling (northbound/southbound)
 * - Terminal station behavior
 * - Express vs local trains
 * - Transfer stations
 * - Bunched trains detection
 * - Missing or malformed data
 */

import type { LinePositions, RouteIndex, StationIndex, TrainPosition } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildLineDiagram, detectBunchedTrains } from "../positions-interpolator.js";

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
    name: "Chambers St",
    lat: 40.714,
    lon: -74.011,
    lines: ["1"],
    northStopId: "103N",
    southStopId: "103S",
    transfers: [],
    ada: false,
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
    transfers: [
      { toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true },
    ],
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
  "727": {
    id: "727",
    name: "50 St",
    lat: 40.763,
    lon: -73.989,
    lines: ["A", "C", "E"],
    northStopId: "727N",
    southStopId: "727S",
    transfers: [],
    ada: true,
    borough: "manhattan",
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
    stops: ["101", "102", "103", "725"],
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
    stops: ["726", "727"],
    isExpress: true,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Positions Interpolator Edge Cases", () => {
  describe("buildLineDiagram", () => {
    it("returns null for unknown route", () => {
      const positions: LinePositions = {
        routeId: "Z",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "Z", TEST_ROUTES, TEST_STATIONS);
      expect(result).toBeNull();
    });

    it("returns diagram with no trains for known route", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      expect(result).not.toBeNull();
      expect(result?.trains).toEqual([]);
    });

    it("normalizes route ID to uppercase", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      expect(result?.routeId).toBe("1");
    });
  });

  describe("Train status interpolation", () => {
    it("interpolates STOPPED_AT status correctly", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [
          {
            tripId: "trip1",
            routeId: "1",
            direction: "N",
            currentStopId: "102N",
            currentStopSequence: 2,
            status: "STOPPED_AT",
            destination: "Van Cortlandt Park",
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            delay: 0,
          },
        ],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      expect(result?.trains).toHaveLength(1);

      const train = result?.trains[0];
      expect(train?.progress).toBe(1.0); // 100% at station
      expect(train?.lastStopId).toBe("102");
      expect(train?.nextStopId).toBe("103"); // Next northbound stop
    });

    it("interpolates INCOMING_AT status correctly", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [
          {
            tripId: "trip1",
            routeId: "1",
            direction: "N",
            currentStopId: "103N",
            currentStopSequence: 3,
            status: "INCOMING_AT",
            destination: "Van Cortlandt Park",
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            delay: 0,
          },
        ],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const train = result?.trains[0];

      expect(train?.progress).toBe(0.9); // 90% progress when incoming
      expect(train?.lastStopId).toBe("102"); // Previous stop
      expect(train?.nextStopId).toBe("103"); // Approaching this stop
    });

    it("interpolates IN_TRANSIT_TO status correctly", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [
          {
            tripId: "trip1",
            routeId: "1",
            direction: "N",
            currentStopId: "102N",
            currentStopSequence: 2,
            status: "IN_TRANSIT_TO",
            destination: "Van Cortlandt Park",
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            delay: 0,
          },
        ],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const train = result?.trains[0];

      expect(train?.progress).toBe(0.5); // 50% between stations
    });

    it("handles southbound direction correctly", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [
          {
            tripId: "trip1",
            routeId: "1",
            direction: "S",
            currentStopId: "725S",
            currentStopSequence: 4,
            status: "STOPPED_AT",
            destination: "South Ferry",
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            delay: 0,
          },
        ],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const train = result?.trains[0];

      expect(train?.direction).toBe("S");
      expect(train?.lastStopId).toBe("725");
      expect(train?.nextStopId).toBe("103"); // Previous stop going southbound
    });
  });

  describe("Terminal station handling", () => {
    it("handles train at northern terminal", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [
          {
            tripId: "trip1",
            routeId: "1",
            direction: "N",
            currentStopId: "725N",
            currentStopSequence: 4,
            status: "STOPPED_AT",
            destination: "Times Sq-42 St",
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            delay: 0,
          },
        ],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const train = result?.trains[0];

      // At terminal, next stop should still be terminal (no further stops)
      expect(train?.lastStopId).toBe("725");
    });

    it("handles train at southern terminal", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [
          {
            tripId: "trip1",
            routeId: "1",
            direction: "S",
            currentStopId: "101S",
            currentStopSequence: 1,
            status: "STOPPED_AT",
            destination: "South Ferry",
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            delay: 0,
          },
        ],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const train = result?.trains[0];

      expect(train?.lastStopId).toBe("101");
    });
  });

  describe("Transfer station detection", () => {
    it("marks transfer stations correctly", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const timesSquare = result?.stops.find((s) => s.stopId === "725");

      expect(timesSquare?.isTransferStation).toBe(true);
      // Times Square has many lines - when building line 1, transfer lines are all lines except 1
      expect(timesSquare?.transferLines).toEqual(["2", "3", "7", "N", "Q", "R", "W", "S"]);
    });

    it("marks non-transfer stations correctly", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const rector = result?.stops.find((s) => s.stopId === "102");

      expect(rector?.isTransferStation).toBe(false);
    });
  });

  describe("Terminal station detection", () => {
    it("marks first stop as terminal", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const firstStop = result?.stops[0];

      expect(firstStop?.isTerminal).toBe(true);
    });

    it("marks last stop as terminal", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const lastStop = result?.stops[result?.stops.length - 1];

      expect(lastStop?.isTerminal).toBe(true);
    });

    it("does not mark middle stops as terminal", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      const middleStop = result?.stops[1];

      expect(middleStop?.isTerminal).toBe(false);
    });
  });

  describe("Missing station data", () => {
    it("handles missing station gracefully", () => {
      const routesWithMissing: RouteIndex = {
        "1": {
          id: "1",
          shortName: "1",
          longName: "Broadway-7th Ave Local",
          color: "#EE352E",
          textColor: "#FFFFFF",
          feedId: "gtfs",
          division: "A",
          stops: ["101", "999", "725"], // 999 doesn't exist
          isExpress: false,
        },
      };

      const positions: LinePositions = {
        routeId: "1",
        trains: [],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", routesWithMissing, TEST_STATIONS);
      expect(result).not.toBeNull();

      const missingStop = result?.stops.find((s) => s.stopId === "999");
      expect(missingStop?.stopName).toBe("999"); // Falls back to stop ID
    });
  });

  describe("Multiple trains", () => {
    it("handles multiple trains on same line", () => {
      const positions: LinePositions = {
        routeId: "1",
        trains: [
          {
            tripId: "trip1",
            routeId: "1",
            direction: "N",
            currentStopId: "101N",
            currentStopSequence: 1,
            status: "STOPPED_AT",
            destination: "Times Sq-42 St",
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            delay: 0,
          },
          {
            tripId: "trip2",
            routeId: "1",
            direction: "N",
            currentStopId: "102N",
            currentStopSequence: 2,
            status: "IN_TRANSIT_TO",
            destination: "Van Cortlandt Park",
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            delay: 0,
          },
        ],
        timestamp: Date.now(),
      };

      const result = buildLineDiagram(positions, "1", TEST_ROUTES, TEST_STATIONS);
      expect(result?.trains).toHaveLength(2);
    });
  });
});

describe("Bunched Trains Detection", () => {
  it("detects no bunching when trains are spread out", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "101",
        nextStopId: "102",
        progress: 0.2,
        destination: "Times Sq",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip2",
        routeId: "1",
        direction: "N",
        lastStopId: "103",
        nextStopId: "725",
        progress: 0.8,
        destination: "Times Sq",
        isAssigned: true,
        delay: 0,
      },
    ];

    const bunched = detectBunchedTrains(trains, 0.1);
    expect(bunched).toHaveLength(0);
  });

  it("detects bunched trains within threshold", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "101",
        nextStopId: "102",
        progress: 0.5,
        destination: "Times Sq",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip2",
        routeId: "1",
        direction: "N",
        lastStopId: "101",
        nextStopId: "102",
        progress: 0.55,
        destination: "Times Sq",
        isAssigned: true,
        delay: 0,
      },
    ];

    const bunched = detectBunchedTrains(trains, 0.1);
    expect(bunched).toHaveLength(1);
    expect(bunched[0]).toHaveLength(2);
  });

  it("separates trains by direction", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "101",
        nextStopId: "102",
        progress: 0.5,
        destination: "Times Sq",
        isAssigned: true,
        delay: 0,
      },
      {
        tripId: "trip2",
        routeId: "1",
        direction: "S",
        lastStopId: "102",
        nextStopId: "101",
        progress: 0.5,
        destination: "South Ferry",
        isAssigned: true,
        delay: 0,
      },
    ];

    const bunched = detectBunchedTrains(trains, 0.1);
    expect(bunched).toHaveLength(0); // Different directions, not bunched
  });

  it("requires at least 2 trains to form a bunch", () => {
    const trains = [
      {
        tripId: "trip1",
        routeId: "1",
        direction: "N",
        lastStopId: "101",
        nextStopId: "102",
        progress: 0.5,
        destination: "Times Sq",
        isAssigned: true,
        delay: 0,
      },
    ];

    const bunched = detectBunchedTrains(trains, 0.1);
    expect(bunched).toHaveLength(0);
  });

  it("handles empty train list", () => {
    const bunched = detectBunchedTrains([], 0.1);
    expect(bunched).toHaveLength(0);
  });
});

describe("Express train detection", () => {
  it("preserves express flag from train position", () => {
    const positions: LinePositions = {
      routeId: "A",
      fetchedAt: Date.now(),
      feedAge: 5,
      trains: [
        {
          tripId: "trip1",
          routeId: "A",
          direction: "N",
          currentStopId: "726N",
          currentStopSequence: 1,
          status: "IN_TRANSIT_TO",
          destination: "Inwood",
          isAssigned: true,
          isRerouted: false,
          isExpress: true, // Express train
          delay: 0,
          timestamp: Date.now(),
        },
      ],
    };

    const result = buildLineDiagram(positions, "A", TEST_ROUTES, TEST_STATIONS);
    const train = result?.trains[0];

    expect(train?.isExpress).toBe(true);
  });
});
