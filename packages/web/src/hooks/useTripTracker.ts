/**
 * useTripTracker - Poll a trip endpoint and manage trip state.
 *
 * Polls /api/trip/:tripId every 30 seconds.
 * Handles trip expiration (404 = trip left the feed).
 * Provides stop-by-stop progress derived from the raw trip data.
 * Enhanced with delay predictions for ETA adjustment.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TripData } from "../lib/api";
import { api } from "../lib/api";

export type DelayRisk = "low" | "medium" | "high" | null;

export interface TripPrediction {
  /** Progress percentage (0-100) */
  progressPercent: number;
  /** Remaining stops count */
  remainingStops: number;
  /** Total stops count */
  totalStops: number;
  /** Base ETA in ISO format */
  baseEta: string | null;
  /** Adjusted ETA in ISO format (with delay prediction) */
  adjustedEta: string | null;
  /** Delay risk level */
  delayRisk: DelayRisk;
  /** Delay range as human-readable string (e.g., "+5 min") */
  delayMinutesRange: string | null;
  /** Route-level delay probability (0-1) */
  routeDelayProbability: number | null;
  /** Whether we have delay predictions for this trip */
  hasPredictions: boolean;
  /** When prediction was generated */
  generatedAt: string;
}

export interface TripStopProgress {
  stopId: string;
  stationId: string | null;
  stationName: string;
  status: "passed" | "current" | "next" | "upcoming" | "destination";
  arrivalTime: number | null;
  departureTime: number | null;
  minutesAway: number | null;
}

export interface TripTrackerState {
  /** Whether we're actively tracking */
  isActive: boolean;
  /** The trip data from the API (null while loading or expired) */
  trip: TripData | null;
  /** Derived stop progress */
  stops: TripStopProgress[];
  /** ETA at the final destination in seconds */
  eta: number | null;
  /** Minutes until destination */
  minutesToDestination: number | null;
  /** Trip prediction with delay adjustments */
  prediction: TripPrediction | null;
  /** Progress percentage */
  progressPercent: number;
  /** Loading state */
  isLoading: boolean;
  /** Error message or null */
  error: string | null;
  /** Whether the trip has expired (no longer in feed) */
  isExpired: boolean;
  /** Last update timestamp */
  updatedAt: number | null;
}

const POLL_INTERVAL_MS = 30_000;

function deriveStops(trip: TripData): TripStopProgress[] {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const { stops, currentStopIndex } = trip;
  const lastStopIndex = stops.length - 1;

  return stops.map((stop, index) => {
    let status: TripStopProgress["status"];

    // Check destination first - the last stop is always the destination
    if (index === lastStopIndex) {
      status = "destination";
    } else if (index <= currentStopIndex) {
      status = index === currentStopIndex ? "current" : "passed";
    } else if (index === currentStopIndex + 1) {
      status = "next";
    } else {
      status = "upcoming";
    }

    const arrivalTime = stop.arrivalTime;
    let minutesAway: number | null = null;
    if (arrivalTime && arrivalTime > nowSeconds) {
      minutesAway = Math.round((arrivalTime - nowSeconds) / 60);
    }

    return {
      stopId: stop.stopId,
      stationId: stop.stationId,
      stationName: stop.stationName,
      status,
      arrivalTime: stop.arrivalTime,
      departureTime: stop.departureTime,
      minutesAway,
    };
  });
}

export function useTripTracker(
  tripId: string | null
): TripTrackerState & { refresh: () => void; stop: () => void } {
  const [state, setState] = useState<TripTrackerState>({
    isActive: !!tripId,
    trip: null,
    stops: [],
    eta: null,
    minutesToDestination: null,
    prediction: null,
    progressPercent: 0,
    isLoading: !!tripId,
    error: null,
    isExpired: false,
    updatedAt: null,
  });

  const fetchGenRef = useRef(0);

  const fetchTrip = useCallback(async () => {
    if (!tripId) return;

    const gen = ++fetchGenRef.current;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const [trip, predictionRes] = await Promise.allSettled([
        api.getTrip(tripId),
        // Fetch prediction separately - if it fails, we still have base trip data
        fetch(
          `${import.meta.env.VITE_API_BASE || ""}/api/trip/${encodeURIComponent(tripId)}/predict`
        )
          .then((res) => (res.ok ? (res.json() as Promise<TripPrediction>) : null))
          .catch(() => null),
      ]);

      if (gen !== fetchGenRef.current) return;

      // Handle trip data
      if (trip.status === "rejected") {
        throw trip.reason;
      }

      const tripData = trip.value;
      const stops = deriveStops(tripData);
      const nowSeconds = Math.floor(Date.now() / 1000);

      // ETA is the arrival time at the last stop
      const lastStop = tripData.stops[tripData.stops.length - 1];
      const eta = lastStop?.arrivalTime ?? null;
      const minutesToDestination =
        eta && eta > nowSeconds ? Math.round((eta - nowSeconds) / 60) : null;

      // Handle prediction data
      const prediction =
        predictionRes.status === "fulfilled" && predictionRes.value ? predictionRes.value : null;

      setState({
        isActive: true,
        trip: tripData,
        stops,
        eta,
        minutesToDestination,
        prediction,
        progressPercent: tripData.progressPercent ?? 0,
        isLoading: false,
        error: null,
        isExpired: false,
        updatedAt: Date.now(),
      });
    } catch (err) {
      if (gen !== fetchGenRef.current) return;

      // 404 means trip has expired
      const isExpired =
        err instanceof Error && "status" in err && (err as { status: number }).status === 404;

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: isExpired ? null : err instanceof Error ? err.message : "Failed to load trip",
        isExpired,
        isActive: !isExpired,
      }));
    }
  }, [tripId]);

  // Initial fetch + polling
  useEffect(() => {
    if (!tripId) {
      setState({
        isActive: false,
        trip: null,
        stops: [],
        eta: null,
        minutesToDestination: null,
        prediction: null,
        progressPercent: 0,
        isLoading: false,
        error: null,
        isExpired: false,
        updatedAt: null,
      });
      return;
    }

    void fetchTrip();
    const interval = setInterval(() => void fetchTrip(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [tripId, fetchTrip]);

  // Stop tracking
  const stop = useCallback(() => {
    fetchGenRef.current++;
    setState({
      isActive: false,
      trip: null,
      stops: [],
      eta: null,
      minutesToDestination: null,
      prediction: null,
      progressPercent: 0,
      isLoading: false,
      error: null,
      isExpired: false,
      updatedAt: null,
    });
  }, []);

  return {
    ...state,
    refresh: () => void fetchTrip(),
    stop,
  };
}
