import type { TravelTimeIndex } from "@mta-my-way/shared";
import { describe, expect, it } from "vitest";
import {
  calculateRouteTravelTime,
  countStopsBetween,
  determineDirection,
  getTravelTime,
} from "./travel-times.js";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const TRAVEL_TIMES: TravelTimeIndex = {
  "1": {
    "101": { "102": 90, "103": 150 },
    "102": { "103": 80 },
    "103": { "102": 75, "101": 140 },
  },
};

const ROUTE_STOPS = ["101", "102", "103", "104", "105"];

// ─── getTravelTime ─────────────────────────────────────────────────────────

describe("getTravelTime", () => {
  it("returns the exact travel time when available", () => {
    expect(getTravelTime(TRAVEL_TIMES, "1", "101", "102")).toBe(90);
  });

  it("returns 120s default when route not in index", () => {
    expect(getTravelTime(TRAVEL_TIMES, "X", "101", "102")).toBe(120);
  });

  it("returns 120s default when fromStop not in route index", () => {
    expect(getTravelTime(TRAVEL_TIMES, "1", "999", "102")).toBe(120);
  });

  it("returns 120s default when toStop not in from-stop index", () => {
    expect(getTravelTime(TRAVEL_TIMES, "1", "101", "999")).toBe(120);
  });
});

// ─── calculateRouteTravelTime ──────────────────────────────────────────────

describe("calculateRouteTravelTime", () => {
  it("sums forward travel times correctly", () => {
    // 101 -> 102: 90s, 102 -> 103: 80s
    const result = calculateRouteTravelTime(TRAVEL_TIMES, "1", ROUTE_STOPS, "101", "103");
    expect(result).toBe(90 + 80);
  });

  it("sums backward travel times correctly", () => {
    // 103 -> 102: 75s
    const result = calculateRouteTravelTime(TRAVEL_TIMES, "1", ROUTE_STOPS, "103", "102");
    expect(result).toBe(75);
  });

  it("returns 0 for same origin and destination", () => {
    const result = calculateRouteTravelTime(TRAVEL_TIMES, "1", ROUTE_STOPS, "101", "101");
    expect(result).toBe(0);
  });

  it("falls back to estimate when station not in route stops", () => {
    // "999" is not in ROUTE_STOPS
    const result = calculateRouteTravelTime(TRAVEL_TIMES, "1", ROUTE_STOPS, "999", "103");
    // estimateTravelTimeByStops(5) = max(5 * 120, 120) = 600
    expect(result).toBe(600);
  });

  it("uses default inter-station time when segment not in travel times index", () => {
    // 104 and 105 are in ROUTE_STOPS but not in the travel times data for route "1"
    // Each missing segment defaults to 120s
    const result = calculateRouteTravelTime(TRAVEL_TIMES, "1", ROUTE_STOPS, "104", "105");
    expect(result).toBe(120);
  });
});

// ─── determineDirection ────────────────────────────────────────────────────

describe("determineDirection", () => {
  it("returns S when destination index is greater than origin index", () => {
    // 101 is index 0, 103 is index 2 — forward = "S"
    expect(determineDirection(ROUTE_STOPS, "101", "103")).toBe("S");
  });

  it("returns N when destination index is less than origin index", () => {
    // 103 is index 2, 101 is index 0 — backward = "N"
    expect(determineDirection(ROUTE_STOPS, "103", "101")).toBe("N");
  });

  it("returns null when origin is not in route", () => {
    expect(determineDirection(ROUTE_STOPS, "999", "102")).toBeNull();
  });

  it("returns null when destination is not in route", () => {
    expect(determineDirection(ROUTE_STOPS, "101", "999")).toBeNull();
  });
});

// ─── countStopsBetween ─────────────────────────────────────────────────────

describe("countStopsBetween", () => {
  it("counts stops between two stations (forward)", () => {
    expect(countStopsBetween(ROUTE_STOPS, "101", "104")).toBe(3);
  });

  it("counts stops between two stations (backward)", () => {
    expect(countStopsBetween(ROUTE_STOPS, "105", "102")).toBe(3);
  });

  it("returns 0 for same station", () => {
    expect(countStopsBetween(ROUTE_STOPS, "102", "102")).toBe(0);
  });

  it("returns -1 when origin is not on route", () => {
    expect(countStopsBetween(ROUTE_STOPS, "999", "102")).toBe(-1);
  });

  it("returns -1 when destination is not on route", () => {
    expect(countStopsBetween(ROUTE_STOPS, "101", "999")).toBe(-1);
  });
});
