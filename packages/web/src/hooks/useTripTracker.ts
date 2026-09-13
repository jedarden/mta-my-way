/**
 * useTripTracker - Poll a trip endpoint and manage trip state.
 *
 * Polls /api/trip/:tripId every 30 seconds.
 * Handles trip expiration (404 = trip left the feed).
 * Provides stop-by-stop progress derived from the raw trip data.
 * Enhances the scheduled ETA with the delay-adjusted prediction from
 * /api/trip/:tripId/predict when the predictor has history for the trip.
 * Enhanced with user-friendly error messages.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TripData } from "../lib/api";
import { api } from "../lib/api";
import { EnhancedApiError } from "../lib/apiEnhanced";
import { ErrorCategory, getUserErrorMessage } from "../lib/errorMessages";

export type DelayRisk = "low" | "medium" | "high";

export interface TripPrediction {
  baseEta: string | null;
  adjustedEta: string | null;
  remainingStops: number;
  totalStops: number;
  delayRisk: DelayRisk | null;
  delayMinutesRange: string | null;
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
  /** Delay prediction data (null when not available) */
  prediction: TripPrediction | null;
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
    progressPercent: 0,
    isLoading: !!tripId,
    error: null,
    isExpired: false,
    updatedAt: null,
    prediction: null,
  });

  const fetchGenRef = useRef(0);

  /**
   * Fetch the delay-adjusted prediction for the tracked trip.
   *
   * The prediction is supplementary: the endpoint 404s once the trip has
   * left the feed and can fail or be rate-limited independently of the trip
   * poll, so a failure just leaves the scheduled ETA in place with a null
   * prediction. An empty prediction (no predictor history for the remaining
   * legs) is treated the same way, so the prediction UI only shows when
   * there is an actual delay estimate.
   */
  const fetchPrediction = useCallback(async (tripId: string, gen: number) => {
    try {
      const data = await api.getTripPrediction(tripId);

      if (gen !== fetchGenRef.current) return;

      // The guard reads through optional chaining because this updater runs
      // inside React's reducer, where the try/catch above cannot reach it —
      // a malformed payload must degrade to "no prediction", never throw.
      setState((prev) => ({
        ...prev,
        prediction: data?.hasPredictions
          ? {
              baseEta: data.baseEta,
              adjustedEta: data.adjustedEta,
              remainingStops: data.remainingStops,
              totalStops: data.totalStops,
              delayRisk: data.delayRisk,
              delayMinutesRange: data.delayMinutesRange,
            }
          : null,
      }));
    } catch {
      if (gen !== fetchGenRef.current) return;
      setState((prev) => ({ ...prev, prediction: null }));
    }
  }, []);

  const fetchTrip = useCallback(async () => {
    if (!tripId) return;

    const gen = ++fetchGenRef.current;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const tripData = await api.getTrip(tripId);

      if (gen !== fetchGenRef.current) return;

      const stops = deriveStops(tripData);
      const nowSeconds = Math.floor(Date.now() / 1000);

      // ETA is the arrival time at the last stop
      const lastStop = tripData.stops[tripData.stops.length - 1];
      const eta = lastStop?.arrivalTime ?? null;
      const minutesToDestination =
        eta && eta > nowSeconds ? Math.round((eta - nowSeconds) / 60) : null;

      setState({
        isActive: true,
        trip: tripData,
        stops,
        eta,
        minutesToDestination,
        progressPercent: tripData.progressPercent ?? 0,
        isLoading: false,
        error: null,
        isExpired: false,
        updatedAt: Date.now(),
        prediction: null,
      });

      // Prediction rides along on each trip poll; it is an independent
      // request, so it resolves into state on its own (see fetchPrediction).
      void fetchPrediction(tripId, gen);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;

      // 404 means trip has expired
      const isExpired =
        err instanceof Error && "status" in err && (err as { status: number }).status === 404;

      // Get user-friendly error message
      let errorMessage = "Failed to load trip";
      if (isExpired) {
        errorMessage = "This train is no longer in the system. It may have completed its trip.";
      } else if (err instanceof EnhancedApiError) {
        const userError = getUserErrorMessage(err.type, "trip");
        errorMessage = userError.message;
      } else if (err instanceof Error) {
        const userError = getUserErrorMessage(ErrorCategory.UNKNOWN, "trip");
        errorMessage = userError.message;
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: isExpired ? null : errorMessage,
        isExpired,
        isActive: !isExpired,
      }));
    }
  }, [tripId, fetchPrediction]);

  // Initial fetch + polling
  useEffect(() => {
    if (!tripId) {
      setState({
        isActive: false,
        trip: null,
        stops: [],
        eta: null,
        minutesToDestination: null,
        progressPercent: 0,
        isLoading: false,
        error: null,
        isExpired: false,
        updatedAt: null,
        prediction: null,
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
      progressPercent: 0,
      isLoading: false,
      error: null,
      isExpired: false,
      updatedAt: null,
      prediction: null,
    });
  }, []);

  return {
    ...state,
    refresh: () => void fetchTrip(),
    stop,
  };
}
