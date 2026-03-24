/**
 * Tests for express detection in transfer/engine.ts
 *
 * Tests detectExpressService() against various stop patterns:
 * - Local service (no skipped stops)
 * - Express service (2+ skipped stops)
 * - Edge cases (1 skipped stop = not express, empty inputs)
 */

import { describe, expect, it } from "vitest";
import { detectExpressService } from "./transfer/engine.js";

describe("detectExpressService", () => {
  it("local trip with no skipped stops → not express", () => {
    const routeStops = ["A", "B", "C", "D", "E"];
    const tripStops = ["A", "B", "C", "D", "E"];
    const result = detectExpressService(tripStops, routeStops, "A", "E");
    expect(result.isExpress).toBe(false);
    expect(result.skippedStops).toEqual([]);
  });

  it("express trip skipping 2+ stops → express", () => {
    const routeStops = ["A", "B", "C", "D", "E"];
    const tripStops = ["A", "D", "E"]; // skips B, C
    const result = detectExpressService(tripStops, routeStops, "A", "E");
    expect(result.isExpress).toBe(true);
    expect(result.skippedStops).toEqual(["B", "C"]);
  });

  it("trip skipping exactly 1 stop → not express (needs 2+)", () => {
    const routeStops = ["A", "B", "C", "D"];
    const tripStops = ["A", "C", "D"]; // skips B
    const result = detectExpressService(tripStops, routeStops, "A", "D");
    expect(result.isExpress).toBe(false);
    expect(result.skippedStops).toEqual(["B"]);
  });

  it("returns not express when origin not in route", () => {
    const routeStops = ["A", "B", "C"];
    const tripStops = ["A", "B", "C"];
    const result = detectExpressService(tripStops, routeStops, "X", "C");
    expect(result.isExpress).toBe(false);
  });

  it("returns not express when destination not in route", () => {
    const routeStops = ["A", "B", "C"];
    const tripStops = ["A", "B", "C"];
    const result = detectExpressService(tripStops, routeStops, "A", "X");
    expect(result.isExpress).toBe(false);
  });

  it("handles reverse direction (destination before origin in route)", () => {
    const routeStops = ["A", "B", "C", "D", "E"];
    const tripStops = ["E", "B", "A"]; // southbound express
    const result = detectExpressService(tripStops, routeStops, "E", "A");
    expect(result.isExpress).toBe(true);
    expect(result.skippedStops).toEqual(["C", "D"]);
  });

  it("trip with extra stops not in route are ignored", () => {
    const routeStops = ["A", "B", "C", "D"];
    const tripStops = ["A", "C", "D"]; // skips B
    const result = detectExpressService(tripStops, routeStops, "A", "D");
    expect(result.isExpress).toBe(false); // only 1 skip
  });

  it("realistic NYC express: 2 train skipping local stops", () => {
    // Route 1 local stops: 100, 101, 102, 103, 104, 105
    // Route 2 express stops: 100, 102, 104, 105 (skips 101, 103)
    const routeStops = ["100", "101", "102", "103", "104", "105"];
    const tripStops = ["100", "102", "104", "105"];
    const result = detectExpressService(tripStops, routeStops, "100", "105");
    expect(result.isExpress).toBe(true);
    expect(result.skippedStops).toEqual(["101", "103"]);
  });

  it("partial trip (not full route) still detects express", () => {
    const routeStops = ["A", "B", "C", "D", "E", "F"];
    const tripStops = ["C", "E", "F"]; // only C→F segment, skips D
    const result = detectExpressService(tripStops, routeStops, "C", "F");
    expect(result.isExpress).toBe(false); // only 1 skip in segment
  });
});
