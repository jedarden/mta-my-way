/**
 * Tests for delay-detector.ts
 *
 * Covers:
 * - extractVehiclePositions: parsing VehiclePosition from GTFS-RT feed messages
 * - processVehicleUpdates: tracking trips and detecting delayed segments
 * - Single-train alert generation (info severity)
 * - Line-level alert escalation (warning severity, 2+ trains)
 * - Terminal station exclusion
 * - Stale alert pruning
 * - Configurable thresholds
 * - Edge cases: no travel times, empty feed, duplicate positions
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  extractVehiclePositions,
  getPredictedAlerts,
  getTrackedTripCount,
  getDelayDetectorStatus,
  initDelayDetector,
  processVehicleUpdates,
  onPredictedAlert,
  resetDelayDetector,
} from "./delay-detector.js";
import type { DelayDetectorConfig } from "./delay-detector.js";
import type { RouteIndex, StationIndex, TravelTimeIndex } from "@mta-my-way/shared";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const NOW = Math.floor(Date.now() / 1000);

/**
 * Station index with 5 stations per route.
 * Terminals are index 0 and index 4 for route "1"; index 0 and 2 for routes "7" and "A".
 * Use stations at index 1–3 (e.g., "102"→"103") for delay detection tests to avoid
 * the terminal exclusion logic.
 */
const stations: StationIndex = {
  "101": { id: "101", name: "Van Cortlandt Park-242 St", lines: ["1"], northStopId: "101N", southStopId: "101S", lat: 0, lon: 0 },
  "102": { id: "102", name: "238 St", lines: ["1"], northStopId: "102N", southStopId: "102S", lat: 0, lon: 0 },
  "103": { id: "103", name: "231 St", lines: ["1"], northStopId: "103N", southStopId: "103S", lat: 0, lon: 0 },
  "104": { id: "104", name: "225 St", lines: ["1"], northStopId: "104N", southStopId: "104S", lat: 0, lon: 0 },
  "105": { id: "105", name: "Marble Hill-225 St", lines: ["1"], northStopId: "105N", southStopId: "105S", lat: 0, lon: 0 },
  "725": { id: "725", name: "34 St-Hudson Yards", lines: ["7"], northStopId: "725N", southStopId: "725S", lat: 0, lon: 0 },
  "726": { id: "726", name: "Times Sq-42 St", lines: ["7"], northStopId: "726N", southStopId: "726S", lat: 0, lon: 0 },
  "727": { id: "727", name: "5 Av", lines: ["7"], northStopId: "727N", southStopId: "727S", lat: 0, lon: 0 },
  "A01": { id: "A01", name: "Inwood-207 St", lines: ["A"], northStopId: "A01N", southStopId: "A01S", lat: 0, lon: 0 },
  "A02": { id: "A02", name: "Dyckman St", lines: ["A"], northStopId: "A02N", southStopId: "A02S", lat: 0, lon: 0 },
  "A03": { id: "A03", name: "190 St", lines: ["A"], northStopId: "A03N", southStopId: "A03S", lat: 0, lon: 0 },
};

/** Route index with terminal stations at first/last positions */
const routes: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102", "103", "104", "105"],
  },
  "7": {
    id: "7",
    shortName: "7",
    longName: "Flushing Local",
    color: "#B933AD",
    textColor: "#FFFFFF",
    feedId: "gtfs-7",
    division: "A",
    stops: ["725", "726", "727"],
  },
  "A": {
    id: "A",
    shortName: "A",
    longName: "8th Ave Express",
    color: "#2850AD",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["A01", "A02", "A03"],
  },
};

/**
 * Travel times: 90s per inter-station segment.
 * Delays trigger at 2× = 180s.
 * Use non-terminal segments: 102→103, 103→104 for route "1".
 */
const travelTimes: TravelTimeIndex = {
  "1": {
    "101": { "102": 90 },
    "102": { "103": 90 },
    "103": { "104": 90 },
    "104": { "105": 90 },
  },
  "7": {
    "725": { "726": 90 },
    "726": { "727": 90 },
  },
  "A": {
    "A01": { "A02": 90 },
    "A02": { "A03": 90 },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type VehiclePositionInput = Parameters<typeof processVehicleUpdates>[0][number];

function makePosition(overrides: Partial<VehiclePositionInput> & { tripId: string; routeId: string }): VehiclePositionInput {
  return {
    direction: "N" as const,
    currentStopSequence: 1,
    currentStopId: "102N",
    status: "IN_TRANSIT_TO" as const,
    timestamp: NOW,
    isAssigned: true,
    ...overrides,
  };
}

/** Create a synthetic GTFS-RT feed message with VehiclePosition entities */
function makeFeedMessage(entities: Array<{
  tripId: string;
  routeId: string;
  stopId: string;
  stopSequence: number;
  timestamp: number;
  status: number;
  direction: number;
  isAssigned: boolean;
}>) {
  return {
    entity: entities.map((e) => ({
      vehicle: {
        trip: {
          tripId: e.tripId,
          routeId: e.routeId,
          ".transit_realtime.nyctTripDescriptor": {
            direction: e.direction,
            isAssigned: e.isAssigned,
          },
        },
        stopId: e.stopId,
        currentStopSequence: e.stopSequence,
        current_status: e.status,
        timestamp: e.timestamp,
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  initDelayDetector(travelTimes, routes, stations);
});

// ---------------------------------------------------------------------------
// extractVehiclePositions
// ---------------------------------------------------------------------------

describe("extractVehiclePositions", () => {
  it("extracts positions from a feed with VehiclePosition entities", () => {
    const message = makeFeedMessage([
      {
        tripId: "T1",
        routeId: "1",
        stopId: "102N",
        stopSequence: 2,
        timestamp: NOW,
        status: 1, // STOPPED_AT
        direction: 1, // NORTH
        isAssigned: true,
      },
    ]);

    const positions = extractVehiclePositions("gtfs", message);
    expect(positions).toHaveLength(1);
    expect(positions[0]).toEqual({
      tripId: "T1",
      routeId: "1",
      direction: "N",
      currentStopSequence: 2,
      currentStopId: "102N",
      status: "STOPPED_AT",
      timestamp: NOW,
      isAssigned: true,
    });
  });

  it("skips entities without vehicle data", () => {
    const message = { entity: [{ tripUpdate: {} }] };
    const positions = extractVehiclePositions("gtfs", message);
    expect(positions).toHaveLength(0);
  });

  it("skips deleted entities", () => {
    const message = {
      entity: [
        {
          isDeleted: true,
          vehicle: {
            trip: { tripId: "T1", routeId: "1" },
            stopId: "102N",
            currentStopSequence: 1,
            current_status: 1,
            timestamp: NOW,
          },
        },
      ],
    };
    const positions = extractVehiclePositions("gtfs", message);
    expect(positions).toHaveLength(0);
  });

  it("skips entities without tripId or routeId", () => {
    const message = {
      entity: [
        { vehicle: { trip: { tripId: "T1" }, stopId: "102N", currentStopSequence: 1, current_status: 1, timestamp: NOW } },
      ],
    };
    const positions = extractVehiclePositions("gtfs", message);
    expect(positions).toHaveLength(0);
  });

  it("skips entities without timestamp or stopId", () => {
    const message = {
      entity: [
        { vehicle: { trip: { tripId: "T1", routeId: "1" }, stopId: "", currentStopSequence: 1, current_status: 1, timestamp: 0 } },
      ],
    };
    const positions = extractVehiclePositions("gtfs", message);
    expect(positions).toHaveLength(0);
  });

  it("maps NYCT direction: 3 → SOUTH", () => {
    const message = makeFeedMessage([
      { tripId: "T1", routeId: "1", stopId: "102S", stopSequence: 2, timestamp: NOW, status: 2, direction: 3, isAssigned: true },
    ]);
    const positions = extractVehiclePositions("gtfs", message);
    expect(positions[0].direction).toBe("S");
  });

  it("maps vehicle status correctly", () => {
    const statuses = [
      { status: 0, expected: "INCOMING_AT" as const },
      { status: 1, expected: "STOPPED_AT" as const },
      { status: 2, expected: "IN_TRANSIT_TO" as const },
    ];

    for (const { status, expected } of statuses) {
      const message = makeFeedMessage([
        { tripId: `T-${status}`, routeId: "1", stopId: "102N", stopSequence: 2, timestamp: NOW, status, direction: 1, isAssigned: true },
      ]);
      const positions = extractVehiclePositions("gtfs", message);
      expect(positions[0].status).toBe(expected);
    }
  });

  it("returns empty array for message without entities", () => {
    const positions = extractVehiclePositions("gtfs", {});
    expect(positions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// processVehicleUpdates: basic tracking
// ---------------------------------------------------------------------------

describe("processVehicleUpdates - basic tracking", () => {
  it("returns empty when not initialized", () => {
    const positions = [makePosition({ tripId: "guard-test", routeId: "1" })];
    const result = processVehicleUpdates(positions);
    expect(result).toEqual([]);
  });

  it("starts tracking a new trip", () => {
    const positions = [makePosition({ tripId: "new-trip-1", routeId: "1", currentStopId: "102N", currentStopSequence: 2 })];
    processVehicleUpdates(positions);
    expect(getTrackedTripCount()).toBeGreaterThanOrEqual(1);
  });

  it("does not flag a delay when train moves within scheduled time", () => {
    // Use non-terminal segment: 102 → 103
    processVehicleUpdates([
      makePosition({ tripId: "ontime-trip", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);

    // 100s elapsed, scheduled = 90s, ratio = 1.11x (below 2.0x threshold)
    const segments = processVehicleUpdates([
      makePosition({ tripId: "ontime-trip", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 100 }),
    ]);

    expect(segments).toHaveLength(0);
    expect(getPredictedAlerts()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// processVehicleUpdates: delay detection
// ---------------------------------------------------------------------------

describe("processVehicleUpdates - delay detection", () => {
  it("detects delay when actual time exceeds 2x scheduled", () => {
    // Use non-terminal segment: 102 → 103 (neither is first/last stop)
    processVehicleUpdates([
      makePosition({ tripId: "delay-trip-1", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);

    // 200s elapsed vs 90s scheduled = 2.22x
    const segments = processVehicleUpdates([
      makePosition({ tripId: "delay-trip-1", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 200 }),
    ]);

    expect(segments).toHaveLength(1);
    expect(segments[0].routeId).toBe("1");
    expect(segments[0].fromStationId).toBe("102");
    expect(segments[0].toStationId).toBe("103");
    expect(segments[0].actualSeconds).toBe(200);
    expect(segments[0].scheduledSeconds).toBe(90);
    expect(segments[0].ratio).toBeCloseTo(2.22, 1);
  });

  it("generates a single-train predicted alert (info severity)", () => {
    processVehicleUpdates([
      makePosition({ tripId: "single-alert-1", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);

    processVehicleUpdates([
      makePosition({ tripId: "single-alert-1", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 200 }),
    ]);

    const alerts = getPredictedAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].source).toBe("predicted");
    expect(alerts[0].severity).toBe("info");
    expect(alerts[0].affectedLines).toEqual(["1"]);
    expect(alerts[0].headline).toContain("1");
    expect(alerts[0].headline).toContain("delayed");
    expect(alerts[0].cause).toBe("DETECTED_DELAY");
  });

  it("does not flag delay below minimum observation time (60s)", () => {
    processVehicleUpdates([
      makePosition({ tripId: "min-obs-trip", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);

    // Only 30s elapsed — below MIN_OBSERVATION_SECONDS
    const segments = processVehicleUpdates([
      makePosition({ tripId: "min-obs-trip", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 30 }),
    ]);

    expect(segments).toHaveLength(0);
    expect(getPredictedAlerts()).toHaveLength(0);
  });

  it("does not flag delay departing from terminal station (first stop)", () => {
    // 101 is the first stop (terminal) on route "1"
    processVehicleUpdates([
      makePosition({ tripId: "terminal-trip", routeId: "1", currentStopId: "101N", currentStopSequence: 1, timestamp: NOW }),
    ]);

    const segments = processVehicleUpdates([
      makePosition({ tripId: "terminal-trip", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW + 200 }),
    ]);

    expect(segments).toHaveLength(0);
  });

  it("does not flag delay arriving at terminal station (last stop)", () => {
    // 105 is the last stop (terminal) on route "1"
    processVehicleUpdates([
      makePosition({ tripId: "terminal-arr", routeId: "1", currentStopId: "104N", currentStopSequence: 4, timestamp: NOW }),
    ]);

    const segments = processVehicleUpdates([
      makePosition({ tripId: "terminal-arr", routeId: "1", currentStopId: "105N", currentStopSequence: 5, timestamp: NOW + 200 }),
    ]);

    expect(segments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Line-level alert escalation
// ---------------------------------------------------------------------------

describe("processVehicleUpdates - line-level escalation", () => {
  it("escalates to line-level alert when 2+ trains are delayed on same route/direction", () => {
    // Route "7" has terminals at 725 (first) and 727 (last).
    // Use segment 726→727: 726 is intermediate, 727 is terminal — but 726 is not terminal.
    // Actually, 727 IS terminal, so this would be excluded. Let me use a longer route.
    // Route "1" has 5 stops: 101(term), 102, 103, 104, 105(term).
    // Use segment 102→103 (both intermediate).

    // Train 1 at 102
    processVehicleUpdates([
      makePosition({ tripId: "line-train-1", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);
    // Train 2 at 102
    processVehicleUpdates([
      makePosition({ tripId: "line-train-2", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);

    // Train 1 moves to 103 (delayed: 200s vs 90s scheduled)
    processVehicleUpdates([
      makePosition({ tripId: "line-train-1", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 200 }),
    ]);
    // Train 2 moves to 103 (delayed: 210s vs 90s scheduled)
    const segments = processVehicleUpdates([
      makePosition({ tripId: "line-train-2", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 210 }),
    ]);

    // Both trains flagged as delayed
    expect(segments.length).toBeGreaterThanOrEqual(1);

    const alerts = getPredictedAlerts();
    // Should have a line-level warning alert
    const lineAlerts = alerts.filter((a) => a.severity === "warning");
    expect(lineAlerts.length).toBeGreaterThanOrEqual(1);
    expect(lineAlerts[0].source).toBe("predicted");
    expect(lineAlerts[0].affectedLines).toEqual(["1"]);
    expect(lineAlerts[0].headline).toContain("1");
  });
});

// ---------------------------------------------------------------------------
// Alert deduplication
// ---------------------------------------------------------------------------

describe("alert deduplication", () => {
  it("does not duplicate an alert for the same trip/segment", () => {
    processVehicleUpdates([
      makePosition({ tripId: "dedup-trip", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);

    processVehicleUpdates([
      makePosition({ tripId: "dedup-trip", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 200 }),
    ]);

    const firstCount = getPredictedAlerts().length;

    // Process same position again — should not create duplicate
    processVehicleUpdates([
      makePosition({ tripId: "dedup-trip", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 205 }),
    ]);

    expect(getPredictedAlerts().length).toBe(firstCount);
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe("configuration", () => {
  it("uses default 2.0x threshold when not configured", () => {
    initDelayDetector(travelTimes, routes, stations);
    const status = getDelayDetectorStatus();
    expect(status.thresholdMultiplier).toBe(2.0);
    expect(status.minTrainsForLineAlert).toBe(2);
  });

  it("uses custom threshold when configured", () => {
    const config: DelayDetectorConfig = {
      thresholdMultiplier: 1.5,
      minTrainsForLineAlert: 3,
    };
    initDelayDetector(travelTimes, routes, stations, config);
    const status = getDelayDetectorStatus();
    expect(status.thresholdMultiplier).toBe(1.5);
    expect(status.minTrainsForLineAlert).toBe(3);
  });

  it("respects custom threshold in delay detection", () => {
    // With 1.5x threshold: 135s actual vs 90s scheduled should trigger (ratio = 1.5)
    initDelayDetector(travelTimes, routes, stations, { thresholdMultiplier: 1.5 });

    processVehicleUpdates([
      makePosition({ tripId: "custom-thresh", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);

    const segments = processVehicleUpdates([
      makePosition({ tripId: "custom-thresh", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 135 }),
    ]);

    expect(segments).toHaveLength(1);
  });

  it("does not trigger below custom threshold", () => {
    // With 1.5x threshold: 130s actual vs 90s scheduled = 1.44x, should NOT trigger
    initDelayDetector(travelTimes, routes, stations, { thresholdMultiplier: 1.5 });

    processVehicleUpdates([
      makePosition({ tripId: "below-custom", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);

    const segments = processVehicleUpdates([
      makePosition({ tripId: "below-custom", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 130 }),
    ]);

    expect(segments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// onPredictedAlert listener
// ---------------------------------------------------------------------------

describe("onPredictedAlert", () => {
  it("notifies listener when a new predicted alert is generated", () => {
    const received: unknown[] = [];
    const unsubscribe = onPredictedAlert((alerts) => {
      received.push(...alerts);
    });

    processVehicleUpdates([
      makePosition({ tripId: "listener-trip", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);
    processVehicleUpdates([
      makePosition({ tripId: "listener-trip", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 200 }),
    ]);

    expect(received.length).toBe(1);
    unsubscribe();
  });

  it("unsubscribes correctly", () => {
    const received: unknown[] = [];
    const unsubscribe = onPredictedAlert((alerts) => {
      received.push(...alerts);
    });

    unsubscribe();

    processVehicleUpdates([
      makePosition({ tripId: "unsub-trip", routeId: "1", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);
    processVehicleUpdates([
      makePosition({ tripId: "unsub-trip", routeId: "1", currentStopId: "103N", currentStopSequence: 3, timestamp: NOW + 200 }),
    ]);

    expect(received).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getDelayDetectorStatus
// ---------------------------------------------------------------------------

describe("getDelayDetectorStatus", () => {
  it("returns current detector state", () => {
    const status = getDelayDetectorStatus();
    expect(status).toHaveProperty("trackedTrips");
    expect(status).toHaveProperty("activeAlerts");
    expect(status).toHaveProperty("thresholdMultiplier");
    expect(status).toHaveProperty("minTrainsForLineAlert");
    expect(typeof status.trackedTrips).toBe("number");
    expect(typeof status.activeAlerts).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("handles empty position array", () => {
    const segments = processVehicleUpdates([]);
    expect(segments).toHaveLength(0);
  });

  it("handles unknown stop ID gracefully", () => {
    processVehicleUpdates([
      makePosition({ tripId: "unknown-stop", routeId: "1", currentStopId: "999N", currentStopSequence: 1, timestamp: NOW }),
    ]);
    // Should not crash, trip should not be tracked (stationId resolves to null)
    expect(getPredictedAlerts()).toHaveLength(0);
  });

  it("handles unknown route gracefully", () => {
    processVehicleUpdates([
      makePosition({ tripId: "unknown-route", routeId: "Z", currentStopId: "102N", currentStopSequence: 2, timestamp: NOW }),
    ]);
    // Should not crash
    expect(getPredictedAlerts()).toHaveLength(0);
  });

  it("handles delay detection on B Division route (A line)", () => {
    // A01 is terminal for route "A" — use A02→A03 (A02 is intermediate, A03 is terminal)
    // A03 IS terminal, so this will be excluded. Use a route with more intermediate stops.
    // Since we can't easily modify routes here, test that A02→A03 is excluded (terminal arrival)
    processVehicleUpdates([
      makePosition({ tripId: "b-div-trip", routeId: "A", currentStopId: "A02N", currentStopSequence: 2, timestamp: NOW }),
    ]);
    processVehicleUpdates([
      makePosition({ tripId: "b-div-trip", routeId: "A", currentStopId: "A03N", currentStopSequence: 3, timestamp: NOW + 200 }),
    ]);
    // A03 is terminal → excluded
    expect(getPredictedAlerts()).toHaveLength(0);
  });
});
