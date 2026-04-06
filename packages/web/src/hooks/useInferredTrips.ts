/**
 * useInferredTrips - Detect and log inferred trips based on station visits.
 *
 * When a user opens the app at station A, then later at station B (downstream
 * on the same line), we infer they took a trip between those stations.
 *
 * Conditions for inferred trip:
 * - Station A visit recorded within last 2 hours
 * - Station B is downstream from Station A on a shared line
 * - Time between visits is reasonable (5-90 minutes)
 * - User has a saved commute matching this route
 */

import type { TripRecord } from "@mta-my-way/shared";
import { useEffect, useRef } from "react";
import { useFareStore, useFavoritesStore, useJournalStore } from "../stores";

/** Minimum time between visits to infer a trip (minutes) */
const MIN_TRIP_MINUTES = 5;

/** Maximum time between visits to infer a trip (minutes) */
const MAX_TRIP_MINUTES = 90;

/** How long to remember a station visit (ms) */
const VISIT_MEMORY_MS = 2 * 60 * 60 * 1000; // 2 hours

interface StationVisit {
  stationId: string;
  stationName: string;
  lines: string[];
  timestamp: number;
}

/** Generate a UUID for trip records */
function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

/** Format date as ISO date string */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Hook to track station visits and infer trips.
 * Call this at the app root level to track all station visits.
 */
export function useInferredTrips(
  currentStationId: string | null,
  stationName: string,
  stationLines: string[]
) {
  const commutes = useFavoritesStore((s) => s.commutes);
  const addTripRecord = useJournalStore((s) => s.addTripRecord);
  const addRideLogEntry = useFareStore((s) => s.addRideLogEntry);

  // Track last station visit in memory
  const lastVisitRef = useRef<StationVisit | null>(null);

  useEffect(() => {
    if (!currentStationId || stationLines.length === 0) return;

    const now = Date.now();
    const lastVisit = lastVisitRef.current;

    // Record this visit
    const thisVisit: StationVisit = {
      stationId: currentStationId,
      stationName,
      lines: stationLines,
      timestamp: now,
    };

    // Check if we can infer a trip
    if (lastVisit && now - lastVisit.timestamp < VISIT_MEMORY_MS) {
      const minutesElapsed = Math.round((now - lastVisit.timestamp) / (60 * 1000));

      // Check time bounds
      if (minutesElapsed >= MIN_TRIP_MINUTES && minutesElapsed <= MAX_TRIP_MINUTES) {
        // Find common lines between the two stations
        const commonLines = lastVisit.lines.filter((line) => stationLines.includes(line));

        if (commonLines.length > 0) {
          // Try to match with a saved commute
          for (const commute of commutes) {
            const originMatch = commute.origin.stationId === lastVisit.stationId;
            const destMatch = commute.destination.stationId === currentStationId;
            const lineMatch = commonLines.some((line) => commute.preferredLines.includes(line));

            if (originMatch && destMatch && lineMatch) {
              // Found a matching commute - log the inferred trip
              const record: TripRecord = {
                id: generateId(),
                date: formatDate(new Date(lastVisit.timestamp)),
                origin: { stationId: lastVisit.stationId, stationName: lastVisit.stationName },
                destination: { stationId: currentStationId, stationName },
                line: commonLines[0] ?? "",
                departureTime: Math.floor(lastVisit.timestamp / 1000),
                arrivalTime: Math.floor(now / 1000),
                actualDurationMinutes: minutesElapsed,
                source: "inferred",
              };

              addTripRecord(commute.id, record);

              // Auto-log to fare cap tracker
              addRideLogEntry({
                date: record.date,
                time: Math.floor(now / 1000),
                stationId: lastVisit.stationId,
                source: "inferred",
              });

              // Clear last visit to prevent double-counting
              lastVisitRef.current = null;
              return;
            }
          }
        }
      }
    }

    // Update last visit (only if at a station for tracking purposes)
    lastVisitRef.current = thisVisit;
  }, [currentStationId, stationName, stationLines, commutes, addTripRecord]);
}

/**
 * Hook to track station visits globally from station screens.
 * Returns a callback to report station visits.
 */
export function useStationVisitTracker() {
  const lastVisitRef = useRef<StationVisit | null>(null);

  const reportVisit = (stationId: string, stationName: string, lines: string[]) => {
    lastVisitRef.current = {
      stationId,
      stationName,
      lines,
      timestamp: Date.now(),
    };
  };

  const getLastVisit = () => lastVisitRef.current;

  return { reportVisit, getLastVisit };
}
