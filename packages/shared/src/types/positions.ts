/**
 * Train position types for live diagram (Phase 6)
 * Derived from VehiclePosition data in GTFS-RT feeds
 */

/** Vehicle status from GTFS-RT */
export type VehicleStatus = "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";

/**
 * Position of a single train on a line
 */
export interface TrainPosition {
  /** GTFS trip ID */
  tripId: string;
  /** Route/line ID */
  routeId: string;
  /** Direction: N or S */
  direction: "N" | "S";
  /** Current stop sequence number */
  currentStopSequence: number;
  /** Current status */
  status: VehicleStatus;
  /** Current stop ID (where train is or heading to) */
  currentStopId: string;
  /** Timestamp of this position update (POSIX) */
  timestamp: number;
  /** Whether the train is assigned */
  isAssigned: boolean;
  /** Destination headsign */
  destination: string;
  /** Delay in seconds (negative = early, 0 = on time) */
  delay?: number;
}

/**
 * All train positions for a single line
 */
export interface LinePositions {
  /** Route/line ID */
  routeId: string;
  /** When this data was fetched (POSIX timestamp) */
  fetchedAt: number;
  /** Feed age in seconds */
  feedAge: number;
  /** All trains on this line */
  trains: TrainPosition[];
}

/**
 * Train position interpolated for display on a line diagram
 */
export interface InterpolatedTrainPosition {
  /** Trip ID */
  tripId: string;
  /** Route ID */
  routeId: string;
  /** Direction */
  direction: "N" | "S";
  /** Stop ID of the last passed station */
  lastStopId: string;
  /** Stop ID of the next station */
  nextStopId: string;
  /** Progress between stops (0.0 = at last, 1.0 = at next) */
  progress: number;
  /** Destination headsign */
  destination: string;
  /** Whether this is the user's next train (highlighted) */
  isUserNextTrain?: boolean;
  /** Assignment status */
  isAssigned: boolean;
  /** Delay in seconds if available */
  delay?: number;
}

/**
 * Line diagram data for rendering
 */
export interface LineDiagramData {
  /** Route ID */
  routeId: string;
  /** Route color (hex) */
  routeColor: string;
  /** Ordered list of stops on this line */
  stops: Array<{
    stopId: string;
    stopName: string;
    isTerminal: boolean;
    isTransferStation: boolean;
    transferLines?: string[];
  }>;
  /** Train positions interpolated for display */
  trains: InterpolatedTrainPosition[];
  /** When this data was computed (POSIX timestamp) */
  computedAt: number;
}
