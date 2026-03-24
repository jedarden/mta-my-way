/**
 * Trip lookup: find a trip by tripId across all cached GTFS-RT feeds.
 *
 * Scans all parsed feeds for a matching trip_update and returns
 * structured stop-by-stop progress data for the trip tracker.
 */

import type { StationIndex } from "@mta-my-way/shared";
import { getAllParsedFeeds } from "./cache.js";

// NYCT extension keys
const NYCT_TRIP_KEY = ".transit_realtime.nyctTripDescriptor";
const NYCT_STU_KEY = ".transit_realtime.nyctStopTimeUpdate";

export interface TripStopInfo {
  stopId: string;
  stationId: string | null;
  stationName: string;
  arrivalTime: number | null;
  departureTime: number | null;
  scheduledTrack: string | null;
  actualTrack: string | null;
}

export interface TripData {
  tripId: string;
  routeId: string;
  direction: "N" | "S" | null;
  destination: string;
  isAssigned: boolean;
  trainId: string | null;
  stops: TripStopInfo[];
  currentStopIndex: number;
  updatedAt: number;
  feedAge: number;
}

function toUnixSeconds(v: number | { toNumber(): number } | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : v.toNumber();
  return n === 0 ? null : n;
}

function resolveStationName(stationId: string | null, stations: StationIndex): string {
  if (!stationId || !stations[stationId]) return stationId ?? "Unknown";
  return stations[stationId].name;
}

/**
 * Build a reverse map from platform stop ID → station ID.
 * Reuses the same logic as the transformer but is self-contained here.
 */
function buildStopToStationIdMap(stations: StationIndex): Map<string, string> {
  const map = new Map<string, string>();
  for (const station of Object.values(stations)) {
    map.set(station.northStopId, station.id);
    map.set(station.southStopId, station.id);
  }
  return map;
}

/**
 * Infer direction from the first and last stop IDs.
 * NYCT platform stop IDs end in N or S.
 */
function inferDirection(stops: TripStopInfo[]): "N" | "S" | null {
  if (stops.length < 2) return null;
  const firstStopId = stops[0].stopId;
  if (firstStopId.endsWith("N")) return "N";
  if (firstStopId.endsWith("S")) return "S";
  return null;
}

/**
 * Find the current stop index: the last stop that has passed (departure in the past).
 * If no stops have passed, returns -1 (train hasn't departed yet).
 */
function findCurrentStopIndex(stops: TripStopInfo[], nowSeconds: number): number {
  let lastPassed = -1;
  for (let i = 0; i < stops.length; i++) {
    const departure = stops[i].departureTime ?? stops[i].arrivalTime;
    if (departure !== null && departure < nowSeconds) {
      lastPassed = i;
    }
  }
  return lastPassed;
}

/**
 * Look up a trip by tripId across all cached feeds.
 * Returns null if the trip is not found in any feed.
 */
export function lookupTrip(tripId: string, stations: StationIndex): TripData | null {
  const parsedFeeds = getAllParsedFeeds();
  const stopToStationId = buildStopToStationIdMap(stations);
  const nowSeconds = Math.floor(Date.now() / 1000);

  for (const [feedId, parsed] of parsedFeeds) {
    for (const entity of parsed.message.entity) {
      if (entity.isDeleted || !entity.tripUpdate) continue;

      const tu = entity.tripUpdate;
      const trip = tu.trip;
      if (!trip?.tripId || trip.tripId !== tripId) continue;

      const routeId = trip.routeId ?? "";

      // NYCT trip descriptor
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nyctTrip = (trip as any)[NYCT_TRIP_KEY] as
        | { isAssigned?: boolean | null; trainId?: string | null }
        | null
        | undefined;
      const isAssigned = nyctTrip?.isAssigned ?? false;
      const trainId = nyctTrip?.trainId ?? null;

      const stopTimeUpdates = tu.stopTimeUpdate ?? [];

      // Build stops array
      const stops: TripStopInfo[] = stopTimeUpdates.map((stu) => {
        const platformStopId = stu.stopId ?? "";
        const stationId = stopToStationId.get(platformStopId) ?? null;

        // NYCT stop time extension
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nyctStu = (stu as any)[NYCT_STU_KEY] as
          | { scheduledTrack?: string | null; actualTrack?: string | null }
          | null
          | undefined;

        return {
          stopId: platformStopId,
          stationId,
          stationName: resolveStationName(stationId, stations),
          arrivalTime: toUnixSeconds(stu.arrival?.time),
          departureTime: toUnixSeconds(stu.departure?.time),
          scheduledTrack: nyctStu?.scheduledTrack ?? null,
          actualTrack: nyctStu?.actualTrack ?? null,
        };
      });

      // Determine destination from the last stop
      const lastStop = stops[stops.length - 1];
      const destination = lastStop?.stationName ?? "";

      const direction = inferDirection(stops);
      const currentStopIndex = findCurrentStopIndex(stops, nowSeconds);

      // Feed age
      const feedTimestamp = Number(parsed.message.header.timestamp);
      const feedAge = nowSeconds - feedTimestamp;

      return {
        tripId,
        routeId,
        direction,
        destination,
        isAssigned,
        trainId,
        stops,
        currentStopIndex,
        updatedAt: nowSeconds,
        feedAge,
      };
    }
  }

  return null;
}
