/**
 * Test data seed helpers: parametrized, deterministic bundles of the domain
 * data the app passes around — stations, routes, arrivals, alerts and trips.
 *
 * The mock generators in `test-helpers.ts` build one object per call and
 * default their timestamps to `Date.now()`, which is right for a single hand-
 * shaped fixture and wrong for seeding a batch: a test that builds ten
 * arrivals gets ten distinct "now"s, and re-running the test re-rolls them
 * all. The seeds here fix a base epoch ({@link SEED_EPOCH}), derive every
 * timestamp and ID from it, and generate coherent *volumes* — an `N`-station
 * network with arrivals that actually reference those stations — so a test
 * can size its world without hand-writing it.
 *
 * Determinism contract: the same options always produce deep-equal data. IDs
 * are sequential from a fixed base, timestamps are offsets from
 * {@link SEED_EPOCH}, and names cycle a fixed pool of real stations.
 */

import { MOCK_CONTEXT_TIMESTAMP } from "./middleware/execution-context";
import {
  createMockAlert,
  createMockArrival,
  createMockRoute,
  createMockStation,
  createMockTripRecord,
} from "./test-helpers";

/** Fixed epoch every seeded timestamp is an offset of — the shared mock epoch. */
export const SEED_EPOCH = MOCK_CONTEXT_TIMESTAMP;

/** One minute in milliseconds, for deriving arrival times from `minutesAway`. */
const MINUTE_MS = 60_000;

/**
 * Real station names cycled in order, so a seeded network reads like the
 * system it stands in for. Beyond the pool, stations are named `Station N`.
 */
const STATION_NAME_POOL = [
  "Times Square-42 St",
  "34 St-Penn Station",
  "Grand Central-42 St",
  "Fulton St",
  "Atlantic Av-Barclays Ctr",
  "Flushing-Main St",
  "Union Sq",
  "Canal St",
  "125 St",
  "Jay St-MetroTech",
] as const;

/** Line bullets cycled in order for seeded routes and arrivals. */
const LINE_POOL = ["1", "2", "3", "4", "5", "6", "7", "A", "C", "E"] as const;

/** Boroughs cycled in order for seeded stations. */
const BOROUGH_POOL = ["manhattan", "brooklyn", "queens", "bronx"] as const;

// ============================================================================
// Seed options
// ============================================================================

/** Options for {@link seedStations}. */
export interface SeedStationsOptions {
  /** How many stations to seed (defaults to `5`) */
  count?: number;
  /** First station's numeric GTFS-style ID (defaults to `101`) */
  firstId?: number;
  /** Line every station carries (defaults to cycling the line pool) */
  lines?: string[];
}

/** Options for {@link seedRoutes}. */
export interface SeedRoutesOptions {
  /** How many routes to seed (defaults to `3`) */
  count?: number;
  /** First route's numeric ID (defaults to `1`) */
  firstId?: number;
  /** Station IDs the routes run through (defaults to the first three of `101`–`103`) */
  stops?: string[];
}

/** Options for {@link seedArrivals}. */
export interface SeedArrivalsOptions {
  /** How many arrivals to seed (defaults to `3`) */
  count?: number;
  /** Line bullet every arrival runs on (defaults to `"1"`) */
  line?: string;
  /** Direction, `"N"` or `"S"` (defaults to `"N"`) */
  direction?: "N" | "S";
  /** `minutesAway` of the first arrival (defaults to `2`) */
  firstMinutesAway?: number;
  /** Minutes between consecutive arrivals (defaults to `5`) */
  stepMinutes?: number;
}

/** Options for {@link seedAlerts}. */
export interface SeedAlertsOptions {
  /** How many alerts to seed (defaults to `2`) */
  count?: number;
  /** Severity every alert carries (defaults to `"warning"`) */
  severity?: "info" | "warning" | "severe";
  /** Lines every alert affects (defaults to the first seeded line) */
  affectedLines?: string[];
}

/** Options for {@link seedTrips}. */
export interface SeedTripsOptions {
  /** How many trips to seed (defaults to `3`) */
  count?: number;
  /** Line every trip rode (defaults to `"1"`) */
  line?: string;
  /** Actual duration of the first trip, in minutes (defaults to `30`) */
  firstDurationMinutes?: number;
  /** Minutes added per successive trip (defaults to `2`) */
  stepDurationMinutes?: number;
}

/** Options for {@link seedTestData}. */
export interface SeedTestDataOptions {
  /** Stations in the seeded network (defaults to `3`) */
  stationCount?: number;
  /** Routes through the network (defaults to `2`) */
  routeCount?: number;
  /** Arrivals at the first station (defaults to `3`) */
  arrivalCount?: number;
  /** Alerts affecting the network (defaults to `1`) */
  alertCount?: number;
  /** Trips across the network (defaults to `2`) */
  tripCount?: number;
}

// ============================================================================
// Seeds
// ============================================================================

/**
 * Seed a row of stations with sequential IDs and cycling real names.
 *
 * @param options - Count, first ID and line membership
 * @returns The seeded stations, ID order preserved
 *
 * @example A five-station line
 * ```typescript
 * const stations = seedStations({ count: 5 });
 * expect(stations.map((s) => s.id)).toEqual(["101", "102", "103", "104", "105"]);
 * ```
 */
export function seedStations(options: SeedStationsOptions = {}) {
  const count = options.count ?? 5;
  const firstId = options.firstId ?? 101;

  return Array.from({ length: count }, (_, i) => {
    const id = String(firstId + i);
    const name = STATION_NAME_POOL[i % STATION_NAME_POOL.length];
    const lines = options.lines ?? [
      LINE_POOL[i % LINE_POOL.length] ?? LINE_POOL[0],
      LINE_POOL[(i + 1) % LINE_POOL.length] ?? LINE_POOL[0],
    ];
    return createMockStation({
      id,
      name: i < STATION_NAME_POOL.length ? name : `${name} (${id})`,
      lines: [...lines],
      borough: BOROUGH_POOL[i % BOROUGH_POOL.length],
    });
  });
}

/**
 * Seed routes running through a shared stop list.
 *
 * @param options - Count, first ID and the stops every route serves
 * @returns The seeded routes, ID order preserved
 *
 * @example Three routes over the same corridor
 * ```typescript
 * const routes = seedRoutes({ count: 3, stops: ["101", "102", "103"] });
 * expect(routes.every((r) => r.stops.length === 3)).toBe(true);
 * ```
 */
export function seedRoutes(options: SeedRoutesOptions = {}) {
  const count = options.count ?? 3;
  const firstId = options.firstId ?? 1;
  const stops = options.stops ?? ["101", "102", "103"];

  return Array.from({ length: count }, (_, i) => {
    const id = String(firstId + i);
    const line = LINE_POOL[i % LINE_POOL.length];
    return createMockRoute({
      id,
      shortName: line,
      longName: `${line} Line (seeded)`,
      stops: [...stops],
    });
  });
}

/**
 * Seed a departure board: arrivals on one line and direction, evenly spaced.
 *
 * `arrivalTime` is derived from `minutesAway` against {@link SEED_EPOCH}, so a
 * seeded board is stable across runs — assert on it freely.
 *
 * @param options - Count, line, direction and spacing
 * @returns The seeded arrivals, soonest first
 *
 * @example A three-train board, two minutes out
 * ```typescript
 * const arrivals = seedArrivals({ count: 3, line: "7", firstMinutesAway: 2 });
 * expect(arrivals.map((a) => a.minutesAway)).toEqual([2, 7, 12]);
 * ```
 */
export function seedArrivals(options: SeedArrivalsOptions = {}) {
  const count = options.count ?? 3;
  const line = options.line ?? "1";
  const direction = options.direction ?? "N";
  const firstMinutesAway = options.firstMinutesAway ?? 2;
  const stepMinutes = options.stepMinutes ?? 5;

  return Array.from({ length: count }, (_, i) => {
    const minutesAway = firstMinutesAway + i * stepMinutes;
    return createMockArrival({
      line,
      direction,
      minutesAway,
      arrivalTime: SEED_EPOCH + minutesAway * MINUTE_MS,
      tripId: `seed-trip-${line}-${direction}-${i + 1}`,
      destination: STATION_NAME_POOL[(i + 1) % STATION_NAME_POOL.length],
    });
  });
}

/**
 * Seed service-change alerts, optionally scoped to lines.
 *
 * The active window is fixed against {@link SEED_EPOCH}: open an hour ago,
 * closing in two hours, so every seeded alert is "currently active" without
 * depending on the wall clock.
 *
 * @param options - Count, severity and affected lines
 * @returns The seeded alerts, in seed order
 *
 * @example A severe alert affecting two lines
 * ```typescript
 * const alerts = seedAlerts({ count: 1, severity: "severe", affectedLines: ["A", "C"] });
 * expect(alerts[0].affectedLines).toEqual(["A", "C"]);
 * ```
 */
export function seedAlerts(options: SeedAlertsOptions = {}) {
  const count = options.count ?? 2;
  const severity = options.severity ?? "warning";
  const affectedLines = options.affectedLines;

  return Array.from({ length: count }, (_, i) => {
    const line = LINE_POOL[i % LINE_POOL.length];
    return createMockAlert({
      id: `seed-alert-${i + 1}`,
      severity,
      headline: `${line} train service change (seeded)`,
      affectedLines: affectedLines ? [...affectedLines] : [line],
      activePeriod: {
        start: SEED_EPOCH - 60 * MINUTE_MS,
        end: SEED_EPOCH + 120 * MINUTE_MS,
      },
    });
  });
}

/**
 * Seed a ride history: trips over one line with slowly growing durations.
 *
 * Departure and arrival times are anchored at {@link SEED_EPOCH}, so a seeded
 * history is stable across runs.
 *
 * @param options - Count, line and duration progression
 * @returns The seeded trips, oldest first
 *
 * @example A week of commutes
 * ```typescript
 * const trips = seedTrips({ count: 7, firstDurationMinutes: 28, stepDurationMinutes: 1 });
 * expect(trips[trips.length - 1].actualDurationMinutes).toBe(34);
 * ```
 */
export function seedTrips(options: SeedTripsOptions = {}) {
  const count = options.count ?? 3;
  const line = options.line ?? "1";
  const firstDurationMinutes = options.firstDurationMinutes ?? 30;
  const stepDurationMinutes = options.stepDurationMinutes ?? 2;

  return Array.from({ length: count }, (_, i) => {
    const duration = firstDurationMinutes + i * stepDurationMinutes;
    const departure = SEED_EPOCH - (count - i) * 60 * MINUTE_MS;
    return createMockTripRecord({
      id: `seed-trip-record-${i + 1}`,
      line,
      departureTime: departure,
      arrivalTime: departure + duration * MINUTE_MS,
      actualDurationMinutes: duration,
    });
  });
}

// ============================================================================
// Composite seed
// ============================================================================

/** Everything {@link seedTestData} builds, wired to the same network. */
export interface SeedTestDataBundle {
  /** The seeded station network */
  stations: ReturnType<typeof seedStations>;
  /** Routes whose `stops` are the seeded station IDs */
  routes: ReturnType<typeof seedRoutes>;
  /** Arrivals at the first seeded station */
  arrivals: ReturnType<typeof seedArrivals>;
  /** Alerts affecting the first seeded line */
  alerts: ReturnType<typeof seedAlerts>;
  /** Trips across the network */
  trips: ReturnType<typeof seedTrips>;
}

/**
 * Seed a complete, internally consistent slice of the system in one call.
 *
 * Unlike {@link seedStations} and friends, which build one kind of data, this
 * wires the kinds together: routes stop at the seeded stations, arrivals sit
 * at the first station, alerts affect a line that route serves, and trips run
 * between the first two stations. A test gets a world it can query without
 * knowing how the pieces reference each other.
 *
 * @param options - Sizes for each part of the bundle
 * @returns The seeded bundle
 *
 * @example A small world for a screen test
 * ```typescript
 * const world = seedTestData();
 * expect(world.routes[0].stops).toContain(world.stations[0].id);
 * expect(world.arrivals.every((a) => a.line === world.routes[0].shortName)).toBe(true);
 * ```
 */
export function seedTestData(options: SeedTestDataOptions = {}): SeedTestDataBundle {
  const stations = seedStations({ count: options.stationCount ?? 3 });
  const routeCount = options.routeCount ?? 2;

  // The first route carries the line every arrival and alert rides, so the
  // bundle is coherent by construction rather than by convention.
  const routes = seedRoutes({
    count: routeCount,
    stops: stations.map((s) => s.id),
  });
  const primaryLine = routes[0]?.shortName ?? LINE_POOL[0];

  return {
    stations,
    routes,
    arrivals: seedArrivals({ count: options.arrivalCount ?? 3, line: primaryLine }),
    alerts: seedAlerts({ count: options.alertCount ?? 1, affectedLines: [primaryLine] }),
    trips: seedTrips({ count: options.tripCount ?? 2, line: primaryLine }),
  };
}
