/**
 * useCommute - Fetch and auto-refresh commute analysis.
 *
 * Returns a DataState discriminated union similar to useArrivals:
 *   idle     - no commute configured
 *   loading  - first fetch in progress
 *   success  - data is fresh
 *   stale    - data is from cache while re-fetch is in flight
 *   error    - fetch failed
 *   offline  - device is offline
 *
 * Auto-refreshes every `refreshInterval` seconds (from settings, default 30).
 * Enhanced with user-friendly error messages.
 */

import type { CommuteAnalysis } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { EnhancedApiError } from "../lib/apiEnhanced";
import { ErrorCategory, getUserErrorMessage } from "../lib/errorMessages";
import { useSettingsStore } from "../stores/settingsStore";

export type CommuteStatus = "idle" | "loading" | "success" | "stale" | "error" | "offline";

export interface CommuteState {
  status: CommuteStatus;
  data: CommuteAnalysis | null;
  error: string | null;
  /** POSIX timestamp of the last successful fetch */
  updatedAt: number | null;
}

export type CommuteResult = CommuteState & {
  /** Trigger an immediate re-fetch */
  refresh: () => void;
};

export interface UseCommuteOptions {
  /** Origin station ID */
  originId: string | null;
  /** Destination station ID */
  destinationId: string | null;
  /** Preferred lines for routing */
  preferredLines?: string[];
  /** Commute ID for tracking */
  commuteId?: string;
}

export function useCommute(options: UseCommuteOptions): CommuteResult {
  const { originId, destinationId, preferredLines = [], commuteId = "default" } = options;

  const [state, setState] = useState<CommuteState>({
    status: originId && destinationId ? "loading" : "idle",
    data: null,
    error: null,
    updatedAt: null,
  });

  const refreshInterval = useSettingsStore((s) => s.refreshInterval);

  // Generation counter for avoiding stale responses
  const fetchGenRef = useRef(0);

  // Cache key for this commute
  const cacheKey = `${originId}-${destinationId}-${commuteId}`;

  const fetchCommute = useCallback(async () => {
    if (!originId || !destinationId) {
      setState({ status: "idle", data: null, error: null, updatedAt: null });
      return;
    }

    const gen = ++fetchGenRef.current;

    setState((prev) => ({
      ...prev,
      status: prev.data ? "stale" : "loading",
    }));

    try {
      const data = await api.analyzeCommute({
        originId,
        destinationId,
        preferredLines,
        commuteId,
      });

      if (gen !== fetchGenRef.current) return; // superseded

      setState({ status: "success", data, error: null, updatedAt: Date.now() });
    } catch (err) {
      if (gen !== fetchGenRef.current) return; // superseded

      // Get user-friendly error message
      let errorMessage = "Failed to analyze commute";
      if (err instanceof EnhancedApiError) {
        const userError = getUserErrorMessage(err.type, "commute");
        errorMessage = userError.message;
      } else {
        const userError = getUserErrorMessage(ErrorCategory.UNKNOWN, "commute");
        errorMessage = userError.message;
      }

      setState({
        status: navigator.onLine ? "error" : "offline",
        data: null,
        error: errorMessage,
        updatedAt: null,
      });
    }
  }, [originId, destinationId, preferredLines, commuteId]);

  useEffect(() => {
    if (!originId || !destinationId) {
      setState({ status: "idle", data: null, error: null, updatedAt: null });
      return;
    }

    void fetchCommute();

    // Auto-refresh on interval
    const interval = setInterval(() => {
      void fetchCommute();
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [cacheKey, refreshInterval, fetchCommute]);

  return {
    ...state,
    refresh: () => {
      void fetchCommute();
    },
  };
}

/**
 * Get the best route from a commute analysis
 * Returns the fastest option (either direct or transfer)
 */
export function getBestRoute(analysis: CommuteAnalysis): {
  type: "direct" | "transfer";
  minutes: number;
  timeSaved: number;
} | null {
  const bestDirect = analysis.directRoutes[0];
  const bestTransfer = analysis.transferRoutes[0];

  if (!bestDirect && !bestTransfer) return null;

  if (!bestTransfer) {
    return {
      type: "direct",
      minutes: bestDirect?.estimatedTravelMinutes ?? 0,
      timeSaved: 0,
    };
  }

  if (!bestDirect) {
    return {
      type: "transfer",
      minutes: bestTransfer.totalEstimatedMinutes,
      timeSaved: bestTransfer.timeSavedVsDirect / 60,
    };
  }

  // Compare and return the faster option
  if (analysis.recommendation === "transfer" && bestTransfer.timeSavedVsDirect >= 120) {
    return {
      type: "transfer",
      minutes: bestTransfer.totalEstimatedMinutes,
      timeSaved: bestTransfer.timeSavedVsDirect / 60,
    };
  }

  return {
    type: "direct",
    minutes: bestDirect.estimatedTravelMinutes,
    timeSaved: 0,
  };
}
