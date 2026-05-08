/**
 * Debug test for delay detector.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDelayDetector, processVehicleUpdates, resetDelayDetector } from "./delay-detector.js";

const TEST_STATIONS = {
  "100": {
    id: "100",
    name: "South Terminal",
    lat: 40.702,
    lon: -74.013,
    lines: ["1"],
    northStopId: "100N",
    southStopId: "100S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
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
  "104": {
    id: "104",
    name: "North Terminal",
    lat: 40.72,
    lon: -74.01,
    lines: ["1"],
    northStopId: "104N",
    southStopId: "104S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
};

const TEST_ROUTES = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["100", "101", "102", "103", "104"],
    isExpress: false,
  },
};

const TEST_TRAVEL_TIMES = {
  "1": {
    "100": {
      "101": 120,
      "102": 240,
      "103": 360,
      "104": 480,
    },
    "101": {
      "102": 120, // 2 minutes
      "103": 240,
      "104": 360,
    },
    "102": {
      "103": 120,
      "104": 240,
    },
    "103": {
      "104": 120,
    },
  },
};

describe("Delay Detector Debug", () => {
  beforeEach(() => {
    initDelayDetector(TEST_TRAVEL_TIMES, TEST_ROUTES, TEST_STATIONS, {
      thresholdMultiplier: 2.0,
      minTrainsForLineAlert: 2,
    });
  });

  afterEach(() => {
    resetDelayDetector();
  });

  it("should detect delay", () => {
    const now = Date.now();
    const t1 = Math.floor(now / 1000);
    const t2 = t1 + 300; // 5 minutes later

    console.log("t1:", t1, "t2:", t2, "diff:", t2 - t1);

    // First position
    const positions1 = [
      {
        tripId: "TRIP_1",
        routeId: "1",
        direction: "N" as const,
        currentStopSequence: 1,
        currentStopId: "101N",
        status: "STOPPED_AT" as const,
        timestamp: t1,
        isAssigned: true,
      },
    ];

    console.log("Processing first position...");
    const result1 = processVehicleUpdates(positions1);
    console.log("Result 1:", result1);

    // Second position
    const positions2 = [
      {
        tripId: "TRIP_1",
        routeId: "1",
        direction: "N" as const,
        currentStopSequence: 2,
        currentStopId: "102N",
        status: "STOPPED_AT" as const,
        timestamp: t2,
        isAssigned: true,
      },
    ];

    console.log("Processing second position...");
    const result2 = processVehicleUpdates(positions2);
    console.log("Result 2:", result2);

    expect(result2).toHaveLength(1);
  });
});
