/**
 * Predictive delay detection from VehiclePosition diffs.
 *
 * Tracks each tripId's position across consecutive 30s polls. When a train's
 * actual inter-station traversal time exceeds the scheduled baseline by a
 * configurable multiplier, a synthetic early-warning alert is generated.
 *
 * Design decisions:
 * - Conservative defaults: 2.0x threshold, 2-train minimum for line alerts
 * - A Division (ATS) produces better predictions than B Division (Bluetooth)
 * - Terminal stations excluded — trains legitimately dwell there
 * - Predicted alerts use source: "predicted" and severity: "warning"
 */

import type { RouteIndex, StationAlert, StationIndex, TravelTimeIndex } from "@mta-my-way/shared";
import { isADivision } from "@mta-my-way/shared";
import { getTravelTime } from "./transfer/travel-times.js";

// Import delay predictor for historical data collection
import { recordDelay as recordDelayForPrediction } from "./delay-predictor.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default delay threshold: actual must be ≥ this × scheduled */
const DEFAULT_THRESHOLD_MULTIPLIER = 2.0;

/** Minimum number of delayed trains on a line before escalating */
const DEFAULT_MIN_TRAINS_FOR_LINE_ALERT = 2;

/** Minimum observation time (seconds) before flagging a segment as delayed.
 *  Prevents false positives from brief stops at signals. */
const MIN_OBSERVATION_SECONDS = 60;

/** Maximum age (ms) for a trip entry before it's pruned.
 *  Trips that disappear from feeds for this long are cleaned up. */
const TRIP_MAX_AGE_MS = 5 * 60_000;

/** Maximum number of tracked trips to prevent unbounded memory growth */
const MAX_TRACKED_TRIPS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single position observation for a trip */
interface PositionObservation {
  /** Platform stop ID (e.g., "725N") */
  stopId: string;
  /** Parent station ID (e.g., "725") */
  stationId: string;
  /** Stop sequence number from VehiclePosition */
  stopSequence: number;
  /** Timestamp (POSIX seconds) of this observation */
  timestamp: number;
  /** Vehicle status */
  status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
}

/** Tracked state for a single trip */
interface TripTrack {
  tripId: string;
  routeId: string;
  direction: "N" | "S";
  /** Historical position observations (ring buffer, newest last) */
  observations: PositionObservation[];
  /** Whether we've already flagged a delay for this trip's current segment */
  currentSegmentFlagged: boolean;
  /** First observation timestamp for age tracking */
  firstSeenAt: number;
}

/** A detected delay on a specific segment */
interface DelayedSegment {
  routeId: string;
  direction: "N" | "S";
  fromStationId: string;
  toStationId: string;
  /** Actual traversal time in seconds */
  actualSeconds: number;
  /** Scheduled traversal time in seconds */
  scheduledSeconds: number;
  /** Delay ratio (actual / scheduled) */
  ratio: number;
  /** Trip ID that triggered this */
  tripId: string;
  /** Timestamp when detected */
  detectedAt: number;
}

/** Delay detector configuration */
export interface DelayDetectorConfig {
  /** Multiplier for delay threshold (default: 2.0) */
  thresholdMultiplier?: number;
  /** Minimum trains for line-level alert (default: 2) */
  minTrainsForLineAlert?: number;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const trackedTrips = new Map<string, TripTrack>();
let config: Required<DelayDetectorConfig>;
let travelTimes: TravelTimeIndex | null = null;
let routes: RouteIndex | null = null;
let stations: StationIndex | null = null;

/** Active predicted alerts, keyed by alert ID */
const activePredictedAlerts = new Map<string, StationAlert>();

/** Listeners for new predicted alerts */
const alertListeners: Array<(alerts: StationAlert[]) => void> = [];

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the delay detector with dependencies.
 * Must be called once at server startup after static data is loaded.
 */
export function initDelayDetector(
  travelTimesData: TravelTimeIndex,
  routeData: RouteIndex,
  stationData: StationIndex,
  detectorConfig?: DelayDetectorConfig
): void {
  travelTimes = travelTimesData;
  routes = routeData;
  stations = stationData;
  config = {
    thresholdMultiplier: detectorConfig?.thresholdMultiplier ?? DEFAULT_THRESHOLD_MULTIPLIER,
    minTrainsForLineAlert:
      detectorConfig?.minTrainsForLineAlert ?? DEFAULT_MIN_TRAINS_FOR_LINE_ALERT,
  };

  console.log(
    JSON.stringify({
      event: "delay_detector_init",
      timestamp: new Date().toISOString(),
      threshold_multiplier: config.thresholdMultiplier,
      min_trains_for_line_alert: config.minTrainsForLineAlert,
    })
  );
}

// ---------------------------------------------------------------------------
// VehiclePosition extraction
// ---------------------------------------------------------------------------

/**
 * Extract VehiclePosition observations from a parsed GTFS-RT feed.
 * Called by the poller after each successful feed parse.
 */
export function extractVehiclePositions(
  feedId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any
): Array<{
  tripId: string;
  routeId: string;
  direction: "N" | "S";
  currentStopSequence: number;
  currentStopId: string;
  status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
  timestamp: number;
  isAssigned: boolean;
  destination: string;
  delay?: number;
}> {
  if (!message?.entity) return [];

  const NYCT_TRIP_KEY = ".transit_realtime.nyctTripDescriptor";
  const positions: Array<{
    tripId: string;
    routeId: string;
    direction: "N" | "S";
    currentStopSequence: number;
    currentStopId: string;
    status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
    timestamp: number;
    isAssigned: boolean;
    destination: string;
    delay?: number;
  }> = [];

  for (const entity of message.entity) {
    if (!entity.vehicle) continue;
    if (entity.isDeleted) continue;

    const vp = entity.vehicle;
    const trip = vp.trip;
    if (!trip?.routeId || !trip?.tripId) continue;

    // NYCT direction extension
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nyctTrip = (trip as any)[NYCT_TRIP_KEY] as
      | { direction?: number; isAssigned?: boolean }
      | null
      | undefined;

    let direction: "N" | "S" = "N";
    if (nyctTrip?.direction === 3)
      direction = "S"; // SOUTH = 3
    else if (nyctTrip?.direction === 1) direction = "N"; // NORTH = 1

    const stopId = vp.stopId ?? "";
    const stopSequence = vp.currentStopSequence ?? 0;
    const isAssigned = nyctTrip?.isAssigned ?? false;

    // Map status
    let status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO" = "IN_TRANSIT_TO";
    const vpStatus = vp.current_status;
    if (vpStatus === 0) status = "INCOMING_AT";
    else if (vpStatus === 1) status = "STOPPED_AT";
    else if (vpStatus === 2) status = "IN_TRANSIT_TO";

    const timestamp = vp.timestamp
      ? typeof vp.timestamp === "number"
        ? vp.timestamp
        : (vp.timestamp.toNumber?.() ?? 0)
      : 0;

    // Extract destination from StopTimeUpdate if available (last stop in the trip)
    let destination = "";
    if (entity.tripUpdate?.stopTimeUpdate) {
      const updates = entity.tripUpdate.stopTimeUpdate;
      if (updates.length > 0) {
        const lastStop = updates[updates.length - 1];
        // Get stop name from our stations index (will be resolved later)
        destination = lastStop?.stopId ?? "";
      }
    }

    // Also try to get delay from the stop time updates
    let delay: number | undefined;
    if (entity.tripUpdate?.stopTimeUpdate) {
      for (const stu of entity.tripUpdate.stopTimeUpdate) {
        if (stu.stopId === stopId || stu.stopSequence === stopSequence) {
          delay = stu.arrival?.delay ?? stu.departure?.delay ?? undefined;
          if (typeof delay === "object" && delay !== null && "toNumber" in delay) {
            delay = delay.toNumber();
          }
          break;
        }
      }
    }

    if (timestamp === 0 || !stopId) continue;

    positions.push({
      tripId: trip.tripId,
      routeId: trip.routeId,
      direction,
      currentStopSequence: stopSequence,
      currentStopId: stopId,
      status,
      timestamp,
      isAssigned,
      destination,
      delay,
    });
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Core detection logic
// ---------------------------------------------------------------------------

/**
 * Process a batch of VehiclePosition updates (called after each poll cycle).
 * Compares new positions against tracked history to detect delays.
 */
export function processVehicleUpdates(
  allPositions: Array<{
    tripId: string;
    routeId: string;
    direction: "N" | "S";
    currentStopSequence: number;
    currentStopId: string;
    status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
    timestamp: number;
    isAssigned: boolean;
  }>
): DelayedSegment[] {
  if (!travelTimes || !routes || !stations) return [];

  const now = Date.now();
  const delayedSegments: DelayedSegment[] = [];

  // Prune old trips
  pruneOldTrips(now);

  // Process each position update
  for (const pos of allPositions) {
    // Resolve stopId to parent stationId
    const stationId = resolveStationId(pos.currentStopId);
    if (!stationId) continue;

    const track = trackedTrips.get(pos.tripId);

    if (!track) {
      // New trip — start tracking
      if (trackedTrips.size >= MAX_TRACKED_TRIPS) continue;

      trackedTrips.set(pos.tripId, {
        tripId: pos.tripId,
        routeId: pos.routeId,
        direction: pos.direction,
        observations: [
          {
            stopId: pos.currentStopId,
            stationId,
            stopSequence: pos.currentStopSequence,
            timestamp: pos.timestamp,
            status: pos.status,
          },
        ],
        currentSegmentFlagged: false,
        firstSeenAt: now,
      });
      continue;
    }

    // Existing trip — check for movement
    const lastObs = track.observations[track.observations.length - 1];
    if (!lastObs) continue;

    // Skip if the position hasn't changed (same stop, similar timestamp)
    if (lastObs.stationId === stationId && Math.abs(pos.timestamp - lastObs.timestamp) < 15) {
      // Update timestamp but don't process
      lastObs.timestamp = pos.timestamp;
      lastObs.status = pos.status;
      continue;
    }

    // Check if the train has moved to a new stop
    if (stationId !== lastObs.stationId && pos.currentStopSequence > lastObs.stopSequence) {
      // Train moved — compute traversal time for the segment
      const traversalTime = pos.timestamp - lastObs.timestamp;

      if (traversalTime > 0 && traversalTime >= MIN_OBSERVATION_SECONDS) {
        const scheduled = getScheduledTravelTime(pos.routeId, lastObs.stationId, stationId);

        if (scheduled > 0) {
          const ratio = traversalTime / scheduled;

          if (ratio >= config.thresholdMultiplier) {
            // Check we're not at a terminal
            if (
              !isTerminalStop(pos.routeId, lastObs.stationId) &&
              !isTerminalStop(pos.routeId, stationId)
            ) {
              const segment: DelayedSegment = {
                routeId: pos.routeId,
                direction: pos.direction,
                fromStationId: lastObs.stationId,
                toStationId: stationId,
                actualSeconds: traversalTime,
                scheduledSeconds: scheduled,
                ratio,
                tripId: pos.tripId,
                detectedAt: now,
              };

              if (!track.currentSegmentFlagged) {
                delayedSegments.push(segment);
                track.currentSegmentFlagged = true;

                // Record delay for predictive modeling
                try {
                  recordDelayForPrediction(
                    segment.routeId,
                    segment.direction,
                    segment.fromStationId,
                    segment.toStationId,
                    segment.actualSeconds,
                    segment.scheduledSeconds,
                    segment.tripId
                  );
                } catch (error) {
                  // Don't let prediction errors affect delay detection
                  console.error("Failed to record delay for prediction:", error);
                }
              }
            }
          } else {
            track.currentSegmentFlagged = false;
          }
        }
      }

      // Add new observation
      track.observations.push({
        stopId: pos.currentStopId,
        stationId,
        stopSequence: pos.currentStopSequence,
        timestamp: pos.timestamp,
        status: pos.status,
      });

      // Keep only last 20 observations per trip
      if (track.observations.length > 20) {
        track.observations.shift();
      }
    } else {
      // Same station but new timestamp — just update
      lastObs.timestamp = pos.timestamp;
      lastObs.status = pos.status;
      lastObs.stopSequence = pos.currentStopSequence;
    }
  }

  // Generate alerts from delayed segments
  if (delayedSegments.length > 0) {
    generateAlerts(delayedSegments);
  }

  return delayedSegments;
}

// ---------------------------------------------------------------------------
// Alert generation
// ---------------------------------------------------------------------------

/**
 * Generate predicted alerts from detected delayed segments.
 * Creates single-train alerts and escalates to line-level when threshold met.
 */
function generateAlerts(segments: DelayedSegment[]): void {
  const now = Date.now();

  // Group by route + direction for line-level detection
  const lineGroups = new Map<string, DelayedSegment[]>();
  for (const seg of segments) {
    const key = `${seg.routeId}:${seg.direction}`;
    if (!lineGroups.has(key)) lineGroups.set(key, []);
    lineGroups.get(key)!.push(seg);
  }

  const newAlerts: StationAlert[] = [];

  for (const [lineKey, lineSegments] of lineGroups) {
    const [routeId, direction] = lineKey.split(":");
    const route = routes?.[routeId];
    const lineName = route?.shortName ?? routeId;
    const directionLabel = direction === "N" ? "Northbound" : "Southbound";
    const division = isADivision(routeId) ? "A" : "B";

    // Get unique segments (deduplicate by from→to)
    const uniqueSegments = new Map<string, DelayedSegment>();
    for (const seg of lineSegments) {
      const segKey = `${seg.fromStationId}:${seg.toStationId}`;
      if (!uniqueSegments.has(segKey)) {
        uniqueSegments.set(segKey, seg);
      }
    }

    // Line-level alert: multiple trains or multiple segments delayed
    if (lineSegments.length >= config.minTrainsForLineAlert || uniqueSegments.size >= 2) {
      const maxSegment = lineSegments.reduce((a, b) => (a.ratio > b.ratio ? a : b));
      const fromStation = stations?.[maxSegment.fromStationId]?.name ?? maxSegment.fromStationId;
      const toStation = stations?.[maxSegment.toStationId]?.name ?? maxSegment.toStationId;

      const alertId = `predicted-line-${routeId}-${direction}-${Math.floor(now / 300_000)}`;
      const existingAlert = activePredictedAlerts.get(alertId);

      if (!existingAlert) {
        const alert: StationAlert = {
          id: alertId,
          severity: "warning",
          source: "predicted",
          headline: `${directionLabel} ${lineName} trains running slowly`,
          description: `Multiple ${directionLabel.toLowerCase()} ${lineName} trains are experiencing significant delays. Worst segment: ${fromStation} to ${toStation} (${Math.round(maxSegment.ratio)}x scheduled time). Division: ${division} Division.`,
          affectedLines: [routeId],
          activePeriod: { start: Math.floor(now / 1000) },
          cause: "DETECTED_DELAY",
          effect: "SIGNIFICANT_DELAYS",
        };
        activePredictedAlerts.set(alertId, alert);
        newAlerts.push(alert);

        console.log(
          JSON.stringify({
            event: "predicted_line_alert",
            timestamp: new Date().toISOString(),
            routeId,
            direction,
            segments: uniqueSegments.size,
            trains: lineSegments.length,
            max_ratio: Math.round(maxSegment.ratio * 100) / 100,
          })
        );
      } else {
        // Update existing alert
        existingAlert.description = `Multiple ${directionLabel.toLowerCase()} ${lineName} trains are experiencing significant delays. Worst segment: ${fromStation} to ${toStation} (${Math.round(maxSegment.ratio)}x scheduled time). Division: ${division} Division.`;
        existingAlert.activePeriod.start = Math.floor(now / 1000);
      }
    } else {
      // Single-train alert
      const seg = lineSegments[0];
      if (!seg) continue;
      const fromStation = stations?.[seg.fromStationId]?.name ?? seg.fromStationId;
      const toStation = stations?.[seg.toStationId]?.name ?? seg.toStationId;

      const alertId = `predicted-train-${seg.tripId}-${Math.floor(now / 300_000)}`;
      const existingAlert = activePredictedAlerts.get(alertId);

      if (!existingAlert) {
        const alert: StationAlert = {
          id: alertId,
          severity: "info",
          source: "predicted",
          headline: `${lineName} train delayed near ${fromStation}`,
          description: `A ${directionLabel.toLowerCase()} ${lineName} train is taking ${Math.round(seg.ratio)}x longer than scheduled between ${fromStation} and ${toStation}. Division: ${division} Division.`,
          affectedLines: [routeId],
          activePeriod: { start: Math.floor(now / 1000) },
          cause: "DETECTED_DELAY",
          effect: "DELAY",
        };
        activePredictedAlerts.set(alertId, alert);
        newAlerts.push(alert);

        console.log(
          JSON.stringify({
            event: "predicted_train_alert",
            timestamp: new Date().toISOString(),
            routeId,
            direction,
            tripId: seg.tripId,
            ratio: Math.round(seg.ratio * 100) / 100,
            from: seg.fromStationId,
            to: seg.toStationId,
          })
        );
      }
    }
  }

  // Prune stale predicted alerts (older than 10 minutes without refresh)
  pruneStaleAlerts(now);

  // Notify listeners
  if (newAlerts.length > 0) {
    for (const listener of alertListeners) {
      try {
        listener(newAlerts);
      } catch {
        // Swallow listener errors
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a platform stop ID (e.g., "725N") to its parent station ID ("725").
 */
function resolveStationId(stopId: string): string | null {
  if (!stations || !stopId) return null;

  // Check if it's already a parent station ID
  if (stations[stopId]) return stopId;

  // Try stripping direction suffix (N/S)
  for (const suffix of ["N", "S"]) {
    const candidate = stopId.slice(0, -1);
    if (stopId.endsWith(suffix) && stations[candidate]) {
      return candidate;
    }
  }

  // Try looking up by northStopId/southStopId
  for (const station of Object.values(stations)) {
    if (station.northStopId === stopId || station.southStopId === stopId) {
      return station.id;
    }
  }

  return null;
}

/**
 * Get the scheduled travel time between two stations on a route.
 * Returns 0 if not found (caller should skip in that case).
 */
function getScheduledTravelTime(
  routeId: string,
  fromStationId: string,
  toStationId: string
): number {
  if (!travelTimes) return 0;
  return getTravelTime(travelTimes, routeId, fromStationId, toStationId);
}

/**
 * Check if a station is a terminal stop for a route (first or last in stop list).
 */
function isTerminalStop(routeId: string, stationId: string): boolean {
  const route = routes?.[routeId];
  if (!route || route.stops.length === 0) return false;

  return route.stops[0] === stationId || route.stops[route.stops.length - 1] === stationId;
}

/**
 * Prune old trip tracks to prevent memory leaks.
 */
function pruneOldTrips(now: number): void {
  for (const [tripId, track] of trackedTrips) {
    if (now - track.firstSeenAt > TRIP_MAX_AGE_MS) {
      trackedTrips.delete(tripId);
    }
  }
}

/**
 * Prune stale predicted alerts (older than 10 minutes without update).
 */
function pruneStaleAlerts(now: number): void {
  const staleThreshold = 10 * 60_000; // 10 minutes
  for (const [alertId, alert] of activePredictedAlerts) {
    const alertAge = now - alert.activePeriod.start * 1000;
    if (alertAge > staleThreshold) {
      activePredictedAlerts.delete(alertId);

      console.log(
        JSON.stringify({
          event: "predicted_alert_expired",
          timestamp: new Date().toISOString(),
          alertId,
          age_seconds: Math.floor(alertAge / 1000),
        })
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all active predicted alerts.
 */
export function getPredictedAlerts(): StationAlert[] {
  return Array.from(activePredictedAlerts.values());
}

/**
 * Get the count of currently tracked trips.
 */
export function getTrackedTripCount(): number {
  return trackedTrips.size;
}

/**
 * Register a listener for new predicted alerts.
 * Returns an unsubscribe function.
 */
export function onPredictedAlert(listener: (alerts: StationAlert[]) => void): () => void {
  alertListeners.push(listener);
  return () => {
    const index = alertListeners.indexOf(listener);
    if (index >= 0) alertListeners.splice(index, 1);
  };
}

/**
 * Reset all internal state. For testing only.
 */
export function resetDelayDetector(): void {
  trackedTrips.clear();
  activePredictedAlerts.clear();
  alertListeners.length = 0;
}

/**
 * Get delay detector status for health endpoint.
 */
export function getDelayDetectorStatus(): {
  trackedTrips: number;
  activeAlerts: number;
  thresholdMultiplier: number;
  minTrainsForLineAlert: number;
} {
  return {
    trackedTrips: trackedTrips.size,
    activeAlerts: activePredictedAlerts.size,
    thresholdMultiplier: config.thresholdMultiplier,
    minTrainsForLineAlert: config.minTrainsForLineAlert,
  };
}
