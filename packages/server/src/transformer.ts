/**
 * Feed transformer: converts parsed GTFS-RT FeedMessages into StationArrivals.
 *
 * For each trip update in all active feeds:
 *   - Extracts route ID, NYCT assignment/direction extensions
 *   - Maps platform stop IDs (e.g. "725N") to parent stations + direction
 *   - Builds ArrivalTime objects sorted by arrival time
 *   - Groups into StationArrivals indexed by stationId
 *
 * The transformer is stateless — it produces a fresh Map on each call.
 */

import type {
  StationArrivals,
  ArrivalTime,
  Direction,
  StationIndex,
} from "@mta-my-way/shared";
import { calculateConfidence } from "@mta-my-way/shared";
import type { ParsedFeed } from "./parser.js";

// NYCT extension keys as used in protobufjs decoded objects
const NYCT_TRIP_KEY = ".transit_realtime.nyctTripDescriptor";
const NYCT_STU_KEY = ".transit_realtime.nyctStopTimeUpdate";

interface StopInfo {
  stationId: string;
  direction: Direction;
}

/**
 * Build a reverse map from platform stop ID → { stationId, direction }.
 * For example: "725N" → { stationId: "725", direction: "N" }
 *
 * Must be called once at startup after loading stations.json.
 */
export function buildStopToStationMap(
  stations: StationIndex
): Map<string, StopInfo> {
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
function toUnixSeconds(
  v: number | { toNumber(): number } | null | undefined
): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : v.toNumber();
  return n === 0 ? null : n;
}

/**
 * Transform all currently-active parsed feeds into a StationArrivals map.
 *
 * @param parsedFeeds  Map of feedId → ParsedFeed (last-good for each feed)
 * @param stations     GTFS static station index
 * @param stopToStation Reverse map from platform stop ID → station+direction
 * @param feedAges     Map of feedId → seconds since last successful poll
 */
export function transformFeeds(
  parsedFeeds: Map<string, ParsedFeed>,
  stations: StationIndex,
  stopToStation: Map<string, StopInfo>,
  feedAges: Map<string, number>
): Map<string, StationArrivals> {
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Filter out arrivals more than 30 seconds in the past (already boarded)
  const cutoffSeconds = nowSeconds - 30;

  // Accumulate arrivals: stationId → { N: [], S: [] }
  const raw = new Map<string, { N: ArrivalTime[]; S: ArrivalTime[] }>();

  for (const [feedId, parsed] of parsedFeeds) {
    const feedAge = feedAges.get(feedId) ?? 0;

    for (const entity of parsed.message.entity) {
      if (entity.isDeleted || !entity.tripUpdate) continue;

      const tu = entity.tripUpdate;
      const trip = tu.trip;
      if (!trip?.routeId) continue;

      const routeId = trip.routeId;
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
      const lastStopInfo = lastStu?.stopId
        ? stopToStation.get(lastStu.stopId)
        : null;
      const destination = lastStopInfo
        ? (stations[lastStopInfo.stationId]?.name ?? "")
        : "";

      for (const stu of stopTimeUpdates) {
        if (!stu.stopId) continue;

        const stopInfo = stopToStation.get(stu.stopId);
        if (!stopInfo) continue;

        // Prefer arrival time; fall back to departure time
        const arrivalSeconds =
          toUnixSeconds(stu.arrival?.time) ??
          toUnixSeconds(stu.departure?.time);
        if (arrivalSeconds === null || arrivalSeconds < cutoffSeconds) continue;

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
          tripId: trip.tripId ?? "",
          destination,
          confidence: calculateConfidence(routeId, isAssigned ?? false),
          feedName: feedId,
          feedAge,
        };

        const key = stopInfo.stationId;
        if (!raw.has(key)) raw.set(key, { N: [], S: [] });
        raw.get(key)![stopInfo.direction].push(arrival);
      }
    }
  }

  // Build final StationArrivals, sorted by arrival time
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
      allArrivals.length > 0
        ? Math.max(...allArrivals.map((a) => a.feedAge))
        : 0;

    result.set(stationId, {
      stationId,
      stationName: station.name,
      updatedAt,
      feedAge: stationFeedAge,
      northbound: dirs.N,
      southbound: dirs.S,
      alerts: [], // Phase 3: alert parsing not yet implemented
    });
  }

  return result;
}
