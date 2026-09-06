/**
 * Transfer analysis engine
 *
 * Computes multi-leg routes from real-time arrival data for a given
 * origin/destination pair. Finds all direct routes and transfer routes,
 * then ranks them by total estimated arrival time at destination.
 *
 * Key features:
 * - Direct route scoring: line + next arrival + travel time
 * - Transfer route scoring: per-leg travel + walking + wait at every transfer
 * - Configurable transfer depth (EngineConfig.maxTransfers, default 2)
 * - Total-travel-time guard: depth can never produce an absurd itinerary
 * - B Division buffer: +2 min for B Division arrival estimates
 * - Express/local detection via stop pattern comparison
 * - "Transfer saves X min" computation
 */

import type {
  ArrivalTime,
  CommuteAnalysis,
  ComplexIndex,
  DirectRoute,
  RecommendationDetails,
  RouteIndex,
  StationArrivals,
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

/** Default maximum number of transfers in a generated route */
const DEFAULT_MAX_TRANSFERS = 2;

/** Hard ceiling on the configurable transfer depth */
const MAX_TRANSFERS_CEILING = 4;

/** Maximum number of transfer routes to return */
const MAX_TRANSFER_ROUTES = 5;

/** Maximum walking time for a viable transfer (in seconds) */
const MAX_WALKING_TIME_SECONDS = 600; // 10 minutes

/** Maximum wait time to allow at any single transfer point (in seconds) */
const MAX_WAIT_TIME_SECONDS = 1800; // 30 minutes

/**
 * Total-travel-time guard (in minutes). An itinerary longer than this is
 * rejected regardless of how it was assembled, so raising the transfer depth
 * cannot produce absurd multi-hour itineraries.
 */
const MAX_TOTAL_TRAVEL_MINUTES = 90;

/** A transfer route must arrive no more than this long after the best direct (in seconds) */
const MAX_SLACK_VS_DIRECT_SECONDS = 600; // 10 minutes

/** Slack allowed when matching a connecting leg onto the previous leg's arrival (in seconds) */
const CONNECTION_SLACK_SECONDS = 30;

/**
 * Clamp a caller-supplied transfer depth to something the search can afford.
 */
function clampTransferDepth(maxTransfers: number | undefined): number {
  if (maxTransfers === undefined || !Number.isFinite(maxTransfers)) {
    return DEFAULT_MAX_TRANSFERS;
  }
  return Math.min(MAX_TRANSFERS_CEILING, Math.max(0, Math.floor(maxTransfers)));
}

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
  getArrivals: (stationId: string) => StationArrivals | null;
  /**
   * Maximum number of transfers a generated route may use. Defaults to 2 and is
   * clamped to [0, 4]; 0 disables transfer routes entirely. Every extra transfer
   * widens the search, so the total travel time guard
   * (MAX_TOTAL_TRAVEL_MINUTES) is what keeps depth useful.
   */
  maxTransfers?: number;
}

/**
 * Transfer analysis engine
 */
export class TransferEngine {
  private stations: StationIndex;
  private routes: RouteIndex;
  private graph: TransferGraph;
  private getArrivalsFn: (stationId: string) => StationArrivals | null;
  private travelTimes: TravelTimeIndex | null;
  private maxTransfers: number;
  constructor(config: EngineConfig) {
    this.stations = config.stations;
    this.routes = config.routes;
    this.getArrivalsFn = config.getArrivals;
    this.graph = buildTransferGraph(config.stations, config.transfers, config.complexes);
    this.travelTimes = getTravelTimes();
    this.maxTransfers = clampTransferDepth(config.maxTransfers);
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

    // Find transfer routes (up to maxTransfers, so 2 transfers = 3 legs)
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

    // Determine recommendation with detailed analysis
    const { recommendation, recommendationDetails } = this.determineRecommendation(
      directRoutes,
      transferRoutes,
      walkingOption,
      originId,
      destinationId
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
      recommendationDetails,
      timestamp: Date.now(),
      walkingOption,
    };
  }

  /**
   * Extract all arrivals from a StationArrivals object
   * Combines northbound and southbound arrivals into a single array
   */
  private extractAllArrivals(stationArrivals: StationArrivals | null): ArrivalTime[] {
    if (!stationArrivals) {
      return [];
    }
    return [...stationArrivals.northbound, ...stationArrivals.southbound];
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

    // Check if stations are in the same complex (very close, within walking distance)
    const originStation = this.stations[originId];
    const destStation = this.stations[destinationId];
    const sameComplex =
      originStation?.complex &&
      destStation?.complex &&
      originStation.complex === destStation.complex;

    // Check if this is a short trip (walking under 20 min, 3 or fewer stops)
    // For stations in the same complex, treat as 1 stop (very close)
    let stopCount = 10; // default when no route exists
    if (sameComplex) {
      stopCount = 1; // Stations in same complex are very close
    } else {
      const route =
        this.routes[origin.lines.find((line) => destination.lines.includes(line)) ?? ""];
      if (route) {
        stopCount =
          Math.abs(
            (route.stops.indexOf(originId) - route.stops.indexOf(destinationId)) * -1 ||
              route.stops.indexOf(destinationId) - route.stops.indexOf(originId)
          ) + 1;
      }
    }
    const isShortTrip = isWalkingViable(walkingMinutes, stopCount);

    // Show walking option if:
    // 1. It's a short trip (< 20 min walk, <= 3 stops), OR
    // 2. Walking is faster than transit, OR
    // 3. Transit delays are significant (5+ min wait for short trip), OR
    // 4. No transit options available and walking is under 10 minutes
    const hasSignificantDelays =
      bestOption !== "none" && transitMinutes - walkingMinutes > 5 && walkingMinutes < 15;
    const noTransitOptions = bestOption === "none" && walkingMinutes < 10;

    if (isShortTrip || walkingIsFaster || hasSignificantDelays || noTransitOptions) {
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
    const stationArrivals = this.getArrivalsFn(originId);
    const originArrivals = this.extractAllArrivals(stationArrivals);
    if (originArrivals.length === 0) {
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
      isExpress: firstArrival?.isExpress ?? false,
    };
  }

  /**
   * Find all transfer routes up to `this.maxTransfers` transfers.
   *
   * A route is a chain through the transfer graph: origin → t1 → … → tn →
   * destination. Every hop onto a new transfer station walks a graph edge (the
   * transfer penalty) and rides a line serving both endpoints; the final hop
   * only needs a line shared with the destination. Depth 1 therefore yields the
   * classic 2-leg route and depth 2 yields 3-leg itineraries.
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
    const stationArrivals = this.getArrivalsFn(originId);
    const originArrivals = this.extractAllArrivals(stationArrivals);
    if (originArrivals.length === 0) {
      return routes;
    }

    // When accessible mode is on, weight transfer stations with broken elevators as Infinity
    const brokenElevatorStations = accessibleMode
      ? getStationsWithBrokenElevators()
      : new Set<string>();

    const destinationStation = this.stations[destinationId];
    if (!destinationStation) {
      return routes;
    }

    /**
     * Extend a partial chain.
     *
     * `stationIds` holds [origin, …transfer stations visited], `lines` holds one
     * entry per committed leg (lines[i] rides stationIds[i] → stationIds[i+1]),
     * and `walks` holds the walking seconds needed to reach each station as a
     * transfer point (walks[0] is always 0).
     */
    const extend = (
      stationIds: string[],
      lines: string[],
      walks: number[],
      visited: Set<string>
    ): void => {
      const lastStationId = stationIds[stationIds.length - 1]!;
      const transfersSoFar = stationIds.length - 1;
      const lastStation = this.stations[lastStationId];
      if (!lastStation) return;

      // Close the chain onto the destination once at least one transfer exists
      if (transfersSoFar >= 1) {
        const previousLine = lines[lines.length - 1]!;
        const finalLines = lastStation.lines.filter(
          (line) => destinationStation.lines.includes(line) && line !== previousLine
        );

        for (const finalLine of finalLines) {
          const transferRoute = this.buildTransferRoute(
            [...stationIds, destinationId],
            [...lines, finalLine],
            [...walks, 0],
            originArrivals
          );

          // Only include if it's not much worse than direct
          if (
            transferRoute &&
            transferRoute.estimatedArrivalAtDestination <
              bestDirectArrival + MAX_SLACK_VS_DIRECT_SECONDS
          ) {
            routes.push(transferRoute);
          }
        }
      }

      if (transfersSoFar >= this.maxTransfers) return;

      for (const transferEdge of getReachableStations(this.graph, lastStationId)) {
        // Skip if walking time is too long
        if (transferEdge.walkingSeconds > MAX_WALKING_TIME_SECONDS) continue;

        // In accessible mode, skip transfer stations with broken elevators
        if (accessibleMode && brokenElevatorStations.has(transferEdge.toStationId)) continue;

        // Never revisit a station — a chain that loops is never the fastest way
        if (visited.has(transferEdge.toStationId)) continue;

        const nextStation = this.stations[transferEdge.toStationId];
        if (!nextStation) continue;

        // Arrivals must exist at the candidate transfer point or no leg can board there
        const nextArrivals = this.extractAllArrivals(this.getArrivalsFn(transferEdge.toStationId));
        if (nextArrivals.length === 0) continue;

        const previousLine = lines[lines.length - 1];
        const onwardLines = nextStation.lines.filter(
          (line) => lastStation.lines.includes(line) && line !== previousLine
        );

        visited.add(transferEdge.toStationId);
        for (const onwardLine of onwardLines) {
          extend(
            [...stationIds, transferEdge.toStationId],
            [...lines, onwardLine],
            [...walks, transferEdge.walkingSeconds],
            visited
          );
        }
        visited.delete(transferEdge.toStationId);
      }
    };

    extend([originId], [], [0], new Set([originId]));

    // Sort by arrival time and remove duplicates
    routes.sort((a, b) => a.estimatedArrivalAtDestination - b.estimatedArrivalAtDestination);

    // Dedupe by full path (lines plus the stations each leg connects)
    const seen = new Set<string>();
    return routes.filter((route) => {
      const key = route.legs
        .map((leg) => `${leg.line}:${leg.boardAt.stationId}>${leg.alightAt.stationId}`)
        .join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Build a transfer route from a station chain and one line per leg
   *
   * `stationIds` is [origin, …transfer stations, destination] and `lines` has
   * one entry per leg. `walks` is parallel to `stationIds` and holds the walking
   * seconds needed to reach each station as a transfer point (0 for the origin
   * and for the destination).
   *
   * Returns null when the chain cannot be ridden: a leg has no arrivals, a
   * connection misses its train, a wait is too long, or the total travel time
   * breaches MAX_TOTAL_TRAVEL_MINUTES.
   */
  private buildTransferRoute(
    stationIds: string[],
    lines: string[],
    walks: number[],
    originArrivals: ArrivalTime[]
  ): TransferRoute | null {
    const legs: TransferLeg[] = [];
    let totalTravelSeconds = 0;
    let totalWalkingSeconds = 0;
    let totalWaitingSeconds = 0;
    let lastLegTravelSeconds = 0;

    // Arrival time at the next boarding point: the previous leg's arrival plus
    // the walk to the platform we are changing to.
    let arrivalAtNextBoarding = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const boardStationId = stationIds[i]!;
      const alightStationId = stationIds[i + 1]!;
      const walkingSeconds = walks[i]!;

      // Get arrivals for this leg's line at its boarding station
      const pool =
        i === 0 ? originArrivals : this.extractAllArrivals(this.getArrivalsFn(boardStationId));
      const legArrivals = pool.filter((a) => a.line === line);
      if (legArrivals.length === 0) {
        return null;
      }

      const route = this.routes[line];
      const travelSeconds = this.travelTimes
        ? calculateRouteTravelTime(
            this.travelTimes,
            line,
            route?.stops ?? [],
            boardStationId,
            alightStationId
          )
        : this.estimateTravelTime(boardStationId, alightStationId);

      // Find the first arrival we can actually make (allow a little slack)
      const earliestBoarding = arrivalAtNextBoarding + walkingSeconds;
      const viableArrivals = legArrivals
        .map((a) => this.applyBDivisionBuffer(a))
        .filter((a) => a.arrivalTime >= earliestBoarding - CONNECTION_SLACK_SECONDS);

      if (viableArrivals.length === 0) {
        return null;
      }

      const chosenArrival = viableArrivals[0]!;
      const waitSeconds = i === 0 ? 0 : Math.max(0, chosenArrival.arrivalTime - earliestBoarding);

      // Skip if the wait at this transfer is too long
      if (waitSeconds > MAX_WAIT_TIME_SECONDS) {
        return null;
      }

      legs.push({
        line,
        direction: chosenArrival.direction,
        boardAt: this.getStationRef(boardStationId)!,
        alightAt: this.getStationRef(alightStationId)!,
        nextArrival: chosenArrival,
        estimatedTravelMinutes: Math.ceil(travelSeconds / 60),
        isExpress: chosenArrival.isExpress,
      });

      arrivalAtNextBoarding = chosenArrival.arrivalTime + travelSeconds;
      lastLegTravelSeconds = travelSeconds;
      totalTravelSeconds += travelSeconds;
      totalWalkingSeconds += walkingSeconds;
      totalWaitingSeconds += waitSeconds;
    }

    const firstLeg = legs[0]!;
    const lastLeg = legs[legs.length - 1]!;

    const totalMinutes = Math.ceil(
      (firstLeg.nextArrival.arrivalTime - Date.now() / 1000) / 60 +
        (totalTravelSeconds + totalWalkingSeconds + totalWaitingSeconds) / 60
    );

    // Total-travel-time guard: extra depth must not buy an absurd itinerary
    if (totalMinutes > MAX_TOTAL_TRAVEL_MINUTES) {
      return null;
    }

    return {
      legs,
      totalEstimatedMinutes: totalMinutes,
      estimatedArrivalAtDestination: Math.floor(
        lastLeg.nextArrival.arrivalTime + lastLegTravelSeconds
      ),
      timeSavedVsDirect: 0, // Will be computed later
      transferStation: this.getStationRef(stationIds[1]!)!,
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
   * Determine whether to recommend direct or transfer with detailed analysis
   */
  private determineRecommendation(
    directRoutes: DirectRoute[],
    transferRoutes: TransferRoute[],
    walkingOption?: WalkingOption,
    originId?: string,
    destinationId?: string
  ): { recommendation: "direct" | "transfer"; recommendationDetails: RecommendationDetails } {
    // Check if walking is recommended
    if (walkingOption && walkingOption.walkingIsFaster) {
      return {
        recommendation: "direct", // Keep simple type, walking is shown separately
        recommendationDetails: {
          type: "walk",
          reason: this.getWalkingReason(walkingOption),
          confidence: this.calculateDataConfidence(directRoutes, transferRoutes),
          risks: walkingOption.reason === "delays" ? ["Transit delays are unpredictable"] : [],
          timeSavedMinutes: Math.round(walkingOption.transitMinutes - walkingOption.walkingMinutes),
          isStale: this.isDataStale(directRoutes, transferRoutes),
        },
      };
    }

    if (directRoutes.length === 0 && transferRoutes.length === 0) {
      return {
        recommendation: "direct",
        recommendationDetails: {
          type: "direct",
          reason: "No routes available",
          confidence: "low",
          risks: ["No real-time data available"],
          timeSavedMinutes: 0,
          isStale: true,
        },
      };
    }

    if (directRoutes.length === 0) {
      const bestTransfer = transferRoutes[0]!;
      return {
        recommendation: "transfer",
        recommendationDetails: this.buildTransferRecommendation(
          bestTransfer,
          null,
          originId,
          destinationId
        ),
      };
    }

    if (transferRoutes.length === 0) {
      const bestDirect = directRoutes[0]!;
      return {
        recommendation: "direct",
        recommendationDetails: this.buildDirectRecommendation(bestDirect),
      };
    }

    const bestDirect = directRoutes[0]!;
    const bestTransfer = transferRoutes[0]!;

    // Calculate time saved
    bestTransfer.timeSavedVsDirect =
      bestDirect.estimatedArrivalAtDestination - bestTransfer.estimatedArrivalAtDestination;

    // Recommend transfer if it saves at least 2 minutes
    if (bestTransfer.timeSavedVsDirect >= 120) {
      return {
        recommendation: "transfer",
        recommendationDetails: this.buildTransferRecommendation(
          bestTransfer,
          bestDirect,
          originId,
          destinationId
        ),
      };
    }

    return {
      recommendation: "direct",
      recommendationDetails: this.buildDirectRecommendation(bestDirect, bestTransfer),
    };
  }

  /**
   * Build a recommendation for transfer route
   */
  private buildTransferRecommendation(
    transferRoute: TransferRoute,
    directRoute: DirectRoute | null,
    _originId?: string,
    _destinationId?: string
  ): RecommendationDetails {
    const timeSavedMinutes = Math.round(transferRoute.timeSavedVsDirect / 60);
    const risks: string[] = [];
    const legs = transferRoute.legs;

    // Analyze risks across every leg, not just the first two
    if (legs.length >= 2) {
      // Check for B Division uncertainty
      if (legs.some((leg) => isBDivision(leg.line))) {
        risks.push("B Division arrival times are estimates");
      }

      // Check for long waits at any transfer point
      for (let i = 1; i < legs.length; i++) {
        const arrivingLeg = legs[i - 1]!;
        const boardingLeg = legs[i]!;
        const waitMinutes =
          (boardingLeg.nextArrival.arrivalTime - arrivingLeg.nextArrival.arrivalTime) / 60 -
          arrivingLeg.estimatedTravelMinutes;
        if (waitMinutes > 5) {
          risks.push(`Wait ${Math.round(waitMinutes)} min at ${boardingLeg.boardAt.stationName}`);
        }
      }

      // Check for low confidence arrivals
      if (legs.some((leg) => leg.nextArrival.confidence === "low")) {
        risks.push("Low confidence in arrival times");
      }

      // Check if transfer station has accessibility issues
      const transferStation = this.stations[transferRoute.transferStation.stationId];
      if (transferStation && !transferStation.ada) {
        risks.push("Transfer station is not ADA accessible");
      }

      // Check if there are alerts on any leg
      if (legs.some((leg) => leg.nextArrival.isRerouted)) {
        risks.push("Service alerts affecting this route");
      }
    }

    const reason =
      timeSavedMinutes > 0
        ? `Transfer saves ${timeSavedMinutes} min vs direct`
        : "Transfer is the only available option";

    return {
      type: "transfer",
      reason,
      confidence: this.calculateDataConfidence([directRoute!].filter(Boolean), [transferRoute]),
      risks,
      timeSavedMinutes,
      isStale: this.isDataStale([directRoute!].filter(Boolean), [transferRoute]),
    };
  }

  /**
   * Build a recommendation for direct route
   */
  private buildDirectRecommendation(
    directRoute: DirectRoute,
    transferRoute?: TransferRoute
  ): RecommendationDetails {
    const risks: string[] = [];
    let reason = "Direct route - no transfer needed";

    // Check if route is express or local
    const routeIsExpress = this.isExpressRoute(directRoute.line);
    const firstArrival = directRoute.nextArrivals[0];
    const tripIsExpress = firstArrival?.isExpress ?? false;

    if (routeIsExpress && tripIsExpress) {
      reason = "Direct express service - fastest option";
    } else if (routeIsExpress && !tripIsExpress) {
      // This is an express route running local
      reason = "Direct route - currently running local";
    } else if (!routeIsExpress && transferRoute && transferRoute.timeSavedVsDirect > 0) {
      reason = `Direct local route - ${Math.round(transferRoute.timeSavedVsDirect / 60)} min slower than transfer`;
    }

    // Check for B Division uncertainty
    if (isBDivision(directRoute.line)) {
      risks.push("B Division arrival times are estimates");
    }

    // Check for low confidence
    if (firstArrival?.confidence === "low") {
      risks.push("Low confidence in arrival times");
    }

    // Check for reroutes
    if (firstArrival?.isRerouted) {
      risks.push("Service alerts affecting this line");
    }

    // If route is express but trip is local, note this as a consideration
    if (routeIsExpress && !tripIsExpress) {
      risks.push("Express train running local service");
    }

    return {
      type: "direct",
      reason,
      confidence: this.calculateDataConfidence([directRoute], transferRoute ? [transferRoute] : []),
      risks,
      timeSavedMinutes: 0,
      isStale: this.isDataStale([directRoute], transferRoute ? [transferRoute] : []),
    };
  }

  /**
   * Check if a route is express service based on route metadata
   */
  private isExpressRoute(routeId: string): boolean {
    const route = this.routes[routeId];
    return route?.isExpress ?? false;
  }

  /**
   * Calculate confidence level based on data freshness and quality
   */
  private calculateDataConfidence(
    directRoutes: DirectRoute[],
    transferRoutes: TransferRoute[]
  ): "high" | "medium" | "low" {
    const now = Date.now() / 1000;
    let totalConfidence = 0;
    let count = 0;

    // Check direct routes
    for (const route of directRoutes) {
      for (const arrival of route.nextArrivals) {
        const age = now - arrival.arrivalTime + arrival.minutesAway * 60;
        if (age < 60) {
          totalConfidence += 3; // Fresh
        } else if (age < 180) {
          totalConfidence += 2; // Medium
        } else {
          totalConfidence += 1; // Stale
        }
        count++;
      }
    }

    // Check transfer routes
    for (const route of transferRoutes) {
      for (const leg of route.legs) {
        const age = now - leg.nextArrival.arrivalTime + leg.nextArrival.minutesAway * 60;
        if (age < 60) {
          totalConfidence += 3;
        } else if (age < 180) {
          totalConfidence += 2;
        } else {
          totalConfidence += 1;
        }
        count++;
      }
    }

    if (count === 0) return "low";

    const avgConfidence = totalConfidence / count;
    if (avgConfidence >= 2.5) return "high";
    if (avgConfidence >= 1.5) return "medium";
    return "low";
  }

  /**
   * Check if data is stale
   */
  private isDataStale(directRoutes: DirectRoute[], transferRoutes: TransferRoute[]): boolean {
    const now = Date.now() / 1000;
    const staleThreshold = 300; // 5 minutes

    // Check direct routes
    for (const route of directRoutes) {
      for (const arrival of route.nextArrivals) {
        const age = now - (arrival.arrivalTime - arrival.minutesAway * 60);
        if (age > staleThreshold) return true;
      }
    }

    // Check transfer routes
    for (const route of transferRoutes) {
      for (const leg of route.legs) {
        const age = now - (leg.nextArrival.arrivalTime - leg.nextArrival.minutesAway * 60);
        if (age > staleThreshold) return true;
      }
    }

    return false;
  }

  /**
   * Get walking recommendation reason
   */
  private getWalkingReason(walkingOption: WalkingOption): string {
    if (walkingOption.reason === "delays") {
      return `Walking is faster than transit (${walkingOption.walkingMinutes} min vs ${walkingOption.transitMinutes} min)`;
    }
    if (walkingOption.reason === "short_trip") {
      return `Short trip - walking takes only ${walkingOption.walkingMinutes} min`;
    }
    return "Walking may be faster than waiting";
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
