/**
 * useWalkComparison — computes walking vs transit comparison for short commutes.
 *
 * Uses station coordinates from useStationIndex and the shared walking utilities
 * (haversine distance at 4.5 km/h) to determine if walking is faster than transit.
 */

import { useMemo } from "react";
import type { CommuteAnalysis } from "@mta-my-way/shared";
import {
  compareWalkingVsTransit,
  formatWalkingDistance,
  formatWalkingTime,
  haversineDistance,
  isWalkingViable,
  walkingTimeFromDistance,
} from "@mta-my-way/shared";
import { useStationIndex } from "./useStationIndex";

export interface WalkComparisonResult {
  /** Whether the comparison is available (stations loaded, coords found) */
  available: boolean;
  /** Walking time in minutes (rounded up) */
  walkingMinutes: number;
  /** Walking distance in km */
  distanceKm: number;
  /** Formatted walking time, e.g. "11 min walk" */
  formattedWalkingTime: string;
  /** Formatted distance, e.g. "850 m" */
  formattedDistance: string;
  /** Best transit wait time in minutes */
  waitMinutes: number;
  /** Best transit ride time in minutes */
  rideMinutes: number;
  /** Total best transit time (wait + ride) */
  transitMinutes: number;
  /** Whether walking is strictly faster than transit */
  walkingIsFaster: boolean;
  /** Whether walking should be suggested (<20 min, ≤3 stops) */
  isViable: boolean;
  /** Recommendation: walk, transit, or similar (within 2 min) */
  recommendation: "walk" | "transit" | "similar";
  /** Why walking is suggested */
  reason: "short_trip" | "delays" | null;
}

export interface UseWalkComparisonOptions {
  /** Origin station ID */
  originId: string | null;
  /** Destination station ID */
  destinationId: string | null;
  /** Commute analysis data (provides wait/ride times) */
  analysis: CommuteAnalysis | null;
}

/**
 * Estimate stop count from ride time.
 * Average inter-station time in NYC subway is ~2 minutes.
 */
function estimateStopCount(rideMinutes: number): number {
  return Math.max(1, Math.round(rideMinutes / 2));
}

/**
 * Get the best transit times from commute analysis.
 * Returns { waitMinutes, rideMinutes } from the best available route.
 */
function getBestTransitTimes(analysis: CommuteAnalysis): {
  waitMinutes: number;
  rideMinutes: number;
} {
  const bestDirect = analysis.directRoutes[0];
  const bestTransfer = analysis.transferRoutes[0];

  if (!bestDirect && !bestTransfer) {
    return { waitMinutes: 0, rideMinutes: 0 };
  }

  // Use whichever route has the lower total time
  const directTotal = bestDirect
    ? (bestDirect.nextArrivals[0]?.minutesAway ?? 0) + bestDirect.estimatedTravelMinutes
    : Infinity;
  const transferTotal = bestTransfer ? bestTransfer.totalEstimatedMinutes : Infinity;

  if (bestDirect && directTotal <= transferTotal) {
    return {
      waitMinutes: bestDirect.nextArrivals[0]?.minutesAway ?? 0,
      rideMinutes: bestDirect.estimatedTravelMinutes,
    };
  }

  if (bestTransfer) {
    return {
      waitMinutes: bestTransfer.legs[0]?.nextArrival.minutesAway ?? 0,
      rideMinutes: bestTransfer.totalEstimatedMinutes - (bestTransfer.legs[0]?.nextArrival.minutesAway ?? 0),
    };
  }

  return { waitMinutes: 0, rideMinutes: 0 };
}

export function useWalkComparison({
  originId,
  destinationId,
  analysis,
}: UseWalkComparisonOptions): WalkComparisonResult {
  const { stations } = useStationIndex();

  return useMemo(() => {
    if (!originId || !destinationId || !analysis) {
      return {
        available: false,
        walkingMinutes: 0,
        distanceKm: 0,
        formattedWalkingTime: "",
        formattedDistance: "",
        waitMinutes: 0,
        rideMinutes: 0,
        transitMinutes: 0,
        walkingIsFaster: false,
        isViable: false,
        recommendation: "transit",
        reason: null,
      };
    }

    const origin = stations.find((s) => s.id === originId);
    const dest = stations.find((s) => s.id === destinationId);

    if (!origin || !dest) {
      return {
        available: false,
        walkingMinutes: 0,
        distanceKm: 0,
        formattedWalkingTime: "",
        formattedDistance: "",
        waitMinutes: 0,
        rideMinutes: 0,
        transitMinutes: 0,
        walkingIsFaster: false,
        isViable: false,
        recommendation: "transit",
        reason: null,
      };
    }

    const distanceKm = haversineDistance(origin.lat, origin.lon, dest.lat, dest.lon);
    const walkingMinutes = walkingTimeFromDistance(distanceKm);
    const { waitMinutes, rideMinutes } = getBestTransitTimes(analysis);
    const transitMinutes = waitMinutes + rideMinutes;
    const stopCount = estimateStopCount(rideMinutes);

    const viable = isWalkingViable(walkingMinutes, stopCount);
    const comparison = compareWalkingVsTransit(walkingMinutes, waitMinutes, rideMinutes);

    // Determine reason
    let reason: "short_trip" | "delays" | null = null;
    if (viable) {
      if (comparison.recommendation === "walk") {
        // Walking is faster — check if it's due to delays (long wait)
        reason = waitMinutes > walkingMinutes ? "delays" : "short_trip";
      } else {
        reason = "short_trip";
      }
    }

    return {
      available: true,
      walkingMinutes,
      distanceKm,
      formattedWalkingTime: formatWalkingTime(walkingMinutes),
      formattedDistance: formatWalkingDistance(distanceKm),
      waitMinutes,
      rideMinutes,
      transitMinutes,
      walkingIsFaster: comparison.walkingIsFaster,
      isViable: viable,
      recommendation: comparison.recommendation,
      reason,
    };
  }, [originId, destinationId, analysis, stations]);
}
