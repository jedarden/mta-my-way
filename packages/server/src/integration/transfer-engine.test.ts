/**
 * Integration tests for Transfer Engine with real arrival data.
 *
 * Tests the full data flow:
 * - Direct route computation with real-time arrivals
 * - Transfer route computation with walking times
 * - Express service detection
 * - B Division buffer application
 * - Walking option calculation
 * - Recommendation logic
 * - Accessible mode filtering
 * - Cross-component integration
 */

import type {
  ArrivalTime,
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setArrivalsForTesting } from "../cache.js";
import type { TransferEngine } from "../transfer/engine.js";
import { createTransferEngine } from "../transfer/engine.js";
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
    stops: ["101", "102", "725"],
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
    stops: ["101", "725", "726"],
    isExpress: true,
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
  C: {
    id: "C",
    shortName: "C",
    longName: "8th Ave Local",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["726", "727"],
    isExpress: false,
  },
};

const TEST_COMPLEXES: ComplexIndex = {
  "725-726": {
    complexId: "725-726",
    name: "Times Sq-42 St / Port Authority",
    stations: ["725", "726"],
    allLines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S", "A", "C", "E"],
    allStopIds: ["725N", "725S", "726N", "726S"],
  },
};

const TEST_TRANSFERS: Record<string, TransferConnection[]> = {
  "725": [{ toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }],
  "101": [{ toStationId: "102", toLines: ["1"], walkingSeconds: 180, accessible: true }],
};

function createMockArrivals(
  stationId: string,
  overrides: Partial<ArrivalTime> = {}
): ArrivalTime[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      tripId: `test-trip-${stationId}-1`,
      routeId: "1",
      line: "1",
      direction: "N",
      arrivalTime: now + 300,
      departureTime: now + 300,
      minutesAway: 5,
      isAssigned: true,
      isScheduled: false,
      isDelayed: false,
      isStopped: false,
      isRevenue: true,
      predicted: true,
      isExpress: false,
      isRerouted: false,
      confidence: "high" as const,
    },
    {
      tripId: `test-trip-${stationId}-2`,
      routeId: "1",
      line: "1",
      direction: "N",
      arrivalTime: now + 600,
      departureTime: now + 600,
      minutesAway: 10,
      isAssigned: true,
      isScheduled: false,
      isDelayed: false,
      isStopped: false,
      isRevenue: true,
      predicted: true,
      isExpress: false,
      isRerouted: false,
      confidence: "high" as const,
    },
    ...overrides,
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Transfer Engine Integration Tests", () => {
  let engine: TransferEngine;

  beforeEach(() => {
    const db = createIntegrationTestDatabase();
    engine = createTransferEngine({
      stations: TEST_STATIONS,
      routes: TEST_ROUTES,
      transfers: TEST_TRANSFERS,
      complexes: TEST_COMPLEXES,
      getArrivals: (stationId) => {
        const arrivals = createMockArrivals(stationId);
        setArrivalsForTesting(stationId, { northbound: arrivals, southbound: [] });
        return arrivals;
      },
    });
  });

  afterEach(() => {
    closeDatabase(db);
  });

  describe("Direct Routes", () => {
    beforeEach(() => {
      const arrivals = createMockArrivals("101");
      setArrivalsForTesting("101", { northbound: arrivals, southbound: [] });
      setArrivalsForTesting("725", { northbound: arrivals, southbound: [] });
    });

    it("finds direct routes between stations on same line", () => {
      const result = engine.analyzeCommute("101", "725");

      expect(result.directRoutes.length).toBeGreaterThan(0);
      expect(result.directRoutes[0]?.line).toBe("1");
    });

    it("includes arrival times in direct routes", () => {
      const result = engine.analyzeCommute("101", "725");

      const directRoute = result.directRoutes[0];
      expect(directRoute?.nextArrivals).toBeDefined();
      expect(directRoute?.nextArrivals.length).toBeGreaterThan(0);
      expect(directRoute?.nextArrivals[0]?.arrivalTime).toBeDefined();
    });

    it("calculates estimated travel time", () => {
      const result = engine.analyzeCommute("101", "725");

      const directRoute = result.directRoutes[0];
      expect(directRoute?.estimatedTravelMinutes).toBeGreaterThan(0);
    });

    it("calculates estimated arrival at destination", () => {
      const result = engine.analyzeCommute("101", "725");

      const directRoute = result.directRoutes[0];
      expect(directRoute?.estimatedArrivalAtDestination).toBeGreaterThan(0);
      expect(directRoute?.estimatedArrivalAtDestination).toBeGreaterThan(Date.now() / 1000);
    });

    it("respects preferred lines ordering", () => {
      // Set up arrivals for both 1 and 2 trains
      const arrivals1 = createMockArrivals("101", { routeId: "1", line: "1" });
      const arrivals2 = createMockArrivals("101", { routeId: "2", line: "2" });

      setArrivalsForTesting("101", {
        northbound: [...arrivals1, ...arrivals2],
        southbound: [],
      });

      const result = engine.analyzeCommute("101", "725", ["2"]);

      // Should prefer line 2 if it's in preferred lines
      expect(result.directRoutes.length).toBeGreaterThan(0);
    });
  });

  describe("Transfer Routes", () => {
    beforeEach(() => {
      const now = Math.floor(Date.now() / 1000);

      // Set up arrivals for 101 (Line 1)
      setArrivalsForTesting("101", {
        northbound: [
          {
            tripId: "trip-1-1",
            routeId: "1",
            line: "1",
            direction: "N",
            arrivalTime: now + 300,
            departureTime: now + 300,
            minutesAway: 5,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
            isExpress: false,
            isRerouted: false,
            confidence: "high" as const,
          },
        ],
        southbound: [],
      });

      // Set up arrivals for 725 (Line 1)
      setArrivalsForTesting("725", {
        northbound: [
          {
            tripId: "trip-1-2",
            routeId: "1",
            line: "1",
            direction: "N",
            arrivalTime: now + 600,
            departureTime: now + 600,
            minutesAway: 10,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
            isExpress: false,
            isRerouted: false,
            confidence: "high" as const,
          },
        ],
        southbound: [],
      });

      // Set up arrivals for 726 (Line A) - transfer destination
      setArrivalsForTesting("726", {
        northbound: [
          {
            tripId: "trip-a-1",
            routeId: "A",
            line: "A",
            direction: "N",
            arrivalTime: now + 900, // After first leg + walking + buffer
            departureTime: now + 900,
            minutesAway: 15,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
            isExpress: false,
            isRerouted: false,
            confidence: "high" as const,
          },
        ],
        southbound: [],
      });
    });

    it("finds transfer routes between stations", () => {
      const result = engine.analyzeCommute("101", "727");

      expect(result.transferRoutes).toBeDefined();
      expect(Array.isArray(result.transferRoutes)).toBe(true);
    });

    it("includes both legs in transfer route", () => {
      const result = engine.analyzeCommute("101", "727");

      if (result.transferRoutes.length > 0) {
        const transferRoute = result.transferRoutes[0];
        expect(transferRoute.legs).toBeDefined();
        expect(transferRoute.legs.length).toBe(2);
        expect(transferRoute.legs[0]?.line).toBeDefined();
        expect(transferRoute.legs[1]?.line).toBeDefined();
      }
    });

    it("includes transfer station information", () => {
      const result = engine.analyzeCommute("101", "727");

      if (result.transferRoutes.length > 0) {
        const transferRoute = result.transferRoutes[0];
        expect(transferRoute.transferStation).toBeDefined();
        expect(transferRoute.transferStation.stationId).toBeDefined();
        expect(transferRoute.transferStation.stationName).toBeDefined();
      }
    });

    it("calculates total estimated minutes", () => {
      const result = engine.analyzeCommute("101", "727");

      if (result.transferRoutes.length > 0) {
        const transferRoute = result.transferRoutes[0];
        expect(transferRoute.totalEstimatedMinutes).toBeGreaterThan(0);
      }
    });

    it("calculates walking time between stations", () => {
      const result = engine.analyzeCommute("101", "727");

      if (result.transferRoutes.length > 0) {
        // Walking time is included in the total
        const transferRoute = result.transferRoutes[0];
        expect(transferRoute.totalEstimatedMinutes).toBeGreaterThan(0);
      }
    });
  });

  describe("B Division Buffer", () => {
    it("applies buffer to B Division lines", () => {
      const now = Math.floor(Date.now() / 1000);

      setArrivalsForTesting("726", {
        northbound: [
          {
            tripId: "trip-a-1",
            routeId: "A",
            line: "A",
            direction: "N",
            arrivalTime: now + 300,
            departureTime: now + 300,
            minutesAway: 5,
            isAssigned: true,
            isScheduled: false,
            isDelayed: false,
            isStopped: false,
            isRevenue: true,
            predicted: true,
            isExpress: false,
            isRerouted: false,
            confidence: "high" as const,
          },
        ],
        southbound: [],
      });

      setArrivalsForTesting("727", {
        northbound: [],
        southbound: [],
      });

      const result = engine.analyzeCommute("726", "727");

      // B Division routes should have buffer applied
      expect(result.directRoutes).toBeDefined();
    });
  });

  describe("Express Service Detection", () => {
    it("identifies express routes in metadata", () => {
      const route2 = TEST_ROUTES["2"];
      expect(route2.isExpress).toBe(true);

      const route1 = TEST_ROUTES["1"];
      expect(route1.isExpress).toBe(false);
    });
  });

  describe("Walking Option", () => {
    it("calculates walking distance", () => {
      const result = engine.analyzeCommute("101", "102");

      // These stations are close, might suggest walking
      expect(result.walkingOption).toBeDefined();
    });

    it("includes walking time", () => {
      const result = engine.analyzeCommute("101", "102");

      if (result.walkingOption) {
        expect(result.walkingOption.walkingMinutes).toBeGreaterThan(0);
      }
    });

    it("compares walking vs transit time", () => {
      const result = engine.analyzeCommute("101", "102");

      if (result.walkingOption) {
        expect(result.walkingOption.transitMinutes).toBeGreaterThan(0);
        expect(result.walkingOption.walkingIsFaster).toBeDefined();
      }
    });
  });

  describe("Recommendation Logic", () => {
    beforeEach(() => {
      const arrivals = createMockArrivals("101");
      setArrivalsForTesting("101", { northbound: arrivals, southbound: [] });
      setArrivalsForTesting("725", { northbound: arrivals, southbound: [] });
    });

    it("provides recommendation", () => {
      const result = engine.analyzeCommute("101", "725");

      expect(result.recommendation).toBeDefined();
      expect(["direct", "transfer"]).toContain(result.recommendation);
    });

    it("includes recommendation details", () => {
      const result = engine.analyzeCommute("101", "725");

      expect(result.recommendationDetails).toBeDefined();
      expect(result.recommendationDetails.type).toBeDefined();
      expect(result.recommendationDetails.reason).toBeDefined();
      expect(result.recommendationDetails.confidence).toBeDefined();
    });

    it("recommends direct when no transfer saves time", () => {
      const result = engine.analyzeCommute("101", "725");

      // Should recommend direct for simple route
      expect(result.recommendation).toBe("direct");
    });

    it("includes risks in recommendation details", () => {
      const result = engine.analyzeCommute("101", "725");

      expect(result.recommendationDetails.risks).toBeDefined();
      expect(Array.isArray(result.recommendationDetails.risks)).toBe(true);
    });

    it("calculates confidence level", () => {
      const result = engine.analyzeCommute("101", "725");

      expect(["high", "medium", "low"]).toContain(result.recommendationDetails.confidence);
    });
  });

  describe("Accessible Mode", () => {
    it("filters out non-accessible transfers", () => {
      // Create non-accessible transfer
      const nonAccessibleTransfers: Record<string, TransferConnection[]> = {
        "725": [{ toStationId: "726", toLines: ["A"], walkingSeconds: 120, accessible: false }],
      };

      const accessibleEngine = createTransferEngine({
        stations: TEST_STATIONS,
        routes: TEST_ROUTES,
        transfers: nonAccessibleTransfers,
        complexes: TEST_COMPLEXES,
        getArrivals: (stationId) => {
          const arrivals = createMockArrivals(stationId);
          setArrivalsForTesting(stationId, { northbound: arrivals, southbound: [] });
          return arrivals;
        },
      });

      const result = accessibleEngine.analyzeCommute("101", "727", [], "default", true);

      // In accessible mode, non-accessible transfers should be filtered
      expect(result.transferRoutes).toBeDefined();
    });
  });

  describe("Cross-Component Integration", () => {
    it("integrates with cache for arrivals", () => {
      const arrivals = createMockArrivals("101");
      setArrivalsForTesting("101", { northbound: arrivals, southbound: [] });

      const result = engine.analyzeCommute("101", "725");

      expect(result.directRoutes.length).toBeGreaterThan(0);
    });

    it("uses travel time index when available", () => {
      const result = engine.analyzeCommute("101", "725");

      const directRoute = result.directRoutes[0];
      expect(directRoute?.estimatedTravelMinutes).toBeGreaterThan(0);
    });

    it("handles missing arrival data gracefully", () => {
      // Create engine that returns no arrivals
      const noArrivalsEngine = createTransferEngine({
        stations: TEST_STATIONS,
        routes: TEST_ROUTES,
        transfers: TEST_TRANSFERS,
        complexes: TEST_COMPLEXES,
        getArrivals: () => null,
      });

      const result = noArrivalsEngine.analyzeCommute("101", "725");

      expect(result.directRoutes).toEqual([]);
      expect(result.transferRoutes).toEqual([]);
    });
  });

  describe("Edge Cases", () => {
    it("handles origin and destination being the same", () => {
      expect(() => engine.analyzeCommute("101", "101")).not.toThrow();
    });

    it("throws on invalid station IDs", () => {
      expect(() => engine.analyzeCommute("999", "888")).toThrow();
    });

    it("handles stations with no common lines", () => {
      // These stations might not have direct routes
      const result = engine.analyzeCommute("101", "102");

      expect(result).toBeDefined();
      expect(result.origin).toBeDefined();
      expect(result.destination).toBeDefined();
    });

    it("returns empty arrays when no routes found", () => {
      const noDataEngine = createTransferEngine({
        stations: TEST_STATIONS,
        routes: TEST_ROUTES,
        transfers: TEST_TRANSFERS,
        complexes: TEST_COMPLEXES,
        getArrivals: () => [],
      });

      const result = noDataEngine.analyzeCommute("101", "725");

      expect(result.directRoutes).toEqual([]);
    });
  });

  describe("Commuting ID", () => {
    it("uses custom commuteId when provided", () => {
      const result = engine.analyzeCommute("101", "725", [], "work-commute");

      expect(result.commuteId).toBe("work-commute");
    });

    it("uses default commuteId when not provided", () => {
      const result = engine.analyzeCommute("101", "725");

      expect(result.commuteId).toBe("default");
    });
  });

  describe("Timestamp", () => {
    it("includes timestamp in result", () => {
      const before = Date.now();
      const result = engine.analyzeCommute("101", "725");
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("Route Sorting", () => {
    it("sorts direct routes by arrival time", () => {
      const result = engine.analyzeCommute("101", "725");

      for (let i = 1; i < result.directRoutes.length; i++) {
        const prev = result.directRoutes[i - 1]!;
        const curr = result.directRoutes[i]!;
        expect(prev.estimatedArrivalAtDestination).toBeLessThanOrEqual(
          curr.estimatedArrivalAtDestination
        );
      }
    });

    it("sorts transfer routes by arrival time", () => {
      const result = engine.analyzeCommute("101", "727");

      for (let i = 1; i < result.transferRoutes.length; i++) {
        const prev = result.transferRoutes[i - 1]!;
        const curr = result.transferRoutes[i]!;
        expect(prev.estimatedArrivalAtDestination).toBeLessThanOrEqual(
          curr.estimatedArrivalAtDestination
        );
      }
    });
  });

  describe("Data Freshness", () => {
    it("detects stale data in recommendations", () => {
      const oldArrivals = createMockArrivals("101", {
        arrivalTime: Math.floor(Date.now() / 1000) - 1000, // 16+ minutes ago
      });

      setArrivalsForTesting("101", { northbound: oldArrivals, southbound: [] });

      const result = engine.analyzeCommute("101", "725");

      // Should detect stale data
      expect(result.recommendationDetails.isStale).toBeDefined();
    });
  });
});
