/**
 * Feed transformer: converts parsed GTFS-RT FeedMessages into StationArrivals.
 *
 * For each trip update in all active feeds:
 *   - Extracts route ID, NYCT assignment/direction extensions
 *   - Maps platform stop IDs (e.g. "725N") to parent stations + direction
 *   - Detects express service by comparing trip stops vs route's full stop list
 *   - Builds ArrivalTime objects sorted by arrival time
 *   - Groups into StationArrivals indexed by stationId
 *
 * Cancelled trip detection (NYCT trip_replacement_period):
 *   - The NYCT feed header declares replacement windows per route. Within a window
 *     the feed is authoritative: any trip present in the previous poll but absent
 *     now, whose expected arrival falls inside the window, is emitted as Cancelled.
 *   - Module-level state (prevTripStops) is maintained across calls to enable this
 *     cross-poll comparison. Call resetTransformerState() in tests to isolate state.
 */

import type {
  ArrivalTime,
  Direction,
  RouteIndex,
  StationArrivals,
  StationIndex,
} from "@mta-my-way/shared";
import { calculateConfidence } from "@mta-my-way/shared";
import type { ParsedFeed, TripReplacementWindow } from "./parser.js";
import { detectExpressService } from "./transfer/engine.js";

// NYCT extension keys as used in protobufjs decoded objects
const NYCT_TRIP_KEY = ".transit_realtime.nyctTripDescriptor";
const NYCT_STU_KEY = ".transit_realtime.nyctStopTimeUpdate";

interface StopInfo {
  stationId: string;
  direction: Direction;
}

/** Per-stop snapshot stored for cancelled trip detection across consecutive polls. */
interface PrevTripStop {
  stationId: string;
  direction: Direction;
  arrivalTime: number;
  destination: string;
  routeId: string;
  feedId: string;
}

/**
 * State from the previous transformFeeds call.
 * Maps tripId → its remaining stop-time entries as of the last poll.
 * Entries are pruned when all their arrival times are in the past.
 */
const prevTripStops = new Map<string, PrevTripStop[]>();

/** Reset module-level state between test runs. */
export function resetTransformerState(): void {
  prevTripStops.clear();
}

/**
 * Build a reverse map from platform stop ID → { stationId, direction }.
 * For example: "725N" → { stationId: "725", direction: "N" }
 *
 * Must be called once at startup after loading stations.json.
 */
export function buildStopToStationMap(stations: StationIndex): Map<string, StopInfo> {
  const map = new Map<string, StopInfo>();
  for (const station of Object.values(stations)) {
    map.set(station.northStopId, {
      stationId: station.id,
      direction: "N",
    });
    map.set(station.southStopId, {
      stationId: station.id,
      direction: "S",
    });
  }
  return map;
}

/**
 * Safely convert a protobufjs Long or number to a JavaScript number.
 * Returns null if the value is null, undefined, or zero (unset).
 */
function toUnixSeconds(v: number | { toNumber(): number } | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : v.toNumber();
  return n === 0 ? null : n;
}

/**
 * Find the replacement window that applies to a given routeId.
 * Precedence: exact match > "*" > null (covers all routes).
 */
function findWindow(
  windows: TripReplacementWindow[],
  routeId: string
): TripReplacementWindow | undefined {
  return (
    windows.find((w) => w.routeId === routeId) ??
    windows.find((w) => w.routeId === "*") ??
    windows.find((w) => w.routeId === null) ??
    windows[0]
  );
}

/**
 * Transform all currently-active parsed feeds into a StationArrivals map.
 *
 * @param parsedFeeds  Map of feedId → ParsedFeed (last-good for each feed)
 * @param stations     GTFS static station index
 * @param routes       GTFS static route index (for express detection)
 * @param stopToStation Reverse map from platform stop ID → station+direction
 * @param feedAges     Map of feedId → seconds since last successful poll
 */
export function transformFeeds(
  parsedFeeds: Map<string, ParsedFeed>,
  stations: StationIndex,
  routes: RouteIndex,
  stopToStation: Map<string, StopInfo>,
  feedAges: Map<string, number>
): Map<string, StationArrivals> {
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Filter out arrivals more than 30 seconds in the past (already boarded)
  const cutoffSeconds = nowSeconds - 30;

  // Accumulate arrivals: stationId → { N: [], S: [] }
  const raw = new Map<string, { N: ArrivalTime[]; S: ArrivalTime[] }>();

  // -------------------------------------------------------------------------
  // Cancelled trip detection (NYCT trip_replacement_period)
  // -------------------------------------------------------------------------

  // Snapshot prevTripStops before clearing entries for active feeds, so we can
  // compare what was present last poll against what's present this poll.
  const prevSnapshot = new Map(prevTripStops);

  // Clear entries belonging to feeds that are currently active — they will be
  // rebuilt from fresh data in the main processing loop below.
  const activeFeedIds = new Set(parsedFeeds.keys());
  const toEvict: string[] = [];
  for (const [tripId, stops] of prevTripStops) {
    if (stops.length > 0 && activeFeedIds.has(stops[0]!.feedId)) {
      toEvict.push(tripId);
    }
  }
  for (const tripId of toEvict) prevTripStops.delete(tripId);

  // Build a set of tripIds present in the current feed payload.
  const currentTripIds = new Set<string>();
  for (const [, parsed] of parsedFeeds) {
    for (const entity of parsed.message.entity) {
      const tripId = entity.isDeleted ? null : entity.tripUpdate?.trip?.tripId;
      if (tripId) currentTripIds.add(tripId);
    }
  }

  // Build per-feed replacement windows for quick lookup.
  const feedWindows = new Map<string, TripReplacementWindow[]>();
  for (const [feedId, parsed] of parsedFeeds) {
    feedWindows.set(feedId, parsed.tripReplacementPeriods);
  }

  // For each trip in the previous snapshot that is no longer present, check
  // whether it falls inside the replacement window → emit as Cancelled.
  for (const [tripId, stops] of prevSnapshot) {
    if (currentTripIds.has(tripId)) continue; // still running
    if (stops.length === 0) continue;

    const feedId = stops[0]!.feedId;
    // Only detect cancellations in feeds that are currently delivering data.
    if (!parsedFeeds.has(feedId)) continue;

    const windows = feedWindows.get(feedId) ?? [];
    if (windows.length === 0) continue; // feed has no replacement period

    const routeId = stops[0]!.routeId;
    const window = findWindow(windows, routeId);
    if (!window) continue;

    for (const stop of stops) {
      // Skip stops already in the past or beyond the replacement window.
      if (stop.arrivalTime < cutoffSeconds) continue;
      if (stop.arrivalTime > window.end) continue;

      const minutesAway = Math.round((stop.arrivalTime - nowSeconds) / 60);
      if (minutesAway < 0) continue;

      const arrival: ArrivalTime = {
        line: stop.routeId,
        direction: stop.direction,
        arrivalTime: stop.arrivalTime,
        minutesAway,
        isAssigned: false,
        isRerouted: false,
        isExpress: false,
        tripId,
        destination: stop.destination,
        confidence: "low",
        feedName: feedId,
        feedAge: feedAges.get(feedId) ?? 0,
        isCancelled: true,
      };

      const key = stop.stationId;
      if (!raw.has(key)) raw.set(key, { N: [], S: [] });
      raw.get(key)![stop.direction].push(arrival);
    }
  }

  // -------------------------------------------------------------------------
  // Normal trip processing
  // -------------------------------------------------------------------------

  for (const [feedId, parsed] of parsedFeeds) {
    const feedAge = feedAges.get(feedId) ?? 0;

    for (const entity of parsed.message.entity) {
      if (entity.isDeleted || !entity.tripUpdate) continue;

      const tu = entity.tripUpdate;
      const trip = tu.trip;
      if (!trip?.routeId) continue;

      const routeId = trip.routeId;
      const tripId = trip.tripId ?? "";
      const stopTimeUpdates = tu.stopTimeUpdate ?? [];

      // NYCT trip descriptor extension
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nyctTrip = (trip as any)[NYCT_TRIP_KEY] as
        | { isAssigned?: boolean | null; trainId?: string | null }
        | null
        | undefined;
      const isAssigned = nyctTrip?.isAssigned ?? false;

      // Destination: name of the terminal stop (last in the update list)
      const lastStu = stopTimeUpdates[stopTimeUpdates.length - 1];
      const lastStopInfo = lastStu?.stopId ? stopToStation.get(lastStu.stopId) : null;
      const destination = lastStopInfo ? (stations[lastStopInfo.stationId]?.name ?? "") : "";

      // Detect express service: compare trip stops vs route's full stop list
      const route = routes[routeId];
      let tripIsExpress = false;
      if (route && stopTimeUpdates.length >= 2 && lastStopInfo) {
        const tripStopIds = stopTimeUpdates
          .map((stu) => {
            const info = stu.stopId ? stopToStation.get(stu.stopId) : null;
            return info?.stationId ?? null;
          })
          .filter((id): id is string => id !== null);
        const firstStop = tripStopIds[0] ?? "";
        const lastStop = tripStopIds[tripStopIds.length - 1] ?? "";
        const result = detectExpressService(tripStopIds, route.stops, firstStop, lastStop);
        tripIsExpress = result.isExpress;
      }

      // Collect stop data for this trip for next-poll cancelled detection.
      const tripStopsForState: PrevTripStop[] = [];

      for (const stu of stopTimeUpdates) {
        if (!stu.stopId) continue;

        const stopInfo = stopToStation.get(stu.stopId);
        if (!stopInfo) continue;

        // Prefer arrival time; fall back to departure time
        const arrivalSeconds =
          toUnixSeconds(stu.arrival?.time) ?? toUnixSeconds(stu.departure?.time);
        if (arrivalSeconds === null || arrivalSeconds < cutoffSeconds) continue;

        // Store for cancellation detection on next poll.
        tripStopsForState.push({
          stationId: stopInfo.stationId,
          direction: stopInfo.direction,
          arrivalTime: arrivalSeconds,
          destination,
          routeId,
          feedId,
        });

        const minutesAway = Math.round((arrivalSeconds - nowSeconds) / 60);
        if (minutesAway < 0) continue;

        // NYCT stop time extension: detect rerouting
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nyctStu = (stu as any)[NYCT_STU_KEY] as
          | {
              scheduledTrack?: string | null;
              actualTrack?: string | null;
            }
          | null
          | undefined;
        const isRerouted =
          nyctStu?.scheduledTrack != null &&
          nyctStu?.actualTrack != null &&
          nyctStu.scheduledTrack !== nyctStu.actualTrack;

        const arrival: ArrivalTime = {
          line: routeId,
          direction: stopInfo.direction,
          arrivalTime: arrivalSeconds,
          minutesAway,
          isAssigned: isAssigned ?? false,
          isRerouted: isRerouted ?? false,
          isExpress: tripIsExpress,
          tripId,
          destination,
          confidence: calculateConfidence(routeId, isAssigned ?? false),
          feedName: feedId,
          feedAge,
        };

        const key = stopInfo.stationId;
        if (!raw.has(key)) raw.set(key, { N: [], S: [] });
        raw.get(key)![stopInfo.direction].push(arrival);
      }

      // Register this trip's stops for next-poll cancellation detection.
      if (tripId && tripStopsForState.length > 0) {
        prevTripStops.set(tripId, tripStopsForState);
      }
    }
  }

  // Prune stale prevTripStops entries (all stops now in the past).
  const toStale: string[] = [];
  for (const [tripId, stops] of prevTripStops) {
    if (!stops.some((s) => s.arrivalTime >= cutoffSeconds)) {
      toStale.push(tripId);
    }
  }
  for (const tripId of toStale) prevTripStops.delete(tripId);

  // -------------------------------------------------------------------------
  // Build final StationArrivals, sorted by arrival time
  // -------------------------------------------------------------------------

  const updatedAt = nowSeconds;
  const result = new Map<string, StationArrivals>();

  for (const [stationId, dirs] of raw) {
    const station = stations[stationId];
    if (!station) continue;

    dirs.N.sort((a, b) => a.arrivalTime - b.arrivalTime);
    dirs.S.sort((a, b) => a.arrivalTime - b.arrivalTime);

    // Overall feedAge = oldest feed contributing arrivals to this station
    const allArrivals = [...dirs.N, ...dirs.S];
    const stationFeedAge =
      allArrivals.length > 0 ? Math.max(...allArrivals.map((a) => a.feedAge)) : 0;

    result.set(stationId, {
      stationId,
      stationName: station.name,
      updatedAt,
      feedAge: stationFeedAge,
      northbound: dirs.N,
      southbound: dirs.S,
      alerts: [], // Alerts are served via /api/alerts, not embedded per-station
    });
  }

  return result;
}
