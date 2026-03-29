/**
 * usePositions - Fetch and auto-refresh train positions for a line.
 *
 * Returns a DataState discriminated union:
 *   idle     - no lineId provided
 *   loading  - first fetch in progress, no cached data
 *   success  - data is fresh
 *   stale    - data is from cache while a re-fetch is in flight
 *   error    - fetch failed, no usable cached data
 *   offline  - device is offline; may have stale data
 *
 * Auto-refreshes every 30 seconds (matches feed polling interval).
 * Provides a manual `refresh()` that optionally triggers haptic feedback.
 */

import type { LineDiagramData } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export type PositionsStatus = "idle" | "loading" | "success" | "stale" | "error" | "offline";

export interface PositionsState {
  status: PositionsStatus;
  data: LineDiagramData | null;
  error: string | null;
  /** POSIX timestamp of the last successful fetch */
  updatedAt: number | null;
}

export type PositionsResult = PositionsState & {
  /** Trigger an immediate re-fetch (with optional haptic on mobile) */
  refresh: () => void;
};

/** Refresh interval in milliseconds - matches feed polling interval */
const REFRESH_INTERVAL_MS = 30_000;

export function usePositions(lineId: string | null): PositionsResult {
  const [state, setState] = useState<PositionsState>({
    status: lineId ? "loading" : "idle",
    data: null,
    error: null,
    updatedAt: null,
  });

  // Generation counter: any new fetch bumps the counter; stale responses bail out
  const fetchGenRef = useRef(0);

  // Simple in-memory cache (not persisted)
  const cacheRef = useRef<Map<string, { data: LineDiagramData; cachedAt: number }>>(new Map());

  const fetchPositions = useCallback(async (triggerHaptic = false) => {
    if (!lineId) return;

    if (triggerHaptic && navigator.vibrate) {
      navigator.vibrate(10);
    }

    const gen = ++fetchGenRef.current;

    setState((prev) => ({
      ...prev,
      status: prev.data ? "stale" : "loading",
    }));

    try {
      const data = await api.getPositions(lineId);
      if (gen !== fetchGenRef.current) return; // superseded

      const now = Date.now();
      cacheRef.current.set(lineId, { data, cachedAt: now });
      setState({ status: "success", data, error: null, updatedAt: now });
    } catch (err) {
      if (gen !== fetchGenRef.current) return; // superseded

      const stale = cacheRef.current.get(lineId);
      setState({
        status: navigator.onLine ? "error" : "offline",
        data: stale?.data ?? null,
        error: err instanceof Error ? err.message : "Failed to load positions",
        updatedAt: stale?.cachedAt ?? null,
      });
    }
  }, [lineId]);

  useEffect(() => {
    if (!lineId) {
      setState({ status: "idle", data: null, error: null, updatedAt: null });
      return;
    }

    // Serve fresh cache immediately to avoid loading flash
    const cached = cacheRef.current.get(lineId);
    if (cached) {
      setState({
        status: "success",
        data: cached.data,
        error: null,
        updatedAt: cached.cachedAt,
      });
    } else {
      void fetchPositions();
    }

    // Auto-refresh on interval
    const interval = setInterval(() => {
      void fetchPositions();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lineId, fetchPositions]);

  return {
    ...state,
    refresh: () => {
      void fetchPositions(true);
    },
  };
}

/**
 * Get the overall progress of a train along the line (0-1).
 * Used for sorting and positioning trains on the diagram.
 */
export function getTrainOverallProgress(
  train: LineDiagramData["trains"][0],
  stops: LineDiagramData["stops"]
): number {
  const lastStopIndex = stops.findIndex((s) => s.stopId === train.lastStopId);
  const nextStopIndex = stops.findIndex((s) => s.stopId === train.nextStopId);

  if (lastStopIndex === -1 || nextStopIndex === -1) {
    return 0;
  }

  const stopProgress = lastStopIndex / Math.max(stops.length - 1, 1);
  const interStopProgress = ((nextStopIndex - lastStopIndex) / Math.max(stops.length - 1, 1)) * train.progress;

  return stopProgress + interStopProgress;
}
