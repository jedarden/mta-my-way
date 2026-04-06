import type { ArrivalTime, ComplexIndex, RouteIndex, StationIndex } from "@mta-my-way/shared";
import { describe, expect, it } from "vitest";
import { TransferEngine, detectExpressService } from "./engine.js";

// ─── detectExpressService ──────────────────────────────────────────────────

describe("detectExpressService", () => {
  const routeStops = ["A", "B", "C", "D", "E", "F"];

  it("returns isExpress=false when all stops are present", () => {
    const result = detectExpressService(routeStops, routeStops, "A", "F");
    expect(result.isExpress).toBe(false);
    expect(result.skippedStops).toEqual([]);
  });

  it("returns isExpress=true when 2+ stops are skipped", () => {
    const tripStops = ["A", "D", "F"]; // skips B, C, E
    const result = detectExpressService(tripStops, routeStops, "A", "F");
    expect(result.isExpress).toBe(true);
    expect(result.skippedStops).toContain("B");
    expect(result.skippedStops).toContain("C");
  });

  it("returns isExpress=false when only 1 stop is skipped", () => {
    const tripStops = ["A", "B", "D", "E", "F"]; // skips C
    const result = detectExpressService(tripStops, routeStops, "A", "F");
    expect(result.isExpress).toBe(false);
    expect(result.skippedStops).toEqual(["C"]);
  });

  it("returns isExpress=false when origin not in route", () => {
    const result = detectExpressService(routeStops, routeStops, "X", "F");
    expect(result.isExpress).toBe(false);
    expect(result.skippedStops).toEqual([]);
  });

  it("returns isExpress=false when destination not in route", () => {
    const result = detectExpressService(routeStops, routeStops, "A", "Z");
    expect(result.isExpress).toBe(false);
    expect(result.skippedStops).toEqual([]);
  });

  it("only considers the origin-to-destination segment", () => {
    // C to E: D is skipped — but that is only 1 skipped stop
    const tripStops = ["C", "E"];
    const result = detectExpressService(tripStops, routeStops, "C", "E");
    expect(result.skippedStops).toEqual(["D"]);
    expect(result.isExpress).toBe(false);
  });
});

// ─── TransferEngine ────────────────────────────────────────────────────────

// Minimal test fixtures modelling a simple two-line system:
//   Line "1" (IRT/A Division): 101 → 102 → 103
//   Line "A" (IND/B Division): 201 → 102 → 203   (shares stop 102 with line 1)
//
// Station 102 is served by both lines — the natural transfer point.

const now = Math.floor(Date.now() / 1000);

const STATIONS: StationIndex = {
  "101": {
    id: "101",
    name: "First Ave",
    lines: ["1"],
    lat: 40.7,
    lon: -74.0,
    borough: "manhattan",
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
  },
  "102": {
    id: "102",
    name: "Transfer Sq",
    lines: ["1", "A"],
    lat: 40.71,
    lon: -74.01,
    borough: "manhattan",
    northStopId: "102N",
    southStopId: "102S",
    transfers: [],
    ada: true,
  },
  "103": {
    id: "103",
    name: "Third Ave",
    lines: ["1"],
    lat: 40.72,
    lon: -74.02,
    borough: "manhattan",
    northStopId: "103N",
    southStopId: "103S",
    transfers: [],
    ada: false,
  },
  "201": {
    id: "201",
    name: "Alpha St",
    lines: ["A"],
    lat: 40.69,
    lon: -73.99,
    borough: "manhattan",
    northStopId: "201N",
    southStopId: "201S",
    transfers: [],
    ada: false,
  },
  "203": {
    id: "203",
    name: "Gamma St",
    lines: ["A"],
    lat: 40.73,
    lon: -74.03,
    borough: "manhattan",
    northStopId: "203N",
    southStopId: "203S",
    transfers: [],
    ada: false,
  },
};

const ROUTES: RouteIndex = {
  "1": {
    id: "1",
    shortName: "1",
    longName: "1 Train",
    color: "EE352E",
    textColor: "FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102", "103"],
  },
  A: {
    id: "A",
    shortName: "A",
    longName: "A Train",
    color: "0039A6",
    textColor: "FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["201", "102", "203"],
  },
};

// Put 101 and 102 in the same complex so the graph adds a walking edge between them.
// This lets the engine find the 101→102 transfer point when routing 101→203.
const COMPLEXES: ComplexIndex = {
  c1: {
    complexId: "c1",
    name: "Downtown Complex",
    stations: ["101", "102"],
    allLines: ["1", "A"],
    allStopIds: ["101N", "101S", "102N", "102S"],
  },
};

function makeArrival(line: string, offsetSecs = 120): ArrivalTime {
  return {
    tripId: `trip-${line}-${offsetSecs}`,
    line,
    destination: "Test Terminal",
    direction: "S",
    arrivalTime: now + offsetSecs,
    minutesAway: offsetSecs / 60,
    confidence: "high",
    isAssigned: true,
    isRerouted: false,
    isExpress: false,
    feedName: "gtfs",
    feedAge: 5,
  };
}

function makeEngine(arrivalsMap: Record<string, ArrivalTime[]>): TransferEngine {
  return new TransferEngine({
    stations: STATIONS,
    routes: ROUTES,
    transfers: {},
    complexes: COMPLEXES,
    getArrivals: (id) => arrivalsMap[id] ?? null,
  });
}

describe("TransferEngine.analyzeCommute", () => {
  it("returns a direct route when origin and destination share a line", () => {
    const engine = makeEngine({ "101": [makeArrival("1", 120)] });
    const analysis = engine.analyzeCommute("101", "103");
    expect(analysis.directRoutes.length).toBeGreaterThan(0);
    expect(analysis.directRoutes[0]?.line).toBe("1");
  });

  it("populates commuteId and origin/destination refs", () => {
    const engine = makeEngine({ "101": [makeArrival("1")] });
    const analysis = engine.analyzeCommute("101", "103", [], "my-commute");
    expect(analysis.commuteId).toBe("my-commute");
    expect(analysis.origin.stationId).toBe("101");
    expect(analysis.destination.stationId).toBe("103");
  });

  it("returns empty routes when no arrivals are available", () => {
    const engine = makeEngine({});
    const analysis = engine.analyzeCommute("101", "103");
    expect(analysis.directRoutes).toEqual([]);
    expect(analysis.transferRoutes).toEqual([]);
  });

  it("throws when origin station ID is invalid", () => {
    const engine = makeEngine({});
    expect(() => engine.analyzeCommute("UNKNOWN", "103")).toThrow();
  });

  it("throws when destination station ID is invalid", () => {
    const engine = makeEngine({});
    expect(() => engine.analyzeCommute("101", "UNKNOWN")).toThrow();
  });

  it("sets recommendation to direct when only direct routes exist", () => {
    const engine = makeEngine({ "101": [makeArrival("1")] });
    const analysis = engine.analyzeCommute("101", "103");
    expect(analysis.recommendation).toBe("direct");
    expect(analysis.recommendationDetails.type).toBe("direct");
    expect(analysis.recommendationDetails.confidence).toBeDefined();
    expect(analysis.recommendationDetails.reason).toBeDefined();
    expect(analysis.recommendationDetails.risks).toBeDefined();
    expect(analysis.recommendationDetails.timeSavedMinutes).toBe(0);
  });

  it("sorts direct routes by estimated arrival time (earliest first)", () => {
    const engine = makeEngine({
      "101": [makeArrival("1", 60), makeArrival("1", 300)],
    });
    const analysis = engine.analyzeCommute("101", "103");
    const times = analysis.directRoutes.map((r) => r.estimatedArrivalAtDestination);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]!);
    }
  });

  it("returns a transfer route when stations connect via shared stop", () => {
    // Origin: 101 (line 1), Destination: 203 (line A only)
    // Transfer at 102 (serves both 1 and A)
    const engine = makeEngine({
      "101": [makeArrival("1", 60)],
      "102": [makeArrival("A", 300)],
    });
    const analysis = engine.analyzeCommute("101", "203");
    // No direct route: 101 is line 1 only, 203 is line A only
    expect(analysis.directRoutes).toHaveLength(0);
    expect(analysis.transferRoutes.length).toBeGreaterThan(0);
    expect(analysis.recommendation).toBe("transfer");
    expect(analysis.recommendationDetails.type).toBe("transfer");
  });

  it("transfer route has two legs with correct lines", () => {
    const engine = makeEngine({
      "101": [makeArrival("1", 60)],
      "102": [makeArrival("A", 300)],
    });
    const analysis = engine.analyzeCommute("101", "203");
    const route = analysis.transferRoutes[0];
    expect(route?.legs).toHaveLength(2);
    expect(route?.legs[0]?.line).toBe("1");
    expect(route?.legs[1]?.line).toBe("A");
  });

  it("transfer route identifies the transfer station", () => {
    const engine = makeEngine({
      "101": [makeArrival("1", 60)],
      "102": [makeArrival("A", 300)],
    });
    const analysis = engine.analyzeCommute("101", "203");
    const route = analysis.transferRoutes[0];
    expect(route?.transferStation.stationId).toBe("102");
  });

  it("applies B Division buffer: A train arrival is shifted forward", () => {
    const bArrivalTime = now + 120;
    const bArrivals: ArrivalTime[] = [
      {
        tripId: "trip-A",
        line: "A",
        destination: "Terminal",
        direction: "S",
        arrivalTime: bArrivalTime,
        minutesAway: 2,
        confidence: "medium",
        isAssigned: true,
        isRerouted: false,
        isExpress: false,
        feedName: "gtfs-ace",
        feedAge: 5,
      },
    ];

    const engineWithAOnly = new TransferEngine({
      stations: {
        "201": STATIONS["201"]!,
        "203": STATIONS["203"]!,
      },
      routes: { A: ROUTES["A"]! },
      transfers: {},
      complexes: {},
      getArrivals: (id) => (id === "201" ? bArrivals : null),
    });

    const analysis = engineWithAOnly.analyzeCommute("201", "203");
    if (analysis.directRoutes.length > 0) {
      const route = analysis.directRoutes[0]!;
      const firstArrival = route.nextArrivals[0];
      // B Division buffer is +120s
      expect(firstArrival?.arrivalTime).toBeGreaterThan(bArrivalTime);
    }
  });

  it("includes a timestamp in the analysis result", () => {
    const engine = makeEngine({ "101": [makeArrival("1")] });
    const analysis = engine.analyzeCommute("101", "103");
    expect(analysis.timestamp).toBeGreaterThan(0);
  });

  it("includes recommendation details with confidence level", () => {
    const engine = makeEngine({ "101": [makeArrival("1")] });
    const analysis = engine.analyzeCommute("101", "103");
    expect(analysis.recommendationDetails).toBeDefined();
    expect(analysis.recommendationDetails.confidence).toMatch(/^(high|medium|low)$/);
  });

  it("includes recommendation details with reason", () => {
    const engine = makeEngine({ "101": [makeArrival("1")] });
    const analysis = engine.analyzeCommute("101", "103");
    expect(analysis.recommendationDetails.reason).toBeDefined();
    expect(typeof analysis.recommendationDetails.reason).toBe("string");
    expect(analysis.recommendationDetails.reason.length).toBeGreaterThan(0);
  });

  it("includes recommendation details with risks array", () => {
    const engine = makeEngine({ "101": [makeArrival("1")] });
    const analysis = engine.analyzeCommute("101", "103");
    expect(analysis.recommendationDetails.risks).toBeDefined();
    expect(Array.isArray(analysis.recommendationDetails.risks)).toBe(true);
  });

  it("transfer recommendation includes B Division risk for B Division lines", () => {
    // Create a transfer scenario with A train (B Division)
    const engine = makeEngine({
      "101": [makeArrival("1", 60)],
      "102": [makeArrival("A", 300)],
    });
    const analysis = engine.analyzeCommute("101", "203");
    if (analysis.recommendationDetails.type === "transfer") {
      const hasBDivisionRisk = analysis.recommendationDetails.risks.some((risk) =>
        risk.includes("B Division")
      );
      expect(hasBDivisionRisk).toBe(true);
    }
  });

  it("recommendation details includes time saved for transfer routes", () => {
    const engine = makeEngine({
      "101": [makeArrival("1", 60)],
      "102": [makeArrival("A", 300)],
    });
    const analysis = engine.analyzeCommute("101", "203");
    if (analysis.recommendation === "transfer" && analysis.transferRoutes.length > 0) {
      expect(analysis.recommendationDetails.timeSavedMinutes).toBeGreaterThanOrEqual(0);
    }
  });

  it("recommendation details includes isStale flag", () => {
    const engine = makeEngine({ "101": [makeArrival("1")] });
    const analysis = engine.analyzeCommute("101", "103");
    expect(analysis.recommendationDetails.isStale).toBeDefined();
    expect(typeof analysis.recommendationDetails.isStale).toBe("boolean");
  });

  it("direct recommendation includes reason when transfer is slower", () => {
    const engine = makeEngine({
      "101": [makeArrival("1", 30)],
      "103": [makeArrival("1", 300)],
    });
    const analysis = engine.analyzeCommute("101", "103");
    // Direct route should be recommended
    if (analysis.recommendation === "direct") {
      expect(analysis.recommendationDetails.type).toBe("direct");
      expect(analysis.recommendationDetails.reason).toContain("Direct");
    }
  });
});
