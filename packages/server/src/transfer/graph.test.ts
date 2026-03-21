import type { ComplexIndex, StationIndex, TransferConnection } from "@mta-my-way/shared";
import { describe, expect, it } from "vitest";
import {
  areInSameComplex,
  buildTransferGraph,
  findTransferPoints,
  getComplexStations,
  getReachableStations,
} from "./graph.js";

// ─── Minimal fixtures ──────────────────────────────────────────────────────

const STATIONS: StationIndex = {
  "101": {
    id: "101",
    name: "Station A",
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
    name: "Station B",
    lines: ["1"],
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
    name: "Station C",
    lines: ["A", "C"],
    lat: 40.72,
    lon: -74.02,
    borough: "manhattan",
    northStopId: "103N",
    southStopId: "103S",
    transfers: [],
    ada: false,
  },
  "104": {
    id: "104",
    name: "Station D",
    lines: ["F"],
    lat: 40.73,
    lon: -74.03,
    borough: "manhattan",
    northStopId: "104N",
    southStopId: "104S",
    transfers: [],
    ada: false,
  },
};

const TRANSFERS: Record<string, TransferConnection[]> = {
  "101": [{ toStationId: "103", toLines: ["A", "C"], walkingSeconds: 120, accessible: true }],
};

const COMPLEXES: ComplexIndex = {
  "complex-1": {
    complexId: "complex-1",
    name: "Complex 1",
    stations: ["102", "104"],
    allLines: ["1", "F"],
    allStopIds: ["102N", "102S", "104N", "104S"],
  },
};

// ─── buildTransferGraph ────────────────────────────────────────────────────

describe("buildTransferGraph", () => {
  it("creates forward edge from transfers", () => {
    const graph = buildTransferGraph(STATIONS, TRANSFERS, {});
    const edges = graph["101"] ?? [];
    expect(edges.some((e) => e.toStationId === "103")).toBe(true);
  });

  it("creates reverse (bidirectional) edge", () => {
    const graph = buildTransferGraph(STATIONS, TRANSFERS, {});
    const edges = graph["103"] ?? [];
    expect(edges.some((e) => e.toStationId === "101")).toBe(true);
  });

  it("preserves walking time on edges", () => {
    const graph = buildTransferGraph(STATIONS, TRANSFERS, {});
    const edge = (graph["101"] ?? []).find((e) => e.toStationId === "103");
    expect(edge?.walkingSeconds).toBe(120);
  });

  it("adds intra-complex edges between complex stations", () => {
    const graph = buildTransferGraph(STATIONS, {}, COMPLEXES);
    expect((graph["102"] ?? []).some((e) => e.toStationId === "104")).toBe(true);
    expect((graph["104"] ?? []).some((e) => e.toStationId === "102")).toBe(true);
  });

  it("intra-complex edges use short walking time (60s)", () => {
    const graph = buildTransferGraph(STATIONS, {}, COMPLEXES);
    const edge = (graph["102"] ?? []).find((e) => e.toStationId === "104");
    expect(edge?.walkingSeconds).toBe(60);
  });

  it("does not duplicate edges; shorter walking time wins", () => {
    const transfers: Record<string, TransferConnection[]> = {
      "101": [
        { toStationId: "103", toLines: ["A"], walkingSeconds: 90, accessible: true },
        { toStationId: "103", toLines: ["A"], walkingSeconds: 200, accessible: true },
      ],
    };
    const graph = buildTransferGraph(STATIONS, transfers, {});
    const edges = (graph["101"] ?? []).filter((e) => e.toStationId === "103");
    expect(edges).toHaveLength(1);
    expect(edges[0]?.walkingSeconds).toBe(90);
  });

  it("initializes every station with an edge array", () => {
    const graph = buildTransferGraph(STATIONS, {}, {});
    for (const id of Object.keys(STATIONS)) {
      expect(graph[id]).toBeDefined();
    }
  });
});

// ─── getReachableStations ──────────────────────────────────────────────────

describe("getReachableStations", () => {
  it("returns edges for a station that has transfers", () => {
    const graph = buildTransferGraph(STATIONS, TRANSFERS, {});
    const edges = getReachableStations(graph, "101");
    expect(edges.length).toBeGreaterThan(0);
  });

  it("returns empty array for station with no transfers", () => {
    const graph = buildTransferGraph(STATIONS, {}, {});
    const edges = getReachableStations(graph, "104");
    expect(edges).toEqual([]);
  });

  it("returns empty array for unknown station ID", () => {
    const graph = buildTransferGraph(STATIONS, {}, {});
    expect(getReachableStations(graph, "UNKNOWN")).toEqual([]);
  });
});

// ─── findTransferPoints ────────────────────────────────────────────────────

describe("findTransferPoints", () => {
  it("finds transfer point from line 1 to line A", () => {
    const graph = buildTransferGraph(STATIONS, TRANSFERS, {});
    // Station 101 (serves 1, 2) transfers to station 103 (serves A, C)
    const points = findTransferPoints(graph, STATIONS, "1", "A");
    expect(points.some((p) => p.stationId === "103")).toBe(true);
  });

  it("returns empty array when no transfer exists between the lines", () => {
    const graph = buildTransferGraph(STATIONS, {}, {});
    const points = findTransferPoints(graph, STATIONS, "1", "F");
    expect(points).toEqual([]);
  });
});

// ─── areInSameComplex ──────────────────────────────────────────────────────

describe("areInSameComplex", () => {
  it("returns true for stations in the same complex", () => {
    expect(areInSameComplex(COMPLEXES, "102", "104")).toBe(true);
  });

  it("returns false for stations in different complexes", () => {
    expect(areInSameComplex(COMPLEXES, "101", "102")).toBe(false);
  });

  it("returns false when complexes index is empty", () => {
    expect(areInSameComplex({}, "101", "102")).toBe(false);
  });
});

// ─── getComplexStations ────────────────────────────────────────────────────

describe("getComplexStations", () => {
  it("returns all stations in the complex", () => {
    const stations = getComplexStations(COMPLEXES, "102");
    expect(stations).toContain("102");
    expect(stations).toContain("104");
  });

  it("returns just the station itself when not in any complex", () => {
    expect(getComplexStations(COMPLEXES, "101")).toEqual(["101"]);
  });
});
