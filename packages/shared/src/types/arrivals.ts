/**
 * Real-time arrival data types returned from the backend API
 */

/** Direction indicator for subway trains */
export type Direction = "N" | "S";

/** Confidence level based on division and assignment status */
export type ConfidenceLevel = "high" | "medium" | "low";

/**
 * A single arrival time at a station
 */
export interface ArrivalTime {
  /** Route ID, e.g., "1", "A", "F" */
  line: string;
  /** Direction: N = Northbound, S = Southbound */
  direction: Direction;
  /** POSIX timestamp of predicted arrival */
  arrivalTime: number;
  /** Computed convenience field: minutes until arrival */
  minutesAway: number;
  /** Whether a train is physically assigned to this trip */
  isAssigned: boolean;
  /** Whether actual_track differs from scheduled_track (reroute detected) */
  isRerouted: boolean;
  /** Whether this trip is running express (skipping stops the route normally serves) */
  isExpress: boolean;
  /** GTFS trip ID for tracking the same train across refreshes */
  tripId: string;
  /** Terminal station name (headsign) */
  destination: string;
  /** Confidence level based on division + assignment status:
   * - high = A Division + assigned
   * - medium = A Division + unassigned, or B Division + assigned
   * - low = B Division + unassigned
   */
  confidence: ConfidenceLevel;
  /** Which GTFS-RT feed this arrival came from, e.g., "gtfs-bdfm" */
  feedName: string;
  /** Seconds since this feed was last successfully polled */
  feedAge: number;
}

/**
 * Arrival data for a single station, organized by direction
 */
export interface StationArrivals {
  /** Parent station ID, e.g., "725" */
  stationId: string;
  /** Station display name, e.g., "Times Sq-42 St" */
  stationName: string;
  /** POSIX timestamp of last feed parse */
  updatedAt: number;
  /** Seconds since MTA generated this data */
  feedAge: number;
  /** Northbound arrivals sorted by arrival time */
  northbound: ArrivalTime[];
  /** Southbound arrivals sorted by arrival time */
  southbound: ArrivalTime[];
  /** Alerts affecting this station */
  alerts: StationAlert[];
  /** Equipment status at this station (Phase 6) */
  equipment?: EquipmentStatus[];
}

// Import StationAlert and EquipmentStatus from their own modules
// These are re-exported for convenience
import type { StationAlert } from "./alerts.js";
import type { EquipmentStatus } from "./equipment.js";
