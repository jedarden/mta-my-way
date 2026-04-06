/**
 * Transfer analysis engine
 *
 * Computes multi-leg routes from real-time arrival data for a given
 * origin/destination pair. Finds all direct routes and transfer routes,
 * then ranks them by total estimated arrival time at destination.
 *
 * Key features:
 * - Direct route scoring: line + next arrival + travel time
 * - Transfer route scoring: first leg + walking + wait + second leg
 * - B Division buffer: +2 min for B Division arrival estimates
 * - Express/local detection via stop pattern comparison
 * - "Transfer saves X min" computation
 */

import type {
  ArrivalTime,
  CommuteAnalysis,
  ComplexIndex,
  DirectRoute,
  RouteIndex,
  StationIndex,
  StationRef,
  TransferGraph,
  TransferLeg,
  TransferRoute,
  TravelTimeIndex,
  WalkingOption,
} from "@mta-my-way/shared";
import {
  haversineDistance,
  isBDivision,
  isWalkingViable,
  walkingTimeFromDistance,
} from "@mta-my-way/shared";
import { getStationsWithBrokenElevators } from "../equipment-poller.js";
import { buildTransferGraph, getReachableStations } from "./graph.js";
import { calculateRouteTravelTime, determineDirection, getTravelTimes } from "./travel-times.js";

/** Buffer to add to B Division arrival estimates (in seconds) */
const B_DIVISION_BUFFER_SECONDS = 120; // 2 minutes

/** Maximum number of transfer routes to return */
const MAX_TRANSFER_ROUTES = 5;

/** Maximum walking time for a viable transfer (in seconds) */
const MAX_WALKING_TIME_SECONDS = 600; // 10 minutes

/** Maximum arrival wait time to consider (in seconds) */
const MAX_WAIT_TIME_SECONDS = 1800; // 30 minutes

/**
 * Engine configuration
 */
export interface EngineConfig {
  stations: StationIndex;
  routes: RouteIndex;
  transfers: Record<
    string,
    Array<{ toStationId: string; toLines: string[]; walkingSeconds: number; accessible: boolean }>
  >;
  complexes: ComplexIndex;
  getArrivals: (stationId: string) => ArrivalTime[] | null;
}

/**
 * Transfer analysis engine
 */
export class TransferEngine {
  private stations: StationIndex;
  private routes: RouteIndex;
  private graph: TransferGraph;
  private getArrivalsFn: (stationId: string) => ArrivalTime[] | null;
  private travelTimes: TravelTimeIndex | null;

  constructor(config: EngineConfig) {
    this.stations = config.stations;
    this.routes = config.routes;
    this.getArrivalsFn = config.getArrivals;
    this.graph = buildTransferGraph(config.stations, config.transfers, config.complexes);
    this.travelTimes = getTravelTimes();
  }

  /**
   * Analyze all possible routes between origin and destination
   */
  analyzeCommute(
    originId: string,
    destinationId: string,
    preferredLines: string[] = [],
    commuteId = "default",
    accessibleMode = false
  ): CommuteAnalysis {
    const origin = this.getStationRef(originId);
    const destination = this.getStationRef(destinationId);

    if (!origin || !destination) {
      throw new Error(`Invalid station IDs: ${originId}, ${destinationId}`);
    }

    // Find direct routes
    const directRoutes = this.findDirectRoutes(originId, destinationId, preferredLines);

    // Find transfer routes (1 transfer max = 2 legs)
    const transferRoutes = this.findTransferRoutes(
      originId,
      destinationId,
      preferredLines,
      directRoutes,
      accessibleMode
    );

    // Compute walking option for short trips
    const walkingOption = this.computeWalkingOption(
      originId,
      destinationId,
      directRoutes,
      transferRoutes
    );

    // Determine recommendation
    const recommendation = this.determineRecommendation(
      directRoutes,
      transferRoutes,
      walkingOption
    );

    // Sort routes by arrival time
    directRoutes.sort((a, b) => a.estimatedArrivalAtDestination - b.estimatedArrivalAtDestination);
    transferRoutes.sort(
      (a, b) => a.estimatedArrivalAtDestination - b.estimatedArrivalAtDestination
    );

    return {
      commuteId,
      origin,
      destination,
      directRoutes: directRoutes.slice(0, 5),
      transferRoutes: transferRoutes.slice(0, MAX_TRANSFER_ROUTES),
      recommendation,
      timestamp: Date.now(),
      walkingOption,
    };
  }

  /**
   * Compute walking option for short trips or when delays are significant
   */
  private computeWalkingOption(
    originId: string,
    destinationId: string,
    directRoutes: DirectRoute[],
    transferRoutes: TransferRoute[]
  ): WalkingOption | undefined {
    const origin = this.stations[originId];
    const destination = this.stations[destinationId];

    if (!origin || !destination) {
      return undefined;
    }

    // Calculate walking distance and time
    const distanceKm = haversineDistance(origin.lat, origin.lon, destination.lat, destination.lon);
    const walkingMinutes = walkingTimeFromDistance(distanceKm);

    // Find best transit option (direct or transfer)
    const bestDirect = directRoutes.length > 0 ? directRoutes[0] : null;
    const bestTransfer = transferRoutes.length > 0 ? transferRoutes[0] : null;

    // Calculate transit time (wait + ride)
    let transitMinutes = Infinity;
    let bestOption = "none" as "direct" | "transfer" | "none";

    if (bestDirect) {
      const waitMinutes =
        Math.max(
          0,
          (bestDirect.nextArrivals[0]?.arrivalTime ?? Date.now() / 1000) - Date.now() / 1000
        ) / 60;
      transitMinutes = waitMinutes + bestDirect.estimatedTravelMinutes;
      bestOption = "direct";
    }

    if (bestTransfer && bestTransfer.totalEstimatedMinutes < transitMinutes) {
      transitMinutes = bestTransfer.totalEstimatedMinutes;
      bestOption = "transfer";
    }

    // Determine if walking should be suggested
    const walkingIsFaster = walkingMinutes < transitMinutes;

    // Check if this is a short trip (walking under 20 min, 3 or fewer stops)
    const route = this.routes[origin.lines.find((line) => destination.lines.includes(line)) ?? ""];
    const stopCount = route
      ? Math.abs(
          (route.stops.indexOf(originId) - route.stops.indexOf(destinationId)) * -1 ||
            route.stops.indexOf(destinationId) - route.stops.indexOf(originId)
        ) + 1
      : 10;
    const isShortTrip = isWalkingViable(walkingMinutes, stopCount);

    // Show walking option if:
    // 1. It's a short trip (< 20 min walk, <= 3 stops), OR
    // 2. Walking is faster than transit, OR
    // 3. Transit delays are significant (5+ min wait for short trip)
    const hasSignificantDelays =
      bestOption !== "none" && transitMinutes - walkingMinutes > 5 && walkingMinutes < 15;

    if (isShortTrip || walkingIsFaster || hasSignificantDelays) {
      let reason: WalkingOption["reason"] = "always";
      if (walkingIsFaster) {
        reason = "delays";
      } else if (isShortTrip) {
        reason = "short_trip";
      }

      return {
        distanceKm: Math.round(distanceKm * 10) / 10,
        walkingMinutes,
        transitMinutes: Math.round(transitMinutes),
        walkingIsFaster,
        reason,
      };
    }

    return undefined;
  }

  /**
   * Find all direct routes between origin and destination
   */
  private findDirectRoutes(
    originId: string,
    destinationId: string,
    preferredLines: string[]
  ): DirectRoute[] {
    const routes: DirectRoute[] = [];

    // Get origin arrivals
    const originArrivals = this.getArrivalsFn(originId);
    if (!originArrivals || originArrivals.length === 0) {
      return routes;
    }

    // Find lines that serve both stations
    const originStation = this.stations[originId];
    const destinationStation = this.stations[destinationId];

    if (!originStation || !destinationStation) {
      return routes;
    }

    // Find common lines
    const commonLines = originStation.lines.filter((line) =>
      destinationStation.lines.includes(line)
    );

    for (const line of commonLines) {
      const route = this.routes[line];
      if (!route) continue;

      // Determine direction based on stop sequence
      const direction = determineDirection(route.stops, originId, destinationId);
      if (!direction) continue;

      // Get arrivals for this line and direction
      const lineArrivals = originArrivals.filter(
        (a) =>
          a.line === line &&
          (a.direction === direction || this.isCorrectDirection(a, originId, destinationId))
      );

      if (lineArrivals.length === 0) {
        // Try without direction filter - sometimes direction data is unreliable
        const allLineArrivals = originArrivals.filter((a) => a.line === line);
        if (allLineArrivals.length === 0) continue;

        // Use first arrival and estimate
        routes.push(this.createDirectRoute(line, allLineArrivals, originId, destinationId));
        continue;
      }

      routes.push(this.createDirectRoute(line, lineArrivals, originId, destinationId));
    }

    // Sort by preference then arrival time
    routes.sort((a, b) => {
      // Prefer preferred lines
      const aPreferred = preferredLines.includes(a.line) ? 0 : 1;
      const bPreferred = preferredLines.includes(b.line) ? 0 : 1;
      if (aPreferred !== bPreferred) return aPreferred - bPreferred;

      // Then by arrival time
      return a.estimatedArrivalAtDestination - b.estimatedArrivalAtDestination;
    });

    return routes;
  }

  /**
   * Create a direct route object
   */
  private createDirectRoute(
    line: string,
    arrivals: ArrivalTime[],
    originId: string,
    destinationId: string
  ): DirectRoute {
    const route = this.routes[line];
    const travelTimeSeconds = this.travelTimes
      ? calculateRouteTravelTime(
          this.travelTimes,
          line,
          route?.stops ?? [],
          originId,
          destinationId
        )
      : this.estimateTravelTime(originId, destinationId);

    // Get next 3 arrivals with B Division buffer applied
    const nextArrivals = arrivals.slice(0, 3).map((a) => this.applyBDivisionBuffer(a));

    // Calculate estimated arrival using the first arrival
    const firstArrival = nextArrivals[0];
    const bufferMinutes = isBDivision(line) ? B_DIVISION_BUFFER_SECONDS / 60 : 0;
    const estimatedArrival = firstArrival
      ? firstArrival.arrivalTime + travelTimeSeconds + bufferMinutes * 60
      : Date.now() / 1000 + travelTimeSeconds;

    return {
      line,
      direction: firstArrival?.direction ?? "S",
      nextArrivals,
      estimatedTravelMinutes: Math.ceil(travelTimeSeconds / 60),
      estimatedArrivalAtDestination: Math.floor(estimatedArrival),
    };
  }

  /**
   * Find all transfer routes (1 transfer = 2 legs)
   */
  private findTransferRoutes(
    originId: string,
    destinationId: string,
    _preferredLines: string[],
    directRoutes: DirectRoute[],
    accessibleMode = false
  ): TransferRoute[] {
    const routes: TransferRoute[] = [];
    const bestDirectArrival =
      directRoutes.length > 0
        ? (directRoutes[0]?.estimatedArrivalAtDestination ?? Infinity)
        : Infinity;

    // Get origin arrivals
    const originArrivals = this.getArrivalsFn(originId);
    if (!originArrivals || originArrivals.length === 0) {
      return routes;
    }

    // When accessible mode is on, weight transfer stations with broken elevators as Infinity
    const brokenElevatorStations = accessibleMode
      ? getStationsWithBrokenElevators()
      : new Set<string>();

    // Get all reachable transfer stations from origin
    const reachableFromOrigin = getReachableStations(this.graph, originId);

    // For each potential transfer point
    for (const transferEdge of reachableFromOrigin) {
      // Skip if walking time is too long
      if (transferEdge.walkingSeconds > MAX_WALKING_TIME_SECONDS) continue;

      // In accessible mode, skip transfer stations with broken elevators
      if (accessibleMode && brokenElevatorStations.has(transferEdge.toStationId)) continue;

      const transferStationId = transferEdge.toStationId;

      // Get arrivals at transfer station
      const transferArrivals = this.getArrivalsFn(transferStationId);
      if (!transferArrivals || transferArrivals.length === 0) continue;

      // Find lines at transfer station that go to destination
      const transferStation = this.stations[transferStationId];
      const destinationStation = this.stations[destinationId];

      if (!transferStation || !destinationStation) continue;

      const linesToDestination = transferStation.lines.filter((line) =>
        destinationStation.lines.includes(line)
      );

      // For each first leg line
      const originStation = this.stations[originId];
      if (!originStation) continue;

      const firstLegLines = originStation.lines.filter((line) =>
        transferStation.lines.includes(line)
      );

      for (const firstLegLine of firstLegLines) {
        // Get first leg arrivals
        const firstLegArrivals = originArrivals.filter((a) => a.line === firstLegLine);
        if (firstLegArrivals.length === 0) continue;

        for (const secondLegLine of linesToDestination) {
          // Skip if same line (that's a direct route)
          if (firstLegLine === secondLegLine) continue;

          // Build transfer route
          const transferRoute = this.buildTransferRoute(
            originId,
            transferStationId,
            destinationId,
            firstLegLine,
            secondLegLine,
            firstLegArrivals,
            transferArrivals.filter((a) => a.line === secondLegLine),
            transferEdge.walkingSeconds
          );

          if (
            transferRoute &&
            transferRoute.estimatedArrivalAtDestination < bestDirectArrival + 600
          ) {
            // Only include if it's not much worse than direct
            routes.push(transferRoute);
          }
        }
      }
    }

    // Sort by arrival time and remove duplicates
    routes.sort((a, b) => a.estimatedArrivalAtDestination - b.estimatedArrivalAtDestination);

    // Dedupe by transfer station
    const seen = new Set<string>();
    return routes.filter((route) => {
      const key = `${route.legs[0]?.line}-${route.transferStation.stationId}-${route.legs[1]?.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Build a transfer route with two legs
   */
  private buildTransferRoute(
    originId: string,
    transferStationId: string,
    destinationId: string,
    firstLegLine: string,
    secondLegLine: string,
    firstLegArrivals: ArrivalTime[],
    secondLegArrivals: ArrivalTime[],
    walkingSeconds: number
  ): TransferRoute | null {
    if (firstLegArrivals.length === 0 || secondLegArrivals.length === 0) {
      return null;
    }

    // Get travel times for each leg
    const firstLegRoute = this.routes[firstLegLine];
    const secondLegRoute = this.routes[secondLegLine];

    const firstLegTravelSeconds = this.travelTimes
      ? calculateRouteTravelTime(
          this.travelTimes,
          firstLegLine,
          firstLegRoute?.stops ?? [],
          originId,
          transferStationId
        )
      : this.estimateTravelTime(originId, transferStationId);

    const secondLegTravelSeconds = this.travelTimes
      ? calculateRouteTravelTime(
          this.travelTimes,
          secondLegLine,
          secondLegRoute?.stops ?? [],
          transferStationId,
          destinationId
        )
      : this.estimateTravelTime(transferStationId, destinationId);

    // Apply B Division buffer to first leg arrival
    const firstArrival = this.applyBDivisionBuffer(firstLegArrivals[0]!);
    const firstLegArrivalAtTransfer = firstArrival.arrivalTime + firstLegTravelSeconds;

    // Find the best second leg arrival (must arrive after we get there + walking time)
    const arrivalAtTransferWithWalk = firstLegArrivalAtTransfer + walkingSeconds;
    const viableSecondLegs = secondLegArrivals
      .map((a) => this.applyBDivisionBuffer(a))
      .filter((a) => a.arrivalTime >= arrivalAtTransferWithWalk - 30); // Allow 30s slack

    if (viableSecondLegs.length === 0) {
      return null;
    }

    const secondArrival = viableSecondLegs[0]!;
    const waitAtTransfer = Math.max(0, secondArrival.arrivalTime - arrivalAtTransferWithWalk);

    // Skip if wait is too long
    if (waitAtTransfer > MAX_WAIT_TIME_SECONDS) {
      return null;
    }

    const finalArrival = secondArrival.arrivalTime + secondLegTravelSeconds;

    // Build legs
    const firstLeg: TransferLeg = {
      line: firstLegLine,
      direction: firstArrival.direction,
      boardAt: this.getStationRef(originId)!,
      alightAt: this.getStationRef(transferStationId)!,
      nextArrival: firstArrival,
      estimatedTravelMinutes: Math.ceil(firstLegTravelSeconds / 60),
    };

    const secondLeg: TransferLeg = {
      line: secondLegLine,
      direction: secondArrival.direction,
      boardAt: this.getStationRef(transferStationId)!,
      alightAt: this.getStationRef(destinationId)!,
      nextArrival: secondArrival,
      estimatedTravelMinutes: Math.ceil(secondLegTravelSeconds / 60),
    };

    const totalMinutes = Math.ceil(
      (firstArrival.arrivalTime - Date.now() / 1000) / 60 +
        firstLegTravelSeconds / 60 +
        walkingSeconds / 60 +
        waitAtTransfer / 60 +
        secondLegTravelSeconds / 60
    );

    return {
      legs: [firstLeg, secondLeg],
      totalEstimatedMinutes: totalMinutes,
      estimatedArrivalAtDestination: Math.floor(finalArrival),
      timeSavedVsDirect: 0, // Will be computed later
      transferStation: this.getStationRef(transferStationId)!,
    };
  }

  /**
   * Apply B Division buffer to an arrival time
   */
  private applyBDivisionBuffer(arrival: ArrivalTime): ArrivalTime {
    if (!isBDivision(arrival.line)) {
      return arrival;
    }

    return {
      ...arrival,
      arrivalTime: arrival.arrivalTime + B_DIVISION_BUFFER_SECONDS,
      minutesAway: arrival.minutesAway + B_DIVISION_BUFFER_SECONDS / 60,
    };
  }

  /**
   * Determine whether to recommend direct or transfer
   */
  private determineRecommendation(
    directRoutes: DirectRoute[],
    transferRoutes: TransferRoute[],
    _walkingOption?: WalkingOption
  ): "direct" | "transfer" {
    if (directRoutes.length === 0 && transferRoutes.length === 0) {
      return "direct"; // Default
    }

    if (directRoutes.length === 0) {
      return "transfer";
    }

    if (transferRoutes.length === 0) {
      return "direct";
    }

    const bestDirect = directRoutes[0]!;
    const bestTransfer = transferRoutes[0]!;

    // Calculate time saved
    bestTransfer.timeSavedVsDirect =
      bestDirect.estimatedArrivalAtDestination - bestTransfer.estimatedArrivalAtDestination;

    // Recommend transfer if it saves at least 2 minutes
    if (bestTransfer.timeSavedVsDirect >= 120) {
      return "transfer";
    }

    return "direct";
  }

  /**
   * Get station reference by ID
   */
  private getStationRef(stationId: string): StationRef | null {
    const station = this.stations[stationId];
    if (!station) return null;
    return {
      stationId,
      stationName: station.name,
    };
  }

  /**
   * Estimate travel time between two stations
   * Used as fallback when travel times aren't available
   */
  private estimateTravelTime(originId: string, destinationId: string): number {
    const origin = this.stations[originId];
    const destination = this.stations[destinationId];

    if (!origin || !destination) {
      return 600; // 10 minutes default
    }

    // Simple distance-based estimation
    const latDiff = Math.abs(origin.lat - destination.lat);
    const lonDiff = Math.abs(origin.lon - destination.lon);
    const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);

    // Roughly 1 degree = 111km, average subway speed ~40km/h
    // This gives a very rough estimate in seconds
    return Math.max(Math.round(((distance * 111) / 40) * 3600), 120);
  }

  /**
   * Check if an arrival is going in the correct direction
   */
  private isCorrectDirection(
    arrival: ArrivalTime,
    originId: string,
    destinationId: string
  ): boolean {
    const route = this.routes[arrival.line];
    if (!route) return true; // Can't determine, assume correct

    const direction = determineDirection(route.stops, originId, destinationId);
    return direction === null || direction === arrival.direction;
  }
}

/**
 * Create a transfer engine instance
 */
export function createTransferEngine(config: EngineConfig): TransferEngine {
  return new TransferEngine(config);
}

/**
 * Express detection result
 */
export interface ExpressDetectionResult {
  isExpress: boolean;
  skippedStops: string[];
}

/**
 * Detect if a trip is express by comparing its stop pattern to the route's full stops
 *
 * An express train skips stops that are normally served by the local.
 * This is detected by comparing the trip's stop_time_updates against the route's
 * full stop list - if stops are missing between origin and destination, it's express.
 *
 * @param tripStopIds - Stop IDs from the trip's stop_time_updates
 * @param routeStops - Full stop list for the route
 * @param originId - Origin station ID (to limit analysis to relevant segment)
 * @param destinationId - Destination station ID (to limit analysis to relevant segment)
 * @returns ExpressDetectionResult indicating express status and skipped stops
 */
export function detectExpressService(
  tripStopIds: string[],
  routeStops: string[],
  originId: string,
  destinationId: string
): ExpressDetectionResult {
  // Find the segment of the route between origin and destination
  const originIndex = routeStops.indexOf(originId);
  const destinationIndex = routeStops.indexOf(destinationId);

  if (originIndex === -1 || destinationIndex === -1) {
    return { isExpress: false, skippedStops: [] };
  }

  const startIdx = Math.min(originIndex, destinationIndex);
  const endIdx = Math.max(originIndex, destinationIndex);

  // Get the expected stops in this segment
  const expectedStops = routeStops.slice(startIdx, endIdx + 1);
  const tripStopSet = new Set(tripStopIds);

  // Find skipped stops (stops in route but not in trip)
  const skippedStops: string[] = [];
  for (const stopId of expectedStops) {
    if (!tripStopSet.has(stopId)) {
      skippedStops.push(stopId);
    }
  }

  // A trip is express if it skips at least 2 stops in the segment
  const isExpress = skippedStops.length >= 2;

  return {
    isExpress,
    skippedStops,
  };
}
