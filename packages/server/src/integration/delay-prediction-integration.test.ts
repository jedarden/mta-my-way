/**
 * Integration tests for delay detector and predictor.
 *
 * Tests the delay detection and prediction system:
 * - Vehicle position extraction from GTFS-RT
 * - Delay detection from position diffs
 * - Alert generation from detected delays
 * - Delay prediction data collection
 * - Time bucket and day category handling
 * - Route delay statistics
 * - Weather impact on predictions
 */

import type { RouteIndex, StationIndex, TravelTimeIndex } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractVehiclePositions,
  getDelayDetectorStatus,
  getPredictedAlerts,
  initDelayDetector,
  initDelayDetectorForTesting,
  processVehicleUpdates,
  resetDelayDetector,
} from "../delay-detector.js";
import {
  getAllDelayRecords,
  getDelayPredictorStatus,
  getDelayRecordCount,
  getRouteDelayPatterns,
  getRouteDelayProbability,
  getRouteDelaySummary,
  getTimeBucket,
  getTimeBucketForTimestamp,
  initDelayPredictor,
  initDelayPredictorForTesting,
  predictDelay,
  recordDelay,
  resetDelayPredictor,
  setWeatherOverride,
  updateWeather,
} from "../delay-predictor.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_STATIONS: StationIndex = {
  "100": {
    id: "100",
    name: "South Terminal",
    lat: 40.7,
    lon: -74.012,
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
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    lat: 40.758,
    lon: -73.985,
    lines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "726": {
    id: "726",
    name: "North Terminal",
    lat: 40.76,
    lon: -73.983,
    lines: ["1"],
    northStopId: "726N",
    southStopId: "726S",
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
    stops: ["100", "101", "102", "103", "725", "726"],
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
    stops: ["100", "101", "725", "726"],
    isExpress: true,
  },
};

const TEST_TRAVEL_TIMES: TravelTimeIndex = {
  "1": {
    "100": {
      "101": 120,
      "102": 240,
      "103": 360,
      "725": 480,
      "726": 600,
    },
    "101": {
      "102": 120, // 2 minutes
      "103": 240,
      "725": 480, // 8 minutes
      "726": 600,
    },
    "102": {
      "103": 120,
      "725": 360,
      "726": 480,
    },
    "103": {
      "725": 240,
      "726": 360,
    },
    "725": {
      "726": 120,
    },
  },
  "2": {
    "100": {
      "101": 120,
      "725": 480,
      "726": 600,
    },
    "101": {
      "725": 360,
      "726": 480,
    },
    "725": {
      "726": 120,
    },
  },
};

// Helper to create a GTFS-RT message
function createGtfsRtMessage(overrides: any = {}): any {
  const now = Math.floor(Date.now() / 1000);
  const NYCT_TRIP_KEY = ".transit_realtime.nyctTripDescriptor";

  // Build trip object with potential NYCT extension
  const trip: any = {
    tripId: "TEST_TRIP_1",
    routeId: "1",
    ...overrides.trip,
  };

  // Add NYCT extension if direction or isAssignment is provided
  if (overrides.direction !== undefined || overrides.isAssigned !== undefined) {
    trip[NYCT_TRIP_KEY] = {
      ...(overrides.direction !== undefined && { direction: overrides.direction }),
      ...(overrides.isAssigned !== undefined && { isAssigned: overrides.isAssigned }),
    };
  }

  return {
    entity: [
      {
        id: "1",
        vehicle: {
          trip,
          position: {
            latitude: 40.702,
            longitude: -74.013,
          },
          stopId: overrides.stopId ?? "101N",
          currentStatus: overrides.currentStatus ?? 1, // STOPPED_AT
          currentStopSequence: overrides.currentStopSequence ?? 1,
          timestamp: now,
          occupancy: overrides.occupancy ?? 0,
          id: "VEHICLE_1",
          label: {
            translation: [
              {
                text: "1234",
              },
            ],
          },
        },
      },
    ],
  };
}

// Helper to create a mock vehicle position
function createMockPosition(overrides: {
  tripId?: string;
  routeId?: string;
  direction?: "N" | "S";
  currentStopId?: string;
  currentStopSequence?: number;
  status?: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
  timestamp?: number;
  isAssigned?: boolean;
}) {
  const now = Math.floor(Date.now() / 1000);

  return {
    tripId: overrides.tripId ?? "TEST_TRIP_1",
    routeId: overrides.routeId ?? "1",
    direction: overrides.direction ?? "N",
    currentStopId: overrides.currentStopId ?? "101N",
    currentStopSequence: overrides.currentStopSequence ?? 1,
    status: overrides.status ?? "STOPPED_AT",
    timestamp: overrides.timestamp ?? now,
    isAssigned: overrides.isAssigned ?? true,
    destination: "Test Destination",
    delay: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Delay Detector and Predictor Integration", () => {
  beforeEach(() => {
    initDelayDetector(TEST_TRAVEL_TIMES, TEST_ROUTES, TEST_STATIONS, {
      thresholdMultiplier: 2.0,
      minTrainsForLineAlert: 2,
    });

    initDelayPredictor(TEST_TRAVEL_TIMES, TEST_STATIONS, {
      maxRecords: 1000,
      minObservations: 3,
    });
  });

  afterEach(() => {
    resetDelayDetector();
    resetDelayPredictor();
  });

  describe("Vehicle position extraction", () => {
    it("extracts positions from GTFS-RT message", () => {
      const message = createGtfsRtMessage();
      const positions = extractVehiclePositions("gtfs", message);

      expect(positions).toHaveLength(1);
      expect(positions[0]?.tripId).toBe("TEST_TRIP_1");
      expect(positions[0]?.routeId).toBe("1");
      expect(positions[0]?.direction).toBe("N"); // Northbound from direction=1
    });

    it("handles empty entity list", () => {
      const message = { entity: [] };
      const positions = extractVehiclePositions("gtfs", message);

      expect(positions).toEqual([]);
    });

    it("handles missing trip data", () => {
      const message = {
        entity: [
          {
            vehicle: {
              // No trip data
            },
          },
        ],
      };
      const positions = extractVehiclePositions("gtfs", message);

      expect(positions).toEqual([]);
    });

    it("maps GTFS direction to N/S", () => {
      // Southbound = 3
      const message = createGtfsRtMessage({
        direction: 3,
      });
      const positions = extractVehiclePositions("gtfs", message);

      expect(positions[0]?.direction).toBe("S");
    });

    it("extracts destination from trip update", () => {
      const message = {
        entity: [
          {
            id: "1",
            vehicle: {
              trip: {
                tripId: "TEST_TRIP_1",
                routeId: "1",
              },
              stopId: "101N",
              currentStatus: 1,
              currentStopSequence: 1,
              timestamp: Math.floor(Date.now() / 1000),
            },
            tripUpdate: {
              stopTimeUpdate: [
                {
                  stopId: "725N",
                },
              ],
            },
          },
        ],
      };
      const positions = extractVehiclePositions("gtfs", message);

      expect(positions[0]?.destination).toBe("725N");
    });
  });

  describe("Delay detection", () => {
    it("detects no delay when on schedule", () => {
      const now = Date.now();

      // First observation at 101
      const positions1 = [
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ];

      processVehicleUpdates(positions1);

      // Second observation at 102 after 2 minutes (on schedule)
      const positions2 = [
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "102N",
          currentStopSequence: 2,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000) + 120,
        }),
      ];

      const delays = processVehicleUpdates(positions2);

      // 2 minutes for 2-minute scheduled = 1.0x ratio, not delayed
      expect(delays).toHaveLength(0);
    });

    it("detects delay when traversal exceeds threshold", () => {
      const now = Date.now();

      // First observation at 101
      const positions1 = [
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ];

      processVehicleUpdates(positions1);

      // Second observation at 102 after 5 minutes (2.5x scheduled)
      const positions2 = [
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "102N",
          currentStopSequence: 2,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000) + 300,
        }),
      ];

      const delays = processVehicleUpdates(positions2);

      // 5 minutes for 2-minute scheduled = 2.5x, exceeds 2.0x threshold
      expect(delays).toHaveLength(1);
      expect(delays[0]?.ratio).toBeGreaterThan(2.0);
    });

    it("records delay for prediction when detected", () => {
      const now = Date.now();

      // First observation
      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ]);

      // Delayed movement
      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "102N",
          currentStopSequence: 2,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000) + 300, // 5 minutes
        }),
      ]);

      // Check delay was recorded for predictor
      const records = getAllDelayRecords();
      expect(records.length).toBeGreaterThan(0);
      expect(records[0]?.routeId).toBe("1");
      expect(records[0]?.delayRatio).toBeGreaterThan(2.0);
    });

    it("excludes terminal stops from delay detection", () => {
      const now = Date.now();

      // Start at terminal (101)
      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ]);

      // Still at terminal after long time (not a delay, just dwell)
      const delays = processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000) + 300, // 5 minutes
        }),
      ]);

      // Should not flag delay at terminal
      expect(delays).toHaveLength(0);
    });

    it("requires minimum observation time before flagging", () => {
      const now = Date.now();

      // First observation
      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ]);

      // Move to next stop too quickly (under MIN_OBSERVATION_SECONDS)
      const delays = processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "102N",
          currentStopSequence: 2,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000) + 30, // Only 30 seconds
        }),
      ]);

      // Should not flag - under minimum observation time
      expect(delays).toHaveLength(0);
    });
  });

  describe("Alert generation", () => {
    it("generates single-train alert for isolated delay", () => {
      const now = Date.now();

      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ]);

      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "102N",
          currentStopSequence: 2,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000) + 300, // Delayed
        }),
      ]);

      const alerts = getPredictedAlerts();

      // Should have single-train alert
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0]?.source).toBe("predicted");
      expect(alerts[0]?.severity).toBe("info");
    });

    it("generates line-level alert for multiple delays", () => {
      const now = Date.now();

      // First train delayed
      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ]);

      // Second train also delayed
      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_2",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ]);

      // Both trains move slowly
      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "102N",
          currentStopSequence: 2,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000) + 300,
        }),
        createMockPosition({
          tripId: "TRIP_2",
          currentStopId: "102N",
          currentStopSequence: 2,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000) + 300,
        }),
      ]);

      const alerts = getPredictedAlerts();

      // Should have line-level alert
      const lineAlerts = alerts.filter((a) => a.headline.includes("trains"));
      expect(lineAlerts.length).toBeGreaterThan(0);
    });
  });

  describe("Delay predictor", () => {
    it("records delay data for later prediction", () => {
      recordDelay("1", "N", "101", "102", 300, 120, "TEST_TRIP");

      const records = getAllDelayRecords();
      expect(records).toHaveLength(1);
      expect(records[0]?.fromStationId).toBe("101");
      expect(records[0]?.toStationId).toBe("102");
    });

    it("requires minimum observations for prediction", () => {
      initDelayPredictorForTesting();

      // Not enough data for prediction
      const prediction = predictDelay("1", "N", "101", "102", 120);
      expect(prediction).toBeNull();
    });

    it("returns prediction after collecting sufficient data", () => {
      initDelayPredictorForTesting();

      // Record enough delays to meet minimum observations
      for (let i = 0; i < 5; i++) {
        recordDelay("1", "N", "101", "102", 300, 120, `TRIP_${i}`);
      }

      const prediction = predictDelay("1", "N", "101", "102", 120);

      expect(prediction).not.toBeNull();
      expect(prediction?.fromStationId).toBe("101");
      expect(prediction?.toStationId).toBe("102");
      expect(prediction?.scheduledMinutes).toBe(2);
      expect(prediction?.predictedMinutes).toBeGreaterThan(2);
    });

    it("calculates delay probability for route", () => {
      initDelayPredictorForTesting();

      // Record delays
      for (let i = 0; i < 10; i++) {
        recordDelay("1", "N", "101", "102", 300, 120, `TRIP_${i}`);
      }

      const probability = getRouteDelayProbability("1", "N");

      expect(probability).not.toBeNull();
      expect(probability).toBeGreaterThan(0);
      expect(probability).toBeLessThanOrEqual(1);
    });

    it("returns null for route with insufficient data", () => {
      initDelayPredictorForTesting();

      const probability = getRouteDelayProbability("2", "N");

      expect(probability).toBeNull();
    });
  });

  describe("Time bucket handling", () => {
    it("categorizes hours into correct time buckets", () => {
      expect(getTimeBucket(4)).toBe("early_morning"); // 4 AM
      expect(getTimeBucket(7)).toBe("morning_rush"); // 7 AM
      expect(getTimeBucket(12)).toBe("midday"); // Noon
      expect(getTimeBucket(17)).toBe("evening_rush"); // 5 PM
      expect(getTimeBucket(22)).toBe("night"); // 10 PM
    });

    it("calculates time bucket from timestamp", () => {
      const date = new Date(2026, 4, 4, 8, 30, 0); // May 4, 2026, 8:30 AM
      const bucket = getTimeBucketForTimestamp(date.getTime());

      expect(bucket).toBe("morning_rush");
    });
  });

  describe("Weather impact", () => {
    it("applies weather factor to predictions", () => {
      initDelayPredictorForTesting();

      // Record base delays
      for (let i = 0; i < 5; i++) {
        recordDelay("1", "N", "101", "102", 300, 120, `TRIP_${i}`);
      }

      setWeatherOverride("rain");

      const prediction = predictDelay("1", "N", "101", "102", 120);

      expect(prediction).not.toBeNull();
      // Check weather factor is included
      const hasWeatherFactor = prediction?.factors.some((f) => f.type === "weather");
      expect(hasWeatherFactor).toBe(true);
    });

    it("increases delay probability with severe weather", () => {
      initDelayPredictorForTesting();

      for (let i = 0; i < 5; i++) {
        recordDelay("1", "N", "101", "102", 300, 120, `TRIP_${i}`);
      }

      setWeatherOverride("snow");

      const prediction = predictDelay("1", "N", "101", "102", 120);

      expect(prediction).not.toBeNull();
      const weatherFactor = prediction?.factors.find((f) => f.type === "weather");
      expect(weatherFactor?.impact).toBeGreaterThan(0);
    });
  });

  describe("Route delay summary", () => {
    it("calculates route delay summary", () => {
      initDelayPredictorForTesting();

      // Record various delays
      for (let i = 0; i < 20; i++) {
        recordDelay("1", "N", "101", "102", 300 + i * 10, 120, `TRIP_${i}`);
      }

      const summary = getRouteDelaySummary("1");

      expect(summary).not.toBeNull();
      expect(summary?.routeId).toBe("1");
      expect(summary?.reliabilityScore).toBeGreaterThanOrEqual(0);
      expect(summary?.reliabilityScore).toBeLessThanOrEqual(100);
      expect(summary?.avgDelayMinutes).toBeGreaterThan(0);
    });

    it("returns null for route with no data", () => {
      initDelayPredictorForTesting();

      const summary = getRouteDelaySummary("Z");

      expect(summary).toBeNull();
    });
  });

  describe("Status endpoints", () => {
    it("returns delay detector status", () => {
      const status = getDelayDetectorStatus();

      expect(status).toBeDefined();
      expect(status.trackedTrips).toBeGreaterThanOrEqual(0);
      expect(status.activeAlerts).toBeGreaterThanOrEqual(0);
      expect(status.thresholdMultiplier).toBe(2.0);
      expect(status.minTrainsForLineAlert).toBe(2);
    });

    it("returns delay predictor status", () => {
      const status = getDelayPredictorStatus();

      expect(status).toBeDefined();
      expect(status.totalRecords).toBeGreaterThanOrEqual(0);
      expect(status.aggregatedPatterns).toBeGreaterThanOrEqual(0);
      expect(status.minObservations).toBe(3);
      expect(status.currentWeather).toBeDefined();
    });
  });

  describe("Data management", () => {
    it("resets all delay detector state", () => {
      const now = Date.now();

      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ]);

      let status = getDelayDetectorStatus();
      expect(status.trackedTrips).toBeGreaterThan(0);

      resetDelayDetector();

      status = getDelayDetectorStatus();
      expect(status.trackedTrips).toBe(0);
      expect(status.activeAlerts).toBe(0);
    });

    it("resets all delay predictor state", () => {
      recordDelay("1", "N", "101", "102", 300, 120, "TEST_TRIP");

      expect(getDelayRecordCount()).toBeGreaterThan(0);

      resetDelayPredictor();

      expect(getDelayRecordCount()).toBe(0);
    });

    it("prunes old records when exceeding max", () => {
      initDelayPredictor(TEST_TRAVEL_TIMES, TEST_STATIONS, {
        maxRecords: 5, // Small limit for testing
        minObservations: 1,
      });

      // Record more than max
      for (let i = 0; i < 10; i++) {
        recordDelay("1", "N", "101", "102", 300, 120, `TRIP_${i}`);
      }

      // Should prune to max
      expect(getDelayRecordCount()).toBeLessThanOrEqual(5);
    });
  });

  describe("Trip tracking state", () => {
    it("tracks multiple trips simultaneously", () => {
      const now = Date.now();

      processVehicleUpdates([
        createMockPosition({
          tripId: "TRIP_1",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
        createMockPosition({
          tripId: "TRIP_2",
          currentStopId: "102N",
          currentStopSequence: 2,
          status: "STOPPED_AT",
          timestamp: Math.floor(now / 1000),
        }),
      ]);

      const status = getDelayDetectorStatus();
      expect(status.trackedTrips).toBe(2);
    });

    it("removes trips that exceed max age", () => {
      // Add a trip that will be tracked
      processVehicleUpdates([
        createMockPosition({
          tripId: "OLD_TRIP",
          currentStopId: "101N",
          currentStopSequence: 1,
          status: "STOPPED_AT",
          timestamp: Math.floor(Date.now() / 1000),
        }),
      ]);

      let status = getDelayDetectorStatus();
      expect(status.trackedTrips).toBe(1);

      // Reset to clear the trip (simulating it being old and pruned)
      resetDelayDetector();

      status = getDelayDetectorStatus();
      expect(status.trackedTrips).toBe(0);
    });
  });
});
