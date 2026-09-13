/**
 * Tests for the per-trip delay prediction route.
 *
 * Covers the contract TripScreen depends on: a delay-adjusted ETA when the
 * predictor has history for the remaining legs, a null prediction otherwise,
 * and a 404 for a trip that has left the feed.
 */

import type { StationIndex } from "@mta-my-way/shared";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRouteDelayProbability,
  initDelayPredictor,
  recordDelay,
  resetDelayPredictor,
} from "../delay-predictor.js";
import type { TripData } from "../trip-lookup.js";
import { buildTripPredictionRoutes } from "./trip-prediction.routes.js";

vi.mock("../trip-lookup.js", () => ({
  lookupTrip: vi.fn(),
}));

import { lookupTrip } from "../trip-lookup.js";

const STATIONS: StationIndex = {
  "101": {
    id: "101",
    name: "South Ferry",
    lat: 40.7,
    lon: -74.012,
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
    lat: 40.702,
    lon: -74.013,
    lines: ["1"],
    northStopId: "102N",
    southStopId: "102S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "103": {
    id: "103",
    name: "WTC Cortlandt",
    lat: 40.712,
    lon: -74.014,
    lines: ["1"],
    northStopId: "103N",
    southStopId: "103S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
};

/** Two legs from the current stop to the destination, 2 minutes each. */
function makeTrip(overrides: Partial<TripData> = {}): TripData {
  const now = Math.floor(Date.now() / 1000);
  return {
    tripId: "1_TEST_TRIP",
    routeId: "1",
    direction: "N",
    destination: "WTC Cortlandt",
    isAssigned: true,
    trainId: "1234",
    stops: [
      {
        stopId: "101N",
        stationId: "101",
        stationName: "South Ferry",
        arrivalTime: now - 60,
        departureTime: now,
        scheduledTrack: null,
        actualTrack: null,
      },
      {
        stopId: "102N",
        stationId: "102",
        stationName: "Rector St",
        arrivalTime: now + 120,
        departureTime: now + 150,
        scheduledTrack: null,
        actualTrack: null,
      },
      {
        stopId: "103N",
        stationId: "103",
        stationName: "WTC Cortlandt",
        arrivalTime: now + 240,
        departureTime: null,
        scheduledTrack: null,
        actualTrack: null,
      },
    ],
    currentStopIndex: 0,
    updatedAt: now,
    feedAge: 5,
    progressPercent: 10,
    remainingStops: 2,
    totalStops: 3,
    ...overrides,
  };
}

function buildApp(): Hono {
  const app = new Hono();
  const routes = buildTripPredictionRoutes(STATIONS);
  app.get("/api/trip/:tripId/predict", routes.getTripPrediction);
  return app;
}

describe("trip prediction route", () => {
  beforeEach(() => {
    vi.mocked(lookupTrip).mockReset();
    initDelayPredictor(
      {
        "1": {
          "101N": { "102N": 120 },
          "102N": { "103N": 120 },
        },
      },
      STATIONS
    );
  });

  afterEach(() => {
    resetDelayPredictor();
  });

  it("returns 404 when the trip is no longer active", async () => {
    vi.mocked(lookupTrip).mockReturnValue(null);

    const res = await buildApp().request("/api/trip/1_TEST_TRIP/predict");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Trip not found or no longer active" });
  });

  it("returns 400 for a malformed trip id", async () => {
    const res = await buildApp().request("/api/trip/not%20a%20trip%20id/predict");

    expect(res.status).toBe(400);
  });

  it("returns a delay-adjusted ETA when the predictor has history", async () => {
    vi.mocked(lookupTrip).mockReturnValue(makeTrip());

    // Five late-running observations on the first remaining leg meet the
    // predictor's minimum-observation threshold. 180s actual against 120s
    // scheduled is a 1.5x blowup on that leg; with the second leg falling
    // back to its scheduled 90s the trip ratio is 1.29 — the medium bucket.
    for (let i = 0; i < 5; i++) {
      recordDelay("1", "N", "101", "102", 180, 120, `TRIP_${i}`);
    }

    const res = await buildApp().request("/api/trip/1_TEST_TRIP/predict");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasPredictions).toBe(true);
    expect(body.baseEta).not.toBe(null);
    expect(body.adjustedEta).not.toBe(null);
    expect(new Date(body.adjustedEta).getTime()).toBeGreaterThan(new Date(body.baseEta).getTime());
    expect(body.delayRisk).toBe("medium");
    expect(body.delayMinutesRange).toMatch(/^\+/);
    expect(body.segments).toHaveLength(2);
    expect(body.segments[0]?.prediction).not.toBe(null);
    expect(body.segments[1]?.prediction).toBe(null);
    expect(getRouteDelayProbability("1", "N")).not.toBe(null);
  });

  it("falls back to scheduled times when there is no history", async () => {
    vi.mocked(lookupTrip).mockReturnValue(makeTrip());

    const res = await buildApp().request("/api/trip/1_TEST_TRIP/predict");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hasPredictions).toBe(false);
    expect(body.routeDelayProbability).toBe(null);
    expect(body.adjustedEta).toBe(null);
    expect(body.delayRisk).toBe(null);
    expect(body.delayMinutesRange).toBe(null);
    // Scheduled legs are still reported, so the response explains the trip.
    expect(body.segments).toHaveLength(2);
    expect(body.segments[0]?.prediction).toBe(null);
  });

  it("reports no prediction for a trip already at its destination", async () => {
    vi.mocked(lookupTrip).mockReturnValue(makeTrip({ currentStopIndex: 2, remainingStops: 0 }));

    const res = await buildApp().request("/api/trip/1_TEST_TRIP/predict");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.segments).toHaveLength(0);
    expect(body.hasPredictions).toBe(false);
    expect(body.adjustedEta).toBe(null);
  });

  it("falls back to northbound patterns when the trip has no direction", async () => {
    for (let i = 0; i < 5; i++) {
      recordDelay("1", "N", "101", "102", 300, 120, `TRIP_${i}`);
    }
    vi.mocked(lookupTrip).mockReturnValue(makeTrip({ direction: null }));

    const res = await buildApp().request("/api/trip/1_TEST_TRIP/predict");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.direction).toBe(null);
    // The northbound history was found despite the missing direction.
    expect(body.hasPredictions).toBe(true);
    expect(body.segments[0]?.prediction).not.toBe(null);
  });
});
