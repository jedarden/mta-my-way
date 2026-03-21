/**
 * Nearby stations finder utility.
 *
 * Uses Haversine distance to find the closest stations to a given coordinate.
 */

import { haversineDistance } from "@mta-my-way/shared";
import type { Station, StationComplex } from "./api";

export interface NearbyStation {
  /** Station ID */
  stationId: string;
  /** Station display name */
  stationName: string;
  /** Lines serving this station */
  lines: string[];
  /** Distance in kilometers */
  distanceKm: number;
  /** Walking time in minutes */
  walkingMinutes: number;
  /** Borough */
  borough: string;
}

/** Walking speed in km/h */
const WALKING_SPEED_KMH = 4.5;

/**
 * Find the nearest stations to a given coordinate.
 *
 * @param lat - User latitude
 * @param lon - User longitude
 * @param stations - All stations
 * @param complexes - Station complexes (for deduplication)
 * @param maxStations - Maximum number of stations to return (default: 3)
 * @param maxDistanceKm - Maximum distance in km (default: 2.0, ~25 min walk)
 * @returns Sorted array of nearby stations
 */
export function findNearbyStations(
  lat: number,
  lon: number,
  stations: Station[],
  complexes: StationComplex[],
  maxStations: number = 3,
  maxDistanceKm: number = 2.0
): NearbyStation[] {
  // Build stationId → complex lookup for deduplication
  const stationToComplex = new Map<string, StationComplex>();
  for (const complex of complexes) {
    for (const stationId of complex.stations) {
      stationToComplex.set(stationId, complex);
    }
  }

  // Calculate distance for each station
  const stationsWithDistance: NearbyStation[] = stations.map((station) => {
    const distanceKm = haversineDistance(lat, lon, station.lat, station.lon);
    const walkingMinutes = Math.ceil((distanceKm / WALKING_SPEED_KMH) * 60);

    return {
      stationId: station.id,
      stationName: station.name,
      lines: station.lines,
      distanceKm,
      walkingMinutes,
      borough: station.borough,
    };
  });

  // Sort by distance
  stationsWithDistance.sort((a, b) => a.distanceKm - b.distanceKm);

  // Filter to max distance and deduplicate by complex
  const seen = new Set<string>();
  const result: NearbyStation[] = [];

  for (const station of stationsWithDistance) {
    if (station.distanceKm > maxDistanceKm) break;
    if (result.length >= maxStations) break;

    // If this station is part of a complex, check if we've already included it
    const complex = stationToComplex.get(station.stationId);
    const dedupeKey = complex ? `complex:${complex.complexId}` : `station:${station.stationId}`;

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      // If part of a complex, use the complex name and include all lines
      if (complex) {
        result.push({
          ...station,
          stationName: complex.name,
          lines: complex.allLines,
        });
      } else {
        result.push(station);
      }
    }
  }

  return result;
}

/**
 * Check if coordinates are likely within NYC area.
 * Used to determine if we should show nearby stations or fall back to search.
 *
 * NYC rough bounds:
 * - North: 40.9176 (Yonkers border)
 * - South: 40.4962 (Brooklyn south shore)
 * - West: -74.2557 (Staten Island west)
 * - East: -73.7004 (Queens east)
 *
 * @param lat - Latitude
 * @param lon - Longitude
 * @returns Whether coordinates are in NYC area
 */
export function isInNYCArea(lat: number, lon: number): boolean {
  return lat >= 40.49 && lat <= 40.92 && lon >= -74.26 && lon <= -73.7;
}

/**
 * Format distance for display.
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 0.1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  if (distanceKm < 1) {
    return `${(distanceKm * 1000).toFixed(0)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}
