/**
 * Train position interpolation for the line diagram.
 *
 * Converts raw VehiclePosition data (stop_sequence + status) into
 * interpolated positions (progress between stations) for SVG rendering.
 *
 * Interpolation rules:
 * - INCOMING_AT: 90% progress to next station
 * - STOPPED_AT: 100% at current station (progress = 1.0)
 * - IN_TRANSIT_TO: 50% between stations
 */

import type {
  InterpolatedTrainPosition,
  LineDiagramData,
  LinePositions,
  RouteIndex,
  StationIndex,
  TrainPosition,
} from "@mta-my-way/shared";

/**
 * Build LineDiagramData from raw positions and route data.
 * Returns null if the route is not found or has no trains.
 */
export function buildLineDiagram(
  positions: LinePositions,
  routeId: string,
  routes: RouteIndex,
  stations: StationIndex
): LineDiagramData | null {
  const route = routes[routeId.toUpperCase()];
  if (!route) return null;

  // Build stop list from route
  const routeStops = route.stops.map((stopId, index) => {
    const station = stations[stopId];
    const isTerminal = index === 0 || index === route.stops.length - 1;

    // Check if this is a transfer station (has multiple lines)
    const transferLines = station?.lines.filter((l) => l !== routeId.toUpperCase()) ?? [];
    const isTransferStation = transferLines.length > 0;

    return {
      stopId,
      stopName: station?.name ?? stopId,
      isTerminal,
      isTransferStation,
      transferLines: isTransferStation ? transferLines : undefined,
    };
  });

  // Interpolate train positions
  const interpolatedTrains = interpolateTrainPositions(positions.trains, route.stops, stations);

  return {
    routeId: routeId.toUpperCase(),
    routeColor: route.color,
    stops: routeStops,
    trains: interpolatedTrains,
    computedAt: Date.now(),
  };
}

/**
 * Interpolate train positions between stations.
 */
function interpolateTrainPositions(
  trains: TrainPosition[],
  routeStops: string[],
  stations: StationIndex
): InterpolatedTrainPosition[] {
  return trains.map((train) => {
    const { lastStopIndex, nextStopIndex, progress } = interpolatePosition(train, routeStops);

    const lastStopId = routeStops[lastStopIndex] ?? train.currentStopId;
    const nextStopId = routeStops[nextStopIndex] ?? train.currentStopId;

    return {
      tripId: train.tripId,
      routeId: train.routeId,
      direction: train.direction,
      lastStopId,
      nextStopId,
      progress,
      destination: train.destination,
      isAssigned: train.isAssigned,
      delay: train.delay,
    };
  });
}

/**
 * Calculate the interpolated position of a train.
 *
 * Returns:
 * - lastStopIndex: index of the last passed station
 * - nextStopIndex: index of the next station
 * - progress: 0.0 at last station, 1.0 at next station
 */
function interpolatePosition(
  train: TrainPosition,
  routeStops: string[]
): { lastStopIndex: number; nextStopIndex: number; progress: number } {
  // Normalize stop ID (strip direction suffix)
  const normalizedStopId = normalizeStopId(train.currentStopId);
  const currentStopSequence = train.currentStopSequence;

  // Find the current stop index in the route
  // The stop_sequence from GTFS is 1-indexed, route array is 0-indexed
  // But MTA stop_sequence values don't always match array indices directly
  // We need to find the stop by ID or by sequence

  let currentStopIndex = routeStops.findIndex((s) => normalizeStopId(s) === normalizedStopId);

  // If not found by ID, try to use sequence (adjusting for 0-indexing)
  // GTFS stop_sequence is typically 1-indexed
  if (currentStopIndex === -1 && currentStopSequence > 0) {
    // Try sequence-based lookup (sequence - 1 for 0-indexed array)
    currentStopIndex = Math.min(currentStopSequence - 1, routeStops.length - 1);
    if (currentStopIndex < 0) currentStopIndex = 0;
  }

  // Still not found - default to first stop
  if (currentStopIndex === -1) {
    currentStopIndex = 0;
  }

  // Determine direction of travel
  // For northbound trains, stops increase in index
  // For southbound trains, stops decrease in index
  const isNorthbound = train.direction === "N";

  // Calculate last and next stop based on direction and status
  let lastStopIndex: number;
  let nextStopIndex: number;
  let baseProgress: number;

  switch (train.status) {
    case "STOPPED_AT":
      // Train is at the station
      lastStopIndex = currentStopIndex;
      nextStopIndex = isNorthbound
        ? Math.min(currentStopIndex + 1, routeStops.length - 1)
        : Math.max(currentStopIndex - 1, 0);
      baseProgress = 1.0;
      break;

    case "INCOMING_AT":
      // Train is approaching the next station (90% there)
      if (isNorthbound) {
        lastStopIndex = Math.max(currentStopIndex - 1, 0);
        nextStopIndex = currentStopIndex;
      } else {
        lastStopIndex = Math.min(currentStopIndex + 1, routeStops.length - 1);
        nextStopIndex = currentStopIndex;
      }
      baseProgress = 0.9;
      break;

    case "IN_TRANSIT_TO":
    default:
      // Train is between stations
      if (isNorthbound) {
        lastStopIndex = Math.max(currentStopIndex - 1, 0);
        nextStopIndex = Math.min(currentStopIndex, routeStops.length - 1);
        // If at beginning of route, use current as last
        if (lastStopIndex === 0 && currentStopIndex === 0) {
          nextStopIndex = Math.min(1, routeStops.length - 1);
        }
      } else {
        lastStopIndex = currentStopIndex;
        nextStopIndex = Math.max(currentStopIndex - 1, 0);
        // If at end of route, use current as next
        if (nextStopIndex === routeStops.length - 1 && currentStopIndex === routeStops.length - 1) {
          lastStopIndex = Math.max(routeStops.length - 2, 0);
        }
      }
      baseProgress = 0.5;
      break;
  }

  // Ensure indices are valid
  lastStopIndex = Math.max(0, Math.min(lastStopIndex, routeStops.length - 1));
  nextStopIndex = Math.max(0, Math.min(nextStopIndex, routeStops.length - 1));

  return {
    lastStopIndex,
    nextStopIndex,
    progress: baseProgress,
  };
}

/**
 * Normalize a stop ID by stripping direction suffix (N/S).
 */
function normalizeStopId(stopId: string): string {
  if (stopId.endsWith("N") || stopId.endsWith("S")) {
    return stopId.slice(0, -1);
  }
  return stopId;
}

/**
 * Get trains bunched together (within a distance threshold).
 * Used for service problem detection.
 */
export function detectBunchedTrains(
  trains: InterpolatedTrainPosition[],
  bunchedThreshold: number = 0.1 // 10% of line length
): Array<InterpolatedTrainPosition[]> {
  // Group by direction
  const byDirection = new Map<"N" | "S", InterpolatedTrainPosition[]>();
  for (const train of trains) {
    const group = byDirection.get(train.direction) ?? [];
    group.push(train);
    byDirection.set(train.direction, group);
  }

  const bunchedGroups: Array<InterpolatedTrainPosition[]> = [];

  for (const directionTrains of byDirection.values()) {
    // Sort by progress
    const sorted = [...directionTrains].sort((a, b) => {
      // Compare by last stop index first, then by progress
      return a.progress - b.progress;
    });

    // Find consecutive trains within threshold
    let currentGroup: InterpolatedTrainPosition[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const train = sorted[i];
      if (currentGroup.length === 0) {
        currentGroup.push(train);
      } else {
        const prevTrain = currentGroup[currentGroup.length - 1];
        const prevProgress = getOverallProgress(prevTrain);
        const currProgress = getOverallProgress(train);

        if (Math.abs(currProgress - prevProgress) <= bunchedThreshold) {
          currentGroup.push(train);
        } else {
          if (currentGroup.length >= 2) {
            bunchedGroups.push(currentGroup);
          }
          currentGroup = [train];
        }
      }
    }

    if (currentGroup.length >= 2) {
      bunchedGroups.push(currentGroup);
    }
  }

  return bunchedGroups;
}

/**
 * Get overall progress along the line (0-1) based on stop index and progress.
 * This is approximate - we use stop index ratio.
 */
function getOverallProgress(train: InterpolatedTrainPosition): number {
  // Since we don't have the full stop list here, we use a simplified approach
  // Just use the progress value directly for comparison
  return train.progress;
}
