/**
 * Tests for the seed helpers in `seed-helpers.ts`.
 *
 * The important properties are determinism (the same options always produce
 * deep-equal data, timestamps anchored at SEED_EPOCH rather than Date.now()),
 * sequential IDs, and that the composite `seedTestData` wires its parts
 * together coherently.
 */

import {
  SEED_EPOCH,
  seedAlerts,
  seedArrivals,
  seedRoutes,
  seedStations,
  seedTestData,
  seedTrips,
} from "@mta-my-way/shared/testing/seed-helpers";
import { describe, expect, it, vi } from "vitest";

const MINUTE_MS = 60_000;

describe("seedStations", () => {
  it("seeds sequential GTFS-style IDs by default", () => {
    expect(seedStations().map((s) => s.id)).toEqual(["101", "102", "103", "104", "105"]);
  });

  it("honors count and firstId", () => {
    const stations = seedStations({ count: 2, firstId: 700 });

    expect(stations.map((s) => s.id)).toEqual(["700", "701"]);
  });

  it("names stations from a fixed pool, deterministically", () => {
    const first = seedStations({ count: 3 });
    const again = seedStations({ count: 3 });

    expect(first).toEqual(again);
    expect(first[0]?.name).toBe("Times Square-42 St");
  });

  it("carries a single shared line when one is given", () => {
    const stations = seedStations({ count: 3, lines: ["7"] });

    for (const station of stations) {
      expect(station.lines).toEqual(["7"]);
    }
  });

  it("never reaches for the wall clock", () => {
    vi.useFakeTimers();
    try {
      const early = seedStations({ count: 2 });
      vi.setSystemTime(Date.now() + 86_400_000);
      const late = seedStations({ count: 2 });

      expect(late).toEqual(early);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("seedRoutes", () => {
  it("seeds sequential routes over the same stops", () => {
    const routes = seedRoutes({ count: 3, stops: ["201", "202"] });

    expect(routes.map((r) => r.id)).toEqual(["1", "2", "3"]);
    for (const route of routes) {
      expect(route.stops).toEqual(["201", "202"]);
    }
  });

  it("gives each route a distinct bullet", () => {
    const routes = seedRoutes({ count: 4 });
    const bullets = new Set(routes.map((r) => r.shortName));

    expect(bullets.size).toBe(4);
  });
});

describe("seedArrivals", () => {
  it("spaces arrivals evenly, soonest first", () => {
    const arrivals = seedArrivals({ count: 3, firstMinutesAway: 2, stepMinutes: 5 });

    expect(arrivals.map((a) => a.minutesAway)).toEqual([2, 7, 12]);
  });

  it("derives arrivalTime from minutesAway against SEED_EPOCH", () => {
    const [first] = seedArrivals({ firstMinutesAway: 4 });

    expect(first?.arrivalTime).toBe(SEED_EPOCH + 4 * MINUTE_MS);
  });

  it("is deterministic across calls", () => {
    expect(seedArrivals({ count: 4 })).toEqual(seedArrivals({ count: 4 }));
  });

  it("defaults to a northbound 1 train board of three", () => {
    const arrivals = seedArrivals();

    expect(arrivals).toHaveLength(3);
    for (const arrival of arrivals) {
      expect(arrival.line).toBe("1");
      expect(arrival.direction).toBe("N");
    }
  });
});

describe("seedAlerts", () => {
  it("seeds alerts whose window is active relative to SEED_EPOCH", () => {
    const [alert] = seedAlerts({ count: 1 });

    expect(alert?.activePeriod.start).toBe(SEED_EPOCH - 60 * MINUTE_MS);
    expect(alert?.activePeriod.end).toBe(SEED_EPOCH + 120 * MINUTE_MS);
  });

  it("scopes alerts to the requested lines", () => {
    const alerts = seedAlerts({ count: 2, affectedLines: ["A", "C"] });

    for (const alert of alerts) {
      expect(alert.affectedLines).toEqual(["A", "C"]);
    }
  });

  it("carries the requested severity", () => {
    const alerts = seedAlerts({ count: 1, severity: "severe" });

    expect(alerts[0]?.severity).toBe("severe");
  });
});

describe("seedTrips", () => {
  it("grows durations by the step", () => {
    const trips = seedTrips({ count: 3, firstDurationMinutes: 28, stepDurationMinutes: 2 });

    expect(trips.map((t) => t.actualDurationMinutes)).toEqual([28, 30, 32]);
  });

  it("anchors departure and arrival at SEED_EPOCH", () => {
    const trips = seedTrips({ count: 2, firstDurationMinutes: 30, stepDurationMinutes: 0 });

    for (const trip of trips) {
      expect(trip.arrivalTime - trip.departureTime).toBe(30 * MINUTE_MS);
      expect(trip.departureTime).toBeLessThan(SEED_EPOCH);
    }
  });
});

describe("seedTestData", () => {
  it("wires arrivals, alerts and trips to the primary route's line", () => {
    const world = seedTestData();
    const primaryLine = world.routes[0]!.shortName;

    for (const arrival of world.arrivals) {
      expect(arrival.line).toBe(primaryLine);
    }
    for (const alert of world.alerts) {
      expect(alert.affectedLines).toContain(primaryLine);
    }
    for (const trip of world.trips) {
      expect(trip.line).toBe(primaryLine);
    }
  });

  it("builds routes that stop at the seeded stations", () => {
    const world = seedTestData();
    const stationIds = world.stations.map((s) => s.id);

    for (const route of world.routes) {
      expect(route.stops).toEqual(stationIds);
    }
  });

  it("places arrivals at the first station's line, not a random one", () => {
    const world = seedTestData({ arrivalCount: 4 });

    expect(world.arrivals).toHaveLength(4);
    expect(new Set(world.arrivals.map((a) => a.line)).size).toBe(1);
  });

  it("honors the requested sizes", () => {
    const world = seedTestData({
      stationCount: 5,
      routeCount: 3,
      arrivalCount: 6,
      alertCount: 2,
      tripCount: 4,
    });

    expect(world.stations).toHaveLength(5);
    expect(world.routes).toHaveLength(3);
    expect(world.arrivals).toHaveLength(6);
    expect(world.alerts).toHaveLength(2);
    expect(world.trips).toHaveLength(4);
  });

  it("is deterministic across calls", () => {
    expect(seedTestData()).toEqual(seedTestData());
  });
});
