/**
 * Tests for MTA published fare configuration.
 */

import { describe, expect, it } from "vitest";
import {
  MTA_30DAY_UNLIMITED_PASS_PRICE,
  MTA_BASE_FARE,
  MTA_BASE_FARE_PREVIOUS,
  OMNY_WEEKLY_CAP_RIDES,
  OMNY_WEEKLY_FARE_CAP,
} from "./fares";

describe("constants/fares", () => {
  it("publishes the fares that took effect 2026-01-04", () => {
    expect(MTA_BASE_FARE).toBe(3.0);
    expect(MTA_BASE_FARE_PREVIOUS).toBe(2.9);
    expect(OMNY_WEEKLY_FARE_CAP).toBe(35);
    expect(MTA_30DAY_UNLIMITED_PASS_PRICE).toBe(132);
  });

  it("covers the published weekly cap ride count", () => {
    // OMNY: "pay for 12 rides in a 7-day period and any additional rides are free"
    expect(OMNY_WEEKLY_CAP_RIDES).toBe(12);
  });

  it("reaches the dollar cap at or before the published ride count", () => {
    // The estimator is ride-based, so the published ride count must not
    // overshoot the dollar cap it is meant to approximate.
    expect(OMNY_WEEKLY_CAP_RIDES * MTA_BASE_FARE).toBeGreaterThanOrEqual(OMNY_WEEKLY_FARE_CAP);
  });
});
