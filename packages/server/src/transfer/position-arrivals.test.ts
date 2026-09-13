import type {
  ArrivalTime,
  ComplexIndex,
  LinePositions,
  RouteIndex,
  StationArrivals,
  StationIndex,
  TrainPosition,
} from "@mta-my-way/shared";
import { describe, expect, it } from "vitest";
import { TransferEngine } from "./engine.js";
import { createPositionAdjustedReader } from "./position-arrivals.js";

// ─── Fixtures ──────────────────────────────────────────────────────────────

// Three lines, so that a direct itinerary competes with a faster two-leg one:
//   Line "1": 101 → 103   (direct — but its only train is a long way out)
//   Line "2": 101 → 102   (fast first leg)
//   Line "A": 102 → 103   (fast second leg, boarded at 102)
//
// The cache says the transfer is quickest. The vehicle-position stream is what
// knows whether that is still true.

const nowSecs = 1_700_000_000;

const STATIONS: StationIndex = {
  "101": {
    id: "101",
    name: "Origin",
    lines: ["1", "2"],
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
    name: "Hub",
    lines: ["2", "A"],
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
    name: "Destination",
    lines: ["1", "A"],
    lat: 40.72,
    lon: -74.02,
    borough: "manhattan",
    northStopId: "103N",
    southStopId: "103S",
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
    stops: ["101", "103"],
    isExpress: false,
  },
  "2": {
    id: "2",
    shortName: "2",
    longName: "2 Train",
    color: "FF352E",
    textColor: "FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102"],
    isExpress: false,
  },
  A: {
    id: "A",
    shortName: "A",
    longName: "A Train",
    color: "0039A6",
    textColor: "FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["102", "103"],
    isExpress: false,
  },
};

// 101 and 102 share a complex so the graph links them with a walking edge.
const COMPLEXES: ComplexIndex = {
  c1: {
    complexId: "c1",
    name: "Origin Complex",
    stations: ["101", "102"],
    allLines: ["1", "2", "A"],
    allStopIds: ["101N", "101S", "102N", "102S"],
  },
};

function makeArrival(
  line: string,
  offsetSecs: number,
  direction: "N" | "S" = "S",
  tripId = `trip-${line}`
): ArrivalTime {
  return {
    tripId,
    line,
    destination: "Test Terminal",
    direction,
    arrivalTime: nowSecs + offsetSecs,
    minutesAway: Math.round(offsetSecs / 60),
    confidence: "high",
    isAssigned: true,
    isRerouted: false,
    isExpress: false,
    feedName: "gtfs",
    feedAge: 5,
  };
}

function makeTrain(tripId: string, delay: number | undefined, routeId: string): TrainPosition {
  return {
    tripId,
    routeId,
    direction: "S",
    currentStopSequence: 1,
    status: "IN_TRANSIT_TO",
    currentStopId: "101S",
    timestamp: nowSecs,
    isAssigned: true,
    isRerouted: false,
    isExpress: false,
    destination: "Test Terminal",
    delay,
  };
}

function makePositions(routeId: string, trains: TrainPosition[]): LinePositions {
  return { routeId, fetchedAt: nowSecs * 1000, feedAge: 5, trains };
}

/** Build a reader over a station/position world, with a fixed clock */
function makeWorld(
  arrivalsByStation: Record<string, ArrivalTime[]>,
  positionsByRoute: Record<string, LinePositions>
) {
  const getArrivals = (stationId: string): StationArrivals | null => {
    const arrivals = arrivalsByStation[stationId];
    if (!arrivals) return null;
    return {
      stationId,
      stationName: STATIONS[stationId]?.name ?? "Unknown",
      updatedAt: nowSecs * 1000,
      feedAge: 5,
      northbound: arrivals,
      southbound: [],
    };
  };

  return createPositionAdjustedReader({
    getArrivals,
    getPositions: (routeId: string): LinePositions | null => positionsByRoute[routeId] ?? null,
    nowSeconds: () => nowSecs,
  });
}

/** Engine wired through the position-adjusted reader, like app.ts does */
function makeEngine(reader: ReturnType<typeof makeWorld>): TransferEngine {
  return new TransferEngine({
    stations: STATIONS,
    routes: ROUTES,
    transfers: {},
    complexes: COMPLEXES,
    getArrivals: reader,
  });
}

// ─── Reader behaviour ──────────────────────────────────────────────────────

describe("createPositionAdjustedReader", () => {
  it("passes the cache through unchanged when no positions are available", () => {
    const reader = makeWorld({ "101": [makeArrival("1", 120)] }, {});
    expect(reader("101")?.northbound[0]?.arrivalTime).toBe(nowSecs + 120);
  });

  it("passes the cache through when the observed trips carry no delay", () => {
    const reader = makeWorld(
      { "101": [makeArrival("1", 120)] },
      { "1": makePositions("1", [makeTrain("trip-1", undefined, "1")]) }
    );
    expect(reader("101")?.northbound[0]?.arrivalTime).toBe(nowSecs + 120);
  });

  it("returns null for a station with no cached arrivals", () => {
    const reader = makeWorld({}, { "1": makePositions("1", [makeTrain("trip-1", 60, "1")]) });
    expect(reader("101")).toBeNull();
  });

  it("does not mutate the cached StationArrivals object", () => {
    const cached = [makeArrival("1", 120)];
    const reader = makeWorld(
      { "101": cached },
      { "1": makePositions("1", [makeTrain("trip-1", 300, "1")]) }
    );
    reader("101");
    expect(cached[0]?.arrivalTime).toBe(nowSecs + 120);
    expect(cached[0]?.minutesAway).toBe(2);
  });

  it("shifts a delayed train and recomputes minutesAway", () => {
    const reader = makeWorld(
      { "101": [makeArrival("1", 120)] },
      { "1": makePositions("1", [makeTrain("trip-1", 300, "1")]) }
    );
    const adjusted = reader("101")?.northbound[0];
    expect(adjusted?.arrivalTime).toBe(nowSecs + 420);
    expect(adjusted?.minutesAway).toBe(7);
  });

  it("shifts an early train forward in time", () => {
    const reader = makeWorld(
      { "101": [makeArrival("1", 300)] },
      { "1": makePositions("1", [makeTrain("trip-1", -120, "1")]) }
    );
    const adjusted = reader("101")?.northbound[0];
    expect(adjusted?.arrivalTime).toBe(nowSecs + 180);
    expect(adjusted?.minutesAway).toBe(3);
  });

  it("drops a train whose corrected arrival has already passed", () => {
    const reader = makeWorld(
      {
        "101": [makeArrival("1", 120, "S", "trip-early"), makeArrival("1", 600, "S", "trip-later")],
      },
      { "1": makePositions("1", [makeTrain("trip-early", -300, "1")]) }
    );
    // trip-early is the +120s arrival; 120 - 300 puts it in the past, so it
    // goes. The untouched second train is all that is left.
    const remaining = reader("101")?.northbound ?? [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.tripId).toBe("trip-later");
    expect(remaining[0]?.arrivalTime).toBe(nowSecs + 600);
  });

  it("re-sorts a direction after delays reorder it", () => {
    const reader = makeWorld(
      {
        "101": [makeArrival("1", 60, "S", "trip-soon"), makeArrival("1", 600, "S", "trip-later")],
      },
      { "1": makePositions("1", [makeTrain("trip-soon", 1200, "1")]) }
    );
    const times = (reader("101")?.northbound ?? []).map((a) => a.arrivalTime);
    expect(times).toEqual([nowSecs + 600, nowSecs + 1260]);
  });

  it("clamps a wildly large observed delay", () => {
    const reader = makeWorld(
      { "101": [makeArrival("1", 120)] },
      { "1": makePositions("1", [makeTrain("trip-1", 90_000, "1")]) }
    );
    expect(reader("101")?.northbound[0]?.arrivalTime).toBe(nowSecs + 120 + 1800);
  });

  it("leaves arrivals whose trip has no position observation untouched", () => {
    const reader = makeWorld(
      { "101": [makeArrival("1", 120), makeArrival("2", 90)] },
      { "1": makePositions("1", [makeTrain("trip-1", 300, "1")]) }
    );
    const northbound = reader("101")?.northbound ?? [];
    expect(northbound.find((a) => a.line === "1")?.arrivalTime).toBe(nowSecs + 420);
    expect(northbound.find((a) => a.line === "2")?.arrivalTime).toBe(nowSecs + 90);
  });

  it("tolerates a cached arrival with no route attribution", () => {
    // Cached data is not guaranteed to carry `line`; the engine never matches
    // such an arrival, and the reader must not reject the whole station over it.
    const unattributed = { ...makeArrival("1", 120), line: undefined } as ArrivalTime;
    const reader = makeWorld(
      { "101": [unattributed, makeArrival("2", 90)] },
      { "1": makePositions("1", [makeTrain("trip-1", 300, "1")]) }
    );
    const northbound = reader("101")?.northbound ?? [];
    expect(northbound).toHaveLength(2);
    expect(northbound.find((a) => a.line === "2")?.arrivalTime).toBe(nowSecs + 90);
  });
});

// ─── Recommendation changes ────────────────────────────────────────────────
//
// The acceptance check for feeding the engine from the vehicle-position
// stream: the same cached arrivals must produce a different recommendation
// once the stream reports observed motion.

describe("recommendation reacts to observed train motion", () => {
  // Cached view: the "2" → "A" transfer beats waiting 25 minutes for the
  // only direct "1" train.
  const CACHED_ARRIVALS = {
    "101": [makeArrival("1", 1500), makeArrival("2", 60)],
    "102": [makeArrival("A", 300)],
  };

  it("recommends the transfer before any position observation", () => {
    const analysis = makeEngine(makeWorld(CACHED_ARRIVALS, {})).analyzeCommute("101", "103");
    expect(analysis.recommendation).toBe("transfer");
    expect(analysis.recommendationDetails.type).toBe("transfer");
  });

  it("flips to the direct route when the connecting train is observed late", () => {
    // The A train at 102 is observed running 30 minutes late. The corrected
    // connection blows past the engine's wait ceiling, so the rider is sent
    // to the direct "1" train instead.
    const analysis = makeEngine(
      makeWorld(CACHED_ARRIVALS, {
        A: makePositions("A", [makeTrain("trip-A", 1800, "A")]),
      })
    ).analyzeCommute("101", "103");
    expect(analysis.recommendation).toBe("direct");
    expect(analysis.recommendationDetails.type).toBe("direct");
    expect(analysis.directRoutes[0]?.line).toBe("1");
  });

  it("flips to the direct route when the direct train is observed running early", () => {
    // A negative delay — an advanced train — pulls the direct "1" train
    // forward by 23 minutes, which beats the transfer even though the cache
    // still lists it 25 minutes out.
    const analysis = makeEngine(
      makeWorld(CACHED_ARRIVALS, {
        "1": makePositions("1", [makeTrain("trip-1", -1400, "1")]),
      })
    ).analyzeCommute("101", "103");
    expect(analysis.recommendation).toBe("direct");
    expect(analysis.directRoutes[0]?.line).toBe("1");
    const direct = analysis.directRoutes.find((r) => r.line === "1");
    expect(direct?.nextArrivals[0]?.arrivalTime).toBe(nowSecs + 100);
  });

  it("keeps the transfer recommendation when the observed delay changes nothing", () => {
    // A one-minute delay on the connecting train is absorbed: the corrected
    // connection still beats the wait for the direct train.
    const analysis = makeEngine(
      makeWorld(CACHED_ARRIVALS, {
        A: makePositions("A", [makeTrain("trip-A", 60, "A")]),
      })
    ).analyzeCommute("101", "103");
    expect(analysis.recommendation).toBe("transfer");
  });
});
