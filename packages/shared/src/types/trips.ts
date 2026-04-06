/**
 * Trip tracking and commute journal types (Phase 5)
 */

/** Source of trip detection */
export type TripSource = "tracked" | "inferred" | "manual";

/**
 * A single trip record in the commute journal
 */
export interface TripRecord {
  /** Unique identifier (UUID) */
  id: string;
  /** ISO date string, e.g., "2024-03-15" */
  date: string;
  /** Origin station */
  origin: StationRef;
  /** Destination station */
  destination: StationRef;
  /** Line used for this trip */
  line: string;
  /** Departure time (POSIX timestamp) */
  departureTime: number;
  /** Arrival time (POSIX timestamp) */
  arrivalTime: number;
  /** Actual trip duration in minutes */
  actualDurationMinutes: number;
  /** Scheduled/expected duration in minutes (for delay calculation) */
  scheduledDurationMinutes?: number;
  /** How this trip was detected */
  source: TripSource;
  /** Optional user notes about this trip */
  notes?: string;
}

/**
 * Statistics for a specific commute route
 */
export interface CommuteStats {
  /** Associated commute ID */
  commuteId: string;
  /** Average duration in minutes */
  averageDurationMinutes: number;
  /** Median duration in minutes */
  medianDurationMinutes: number;
  /** Standard deviation in minutes */
  stdDevMinutes: number;
  /** Total trips recorded */
  totalTrips: number;
  /** Trips taken this week */
  tripsThisWeek: number;
  /** Percentage change vs prior 4-week average */
  trend: number;
  /** Average delay in minutes (positive = late, negative = early) */
  averageDelayMinutes: number;
  /** Maximum delay experienced in minutes */
  maxDelayMinutes: number;
  /** On-time arrival percentage (within 2 minutes of schedule) */
  onTimePercentage: number;
  /** Trip records (last 90 days, capped at 500) */
  records: TripRecord[];
}

/**
 * Live trip tracking state (Phase 5: "I'm on this train")
 */
export interface LiveTripState {
  /** GTFS trip ID being tracked */
  tripId: string;
  /** Line ID */
  line: string;
  /** Direction */
  direction: "N" | "S";
  /** Destination headsign */
  destination: string;
  /** Boarding station */
  boardAt: StationRef;
  /** Destination station (user-selected) */
  destinationStation: StationRef;
  /** Boarding time (POSIX timestamp) */
  boardTime: number;
  /** Stop-by-stop progress */
  stops: TripStopProgress[];
  /** Estimated arrival at destination (POSIX timestamp) */
  eta: number;
  /** When this state was last updated */
  updatedAt: number;
}

/**
 * Progress through a single stop on a tracked trip
 */
export interface TripStopProgress {
  /** Stop ID */
  stopId: string;
  /** Stop name */
  stopName: string;
  /** Stop status */
  status: "passed" | "current" | "next" | "upcoming" | "destination";
  /** Actual or estimated time at this stop (POSIX timestamp) */
  time?: number;
  /** Minutes away from current position (for upcoming stops) */
  minutesAway?: number;
}

/**
 * Shareable trip tracking page data
 */
export interface TripShareData {
  /** Trip ID (for API polling) */
  tripId: string;
  /** Line ID */
  line: string;
  /** Direction name (e.g., "Downtown & Brooklyn") */
  directionName: string;
  /** Destination headsign */
  destination: string;
  /** Current position stop name */
  currentStop?: string;
  /** Next stop name */
  nextStop?: string;
  /** ETA at final destination (POSIX timestamp) */
  eta?: number;
  /** Minutes until destination */
  minutesToDestination?: number;
  /** When this data was last updated */
  updatedAt: number;
  /** Expiration time (trip data is ephemeral) */
  expiresAt: number;
}

// Import StationRef from favorites module
import type { StationRef } from "./favorites.js";
