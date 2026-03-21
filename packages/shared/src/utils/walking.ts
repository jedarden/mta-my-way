/**
 * Walking distance and time calculation utilities (Phase 6)
 * Used for "Should I just walk?" feature
 */

/**
 * Earth's radius in kilometers
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Average walking speed in km/h
 * Used for time estimates (4.5 km/h is a comfortable walking pace)
 */
const WALKING_SPEED_KMH = 4.5;

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the Haversine distance between two coordinates
 * Returns distance in kilometers
 *
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate walking time between two coordinates
 * Returns time in minutes (rounded up)
 *
 * @param lat1 - Latitude of first point
 * @param lon1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lon2 - Longitude of second point
 * @returns Walking time in minutes
 */
export function walkingTime(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const distance = haversineDistance(lat1, lon1, lat2, lon2);
  const hours = distance / WALKING_SPEED_KMH;
  return Math.ceil(hours * 60);
}

/**
 * Calculate walking time from a pre-computed distance
 *
 * @param distanceKm - Distance in kilometers
 * @returns Walking time in minutes
 */
export function walkingTimeFromDistance(distanceKm: number): number {
  const hours = distanceKm / WALKING_SPEED_KMH;
  return Math.ceil(hours * 60);
}

/**
 * Interface for a station with coordinates
 */
export interface StationWithCoords {
  lat: number;
  lon: number;
}

/**
 * Calculate walking time between two station objects
 */
export function walkingTimeBetweenStations(
  station1: StationWithCoords,
  station2: StationWithCoords
): number {
  return walkingTime(station1.lat, station1.lon, station2.lat, station2.lon);
}

/**
 * Calculate walking distance between two station objects
 */
export function walkingDistanceBetweenStations(
  station1: StationWithCoords,
  station2: StationWithCoords
): number {
  return haversineDistance(
    station1.lat,
    station1.lon,
    station2.lat,
    station2.lon
  );
}

/**
 * Check if walking is a viable option
 * Viable if: walking time < 20 min AND trip is 3 or fewer stops
 *
 * @param walkingMinutes - Walking time in minutes
 * @param stopCount - Number of stops between origin and destination
 * @returns Whether walking should be suggested
 */
export function isWalkingViable(
  walkingMinutes: number,
  stopCount: number
): boolean {
  return walkingMinutes < 20 && stopCount <= 3;
}

/**
 * Compare walking vs transit time
 *
 * @param walkingMinutes - Walking time in minutes
 * @param waitMinutes - Wait time at station
 * @param rideMinutes - Ride time on train
 * @returns Comparison result
 */
export function compareWalkingVsTransit(
  walkingMinutes: number,
  waitMinutes: number,
  rideMinutes: number
): {
  walkingIsFaster: boolean;
  timeDifference: number;
  recommendation: "walk" | "transit" | "similar";
} {
  const transitMinutes = waitMinutes + rideMinutes;
  const timeDifference = transitMinutes - walkingMinutes;

  if (Math.abs(timeDifference) <= 2) {
    return {
      walkingIsFaster: false,
      timeDifference,
      recommendation: "similar",
    };
  }

  return {
    walkingIsFaster: walkingMinutes < transitMinutes,
    timeDifference: Math.abs(timeDifference),
    recommendation: walkingMinutes < transitMinutes ? "walk" : "transit",
  };
}

/**
 * Format walking distance for display
 */
export function formatWalkingDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}

/**
 * Format walking time for display
 */
export function formatWalkingTime(minutes: number): string {
  if (minutes < 1) {
    return "<1 min walk";
  }
  if (minutes === 1) {
    return "1 min walk";
  }
  return `${minutes} min walk`;
}
