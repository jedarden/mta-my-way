/**
 * Commute analysis types (Phase 2: Transfer Analysis)
 */

import type { ArrivalTime, Direction } from "./arrivals.js";
import type { StationRef } from "./favorites.js";

/**
 * A direct route (single line, no transfer)
 */
export interface DirectRoute {
  /** Line ID, e.g., "F" */
  line: string;
  /** Direction */
  direction: Direction;
  /** Next 3 arrivals at origin */
  nextArrivals: ArrivalTime[];
  /** Estimated travel time in minutes */
  estimatedTravelMinutes: number;
  /** Estimated arrival at destination (POSIX timestamp) */
  estimatedArrivalAtDestination: number;
}

/**
 * A single leg of a transfer route
 */
export interface TransferLeg {
  /** Line ID */
  line: string;
  /** Direction */
  direction: Direction;
  /** Boarding station */
  boardAt: StationRef;
  /** Alighting station (where transfer occurs or final destination) */
  alightAt: StationRef;
  /** Next arrival at boarding station */
  nextArrival: ArrivalTime;
  /** Estimated travel time for this leg in minutes */
  estimatedTravelMinutes: number;
}

/**
 * A route requiring one or more transfers
 */
export interface TransferRoute {
  /** Legs of the journey (2 legs = 1 transfer, 3 legs = 2 transfers) */
  legs: TransferLeg[];
  /** Total estimated time in minutes */
  totalEstimatedMinutes: number;
  /** Estimated arrival at destination (POSIX timestamp) */
  estimatedArrivalAtDestination: number;
  /** Minutes saved compared to best direct route (negative = slower) */
  timeSavedVsDirect: number;
  /** Primary transfer station (first transfer point) */
  transferStation: StationRef;
}

/**
 * Enhanced recommendation details for transfer decisions
 */
export interface RecommendationDetails {
  /** The recommended route type */
  type: "direct" | "transfer" | "walk";
  /** Human-readable reason for the recommendation */
  reason: string;
  /** Confidence level in the recommendation */
  confidence: "high" | "medium" | "low";
  /** Risk factors to consider (e.g., "B Division uncertainty", "Long wait at transfer") */
  risks: string[];
  /** Minutes saved by following this recommendation (0 if no savings) */
  timeSavedMinutes: number;
  /** Whether this recommendation is based on stale data */
  isStale: boolean;
}

/**
 * Complete commute analysis result
 */
export interface CommuteAnalysis {
  /** Associated commute ID */
  commuteId: string;
  /** Origin station */
  origin: StationRef;
  /** Destination station */
  destination: StationRef;
  /** All direct routes between origin and destination */
  directRoutes: DirectRoute[];
  /** All transfer routes (1+ transfers) */
  transferRoutes: TransferRoute[];
  /** Recommended route type (simplified, for backward compatibility) */
  recommendation: "direct" | "transfer";
  /** Enhanced recommendation details with reasoning */
  recommendationDetails: RecommendationDetails;
  /** When this analysis was computed (POSIX timestamp) */
  timestamp: number;
  /** Walking comparison for short trips (Phase 6) */
  walkingOption?: WalkingOption;
}

/**
 * Walking vs transit comparison (Phase 6)
 */
export interface WalkingOption {
  /** Walking distance in kilometers */
  distanceKm: number;
  /** Estimated walking time in minutes */
  walkingMinutes: number;
  /** Transit time in minutes (best option) */
  transitMinutes: number;
  /** Whether walking is faster than waiting */
  walkingIsFaster: boolean;
  /** Reason to show walking option */
  reason: "short_trip" | "delays" | "always";
}

/**
 * Express/local detection (Phase 2)
 */
export interface ServicePattern {
  /** Trip ID */
  tripId: string;
  /** Line ID */
  line: string;
  /** Whether this is express service */
  isExpress: boolean;
  /** Stops being skipped (for express) */
  skippedStops: string[];
}

/**
 * Transfer recommendation with context
 */
export interface TransferRecommendation {
  /** The transfer route being recommended */
  route: TransferRoute;
  /** Why this transfer is recommended */
  reason: string;
  /** Confidence in the recommendation (based on data freshness) */
  confidence: "high" | "medium" | "low";
  /** Risk factors (e.g., "B Division prediction uncertainty") */
  risks: string[];
}
