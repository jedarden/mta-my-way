/**
 * useTripJournal - Hook for logging trips to the commute journal.
 *
 * Provides:
 * - Auto-logging when a trip completes
 * - Matching trips to saved commutes (by origin/destination/line)
 * - Anomaly detection with UI feedback
 */

import type { CommuteStats, TripRecord } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef } from "react";
import { type AnomalyResult, useFareStore, useFavoritesStore, useJournalStore } from "../stores";
import type { TripStopProgress } from "./useTripTracker";

/** Generate a UUID for trip records */
function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

/** Format date as ISO date string */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Find a matching commute for the given origin/destination/line */
function findMatchingCommute(
  commutes: ReturnType<typeof useFavoritesStore.getState>["commutes"],
  originStationId: string,
  destinationStationId: string,
  line: string
): string | null {
  for (const commute of commutes) {
    // Match by stationId from StationRef
    const originMatch = commute.origin.stationId === originStationId;
    const destMatch = commute.destination.stationId === destinationStationId;
    const lineMatch = commute.preferredLines.includes(line);

    if (originMatch && destMatch && lineMatch) {
      return commute.id;
    }
  }
  return null;
}

export interface UseTripJournalOptions {
  /** Origin station ID */
  originStationId: string | null;
  /** Origin station name */
  originStationName: string;
  /** Destination station ID */
  destinationStationId: string | null;
  /** Destination station name */
  destinationStationName: string;
  /** Line being traveled */
  line: string;
  /** Trip stops for deriving timing info */
  stops: TripStopProgress[];
  /** Whether the trip is expired/complete */
  isExpired: boolean;
  /** Whether tracking is active */
  isActive: boolean;
}

export interface TripJournalResult {
  /** Log a completed trip (manual or automatic) */
  logTrip: (source?: TripRecord["source"]) => TripRecord | null;
  /** Detect if current duration is anomalous */
  detectAnomaly: (durationMinutes: number) => AnomalyResult | null;
  /** Get stats for matching commute */
  getCommuteStats: () => CommuteStats | null;
  /** The matching commute ID if found */
  matchedCommuteId: string | null;
  /** Whether this trip was just logged (for UI feedback) */
  wasLogged: boolean;
}

/**
 * Hook for journaling trip data with automatic commute matching.
 *
 * Usage:
 * ```tsx
 * const { logTrip, matchedCommuteId, detectAnomaly } = useTripJournal({
 *   originStationId: "725",
 *   originStationName: "Times Sq-42 St",
 *   destinationStationId: "238",
 *   destinationStationName: "Canal St",
 *   line: "1",
 *   stops,
 *   isExpired,
 *   isActive,
 * });
 * ```
 */
export function useTripJournal(options: UseTripJournalOptions): TripJournalResult {
  const {
    originStationId,
    originStationName,
    destinationStationId,
    destinationStationName,
    line,
    stops,
    isExpired,
    isActive,
  } = options;

  const commutes = useFavoritesStore((s) => s.commutes);
  const addTripRecord = useJournalStore((s) => s.addTripRecord);
  const addRideLogEntry = useFareStore((s) => s.addRideLogEntry);
  const detectAnomalyFromStore = useJournalStore((s) => s.detectAnomaly);
  const getCommuteStatsFromStore = useJournalStore((s) => s.stats);

  // Track if we've logged this trip to prevent duplicates
  const loggedRef = useRef(false);

  // Reset logged state when trip becomes active again
  useEffect(() => {
    if (isActive && !isExpired) {
      loggedRef.current = false;
    }
  }, [isActive, isExpired]);

  // Find matching commute
  const matchedCommuteId =
    originStationId && destinationStationId
      ? findMatchingCommute(commutes, originStationId, destinationStationId, line)
      : null;

  // Get stats for the matched commute
  const getCommuteStats = useCallback((): CommuteStats | null => {
    if (!matchedCommuteId) return null;
    return getCommuteStatsFromStore[matchedCommuteId] ?? null;
  }, [matchedCommuteId, getCommuteStatsFromStore]);

  // Log a completed trip
  const logTrip = useCallback(
    (source: TripRecord["source"] = "tracked"): TripRecord | null => {
      // Prevent duplicate logging
      if (loggedRef.current) return null;

      // Need valid stations and commute match
      if (!originStationId || !destinationStationId || !matchedCommuteId) {
        return null;
      }

      // Get timing from stops
      const firstStop = stops[0];
      const lastStop = stops[stops.length - 1];
      if (!firstStop || !lastStop) return null;

      const departureTime = firstStop.departureTime ?? firstStop.arrivalTime ?? Date.now() / 1000;
      const arrivalTime = lastStop.arrivalTime ?? Date.now() / 1000;
      const durationMinutes = Math.round((arrivalTime - departureTime) / 60);

      // Skip invalid trips (negative or extremely short/long duration)
      if (durationMinutes < 1 || durationMinutes > 300) return null;

      const record: TripRecord = {
        id: generateId(),
        date: formatDate(new Date()),
        origin: { stationId: originStationId, stationName: originStationName },
        destination: { stationId: destinationStationId, stationName: destinationStationName },
        line,
        departureTime,
        arrivalTime,
        actualDurationMinutes: durationMinutes,
        source,
      };

      addTripRecord(matchedCommuteId, record);

      // Auto-log to fare cap tracker (manual trips count as tracked for fares)
      addRideLogEntry({
        date: record.date,
        time: Math.floor(Date.now() / 1000),
        stationId: originStationId,
        source: source === "manual" ? "tracked" : source,
      });

      loggedRef.current = true;

      return record;
    },
    [
      originStationId,
      destinationStationId,
      matchedCommuteId,
      stops,
      originStationName,
      destinationStationName,
      line,
      addTripRecord,
    ]
  );

  // Detect anomaly for current duration
  const detectAnomaly = useCallback(
    (durationMinutes: number): AnomalyResult | null => {
      if (!matchedCommuteId) return null;
      const dayOfWeek = new Date().getDay();
      return detectAnomalyFromStore(matchedCommuteId, durationMinutes, dayOfWeek);
    },
    [matchedCommuteId, detectAnomalyFromStore]
  );

  // Auto-log when trip expires (completes)
  useEffect(() => {
    if (isExpired && !loggedRef.current && matchedCommuteId) {
      logTrip("tracked");
    }
  }, [isExpired, matchedCommuteId, logTrip]);

  return {
    logTrip,
    detectAnomaly,
    getCommuteStats,
    matchedCommuteId,
    wasLogged: loggedRef.current,
  };
}
