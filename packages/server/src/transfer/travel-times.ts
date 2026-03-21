/**
 * Travel times loader and indexer
 *
 * Loads scheduled inter-station travel times from travel-times.json and
 * provides efficient lookup by route and stop pair.
 *
 * Travel times are indexed by:
 *   routeId -> fromStopId -> toStopId -> seconds
 *
 * This allows quick lookup of travel time between any two consecutive stops
 * on a route, which is used for estimating total travel time for a journey.
 */

import type { TravelTimeIndex } from "@mta-my-way/shared";

/** Default inter-station travel time (2 minutes) when not in schedule */
const DEFAULT_INTERSTATION_SECONDS = 120;

/**
 * Travel times data structure from travel-times.json
 * Format: { routeId: { fromStopId: { toStopId: seconds } } }
 */
type TravelTimesData = Record<string, Record<string, Record<string, number>>>;

let travelTimesCache: TravelTimeIndex | null = null;

/**
 * Load travel times from JSON file
 * Call this at server startup
 */
export async function loadTravelTimes(dataPath: string): Promise<TravelTimeIndex> {
  if (travelTimesCache) {
    return travelTimesCache;
  }

  const { readFile } = await import("node:fs/promises");
  const data = await readFile(dataPath, "utf-8");
  const parsed = JSON.parse(data) as TravelTimesData;

  // The data is already in the correct format, just cast it
  travelTimesCache = parsed as TravelTimeIndex;

  return travelTimesCache;
}

/**
 * Get the loaded travel times index
 * Returns null if not loaded yet
 */
export function getTravelTimes(): TravelTimeIndex | null {
  return travelTimesCache;
}

/**
 * Get travel time between two stops on a specific route
 *
 * @param travelTimes - The travel times index
 * @param routeId - The route ID (e.g., "1", "A", "F")
 * @param fromStopId - Origin stop ID (parent station ID, e.g., "127")
 * @param toStopId - Destination stop ID (parent station ID)
 * @returns Travel time in seconds, or default if not found
 */
export function getTravelTime(
  travelTimes: TravelTimeIndex,
  routeId: string,
  fromStopId: string,
  toStopId: string
): number {
  const routeTimes = travelTimes[routeId];
  if (!routeTimes) {
    return DEFAULT_INTERSTATION_SECONDS;
  }

  const fromTimes = routeTimes[fromStopId];
  if (!fromTimes) {
    return DEFAULT_INTERSTATION_SECONDS;
  }

  return fromTimes[toStopId] ?? DEFAULT_INTERSTATION_SECONDS;
}

/**
 * Calculate total travel time between two stations on a specific route
 *
 * This sums up the inter-station times for all stops between origin and
 * destination on the route's stop sequence.
 *
 * @param travelTimes - The travel times index
 * @param route - The route with its stop sequence
 * @param originStationId - Origin station ID
 * @param destinationStationId - Destination station ID
 * @returns Total travel time in seconds
 */
export function calculateRouteTravelTime(
  travelTimes: TravelTimeIndex,
  routeId: string,
  routeStops: string[],
  originStationId: string,
  destinationStationId: string
): number {
  // Find indices of origin and destination in the route's stop sequence
  const originIndex = routeStops.indexOf(originStationId);
  const destinationIndex = routeStops.indexOf(destinationStationId);

  if (originIndex === -1 || destinationIndex === -1) {
    // One or both stations not on this route
    return estimateTravelTimeByStops(routeStops.length);
  }

  // Calculate direction of travel
  const isForward = destinationIndex > originIndex;

  if (!isForward && originIndex === destinationIndex) {
    return 0; // Same station
  }

  // Sum up travel times between consecutive stops
  let totalSeconds = 0;

  if (isForward) {
    // Traveling forward through the route
    for (let i = originIndex; i < destinationIndex; i++) {
      const fromStop = routeStops[i];
      const toStop = routeStops[i + 1];
      if (fromStop && toStop) {
        totalSeconds += getTravelTime(travelTimes, routeId, fromStop, toStop);
      }
    }
  } else {
    // Traveling backward through the route
    for (let i = originIndex; i > destinationIndex; i--) {
      const fromStop = routeStops[i];
      const toStop = routeStops[i - 1];
      if (fromStop && toStop) {
        totalSeconds += getTravelTime(travelTimes, routeId, fromStop, toStop);
      }
    }
  }

  return totalSeconds;
}

/**
 * Estimate travel time based on number of stops
 * Used as fallback when specific travel times aren't available
 *
 * Assumes ~2 minutes per stop on average
 */
export function estimateTravelTimeByStops(numStops: number): number {
  // Average of 2 minutes per stop
  const avgSecondsPerStop = 120;
  // Assume a typical route has ~20 stops for estimation
  return Math.max(numStops * avgSecondsPerStop, 120);
}

/**
 * Calculate the number of stops between two stations on a route
 *
 * @param routeStops - The route's stop sequence
 * @param originStationId - Origin station ID
 * @param destinationStationId - Destination station ID
 * @returns Number of stops (0 if same station, -1 if not on route)
 */
export function countStopsBetween(
  routeStops: string[],
  originStationId: string,
  destinationStationId: string
): number {
  const originIndex = routeStops.indexOf(originStationId);
  const destinationIndex = routeStops.indexOf(destinationStationId);

  if (originIndex === -1 || destinationIndex === -1) {
    return -1;
  }

  return Math.abs(destinationIndex - originIndex);
}

/**
 * Determine the direction of travel between two stations on a route
 *
 * @param routeStops - The route's stop sequence
 * @param originStationId - Origin station ID
 * @param destinationStationId - Destination station ID
 * @returns "N" for northbound (backward in sequence), "S" for southbound (forward), or null
 */
export function determineDirection(
  routeStops: string[],
  originStationId: string,
  destinationStationId: string
): "N" | "S" | null {
  const originIndex = routeStops.indexOf(originStationId);
  const destinationIndex = routeStops.indexOf(destinationStationId);

  if (originIndex === -1 || destinationIndex === -1) {
    return null;
  }

  // In GTFS, stops are typically listed from north to south or terminal to terminal
  // So if destination index > origin index, we're going "south" (forward in the list)
  // This is a simplification; actual direction depends on the specific route
  return destinationIndex > originIndex ? "S" : "N";
}

/**
 * Check if a route serves both origin and destination stations
 */
export function routeServesBoth(
  routeStops: string[],
  originStationId: string,
  destinationStationId: string
): boolean {
  return routeStops.includes(originStationId) && routeStops.includes(destinationStationId);
}
