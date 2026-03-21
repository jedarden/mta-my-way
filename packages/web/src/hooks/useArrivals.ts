/**
 * useArrivals - Fetch and auto-refresh arrivals for a station.
 *
 * Returns a DataState discriminated union:
 *   idle     - no stationId provided
 *   loading  - first fetch in progress, no cached data
 *   success  - data is fresh
 *   stale    - data is from cache while a re-fetch is in flight
 *   error    - fetch failed, no usable cached data
 *   offline  - device is offline; may have stale data
 *
 * Auto-refreshes every `refreshInterval` seconds (from settings, default 30).
 * Provides a manual `refresh()` that optionally triggers haptic feedback.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { StationArrivals } from "@mta-my-way/shared";
import { api } from "../lib/api";
import { useArrivalsStore } from "../stores/arrivalsStore";
import { useSettingsStore } from "../stores/settingsStore";

export type DataStatus =
  | "idle"
  | "loading"
  | "success"
  | "stale"
  | "error"
  | "offline";

export interface ArrivalsState {
  status: DataStatus;
  data: StationArrivals | null;
  error: string | null;
  /** POSIX timestamp of the last successful fetch */
  updatedAt: number | null;
}

export type ArrivalsResult = ArrivalsState & {
  /** Trigger an immediate re-fetch (with optional haptic on mobile) */
  refresh: () => void;
};

export function useArrivals(stationId: string | null): ArrivalsResult {
  const [state, setState] = useState<ArrivalsState>({
    status: stationId ? "loading" : "idle",
    data: null,
    error: null,
    updatedAt: null,
  });

  const { getCachedArrivals, getStaleArrivals, setCachedArrivals, setLastFetch } =
    useArrivalsStore();
  const refreshInterval = useSettingsStore((s) => s.refreshInterval);
  const hapticFeedback = useSettingsStore((s) => s.hapticFeedback);

  // Generation counter: any new fetch bumps the counter; stale responses bail out
  const fetchGenRef = useRef(0);

  const fetchArrivals = useCallback(
    async (triggerHaptic = false) => {
      if (!stationId) return;

      if (triggerHaptic && hapticFeedback && navigator.vibrate) {
        navigator.vibrate(10);
      }

      const gen = ++fetchGenRef.current;

      setState((prev) => ({
        ...prev,
        status: prev.data ? "stale" : "loading",
      }));

      try {
        const data = await api.getArrivals(stationId);
        if (gen !== fetchGenRef.current) return; // superseded

        const now = Date.now();
        setCachedArrivals(stationId, data);
        setLastFetch(now);
        setState({ status: "success", data, error: null, updatedAt: now });
      } catch (err) {
        if (gen !== fetchGenRef.current) return; // superseded

        const stale = getStaleArrivals(stationId);
        setState({
          status: navigator.onLine ? "error" : "offline",
          data: stale?.data ?? null,
          error: err instanceof Error ? err.message : "Failed to load arrivals",
          updatedAt: stale?.cachedAt ?? null,
        });
      }
    },
    [
      stationId,
      hapticFeedback,
      getStaleArrivals,
      setCachedArrivals,
      setLastFetch,
    ]
  );

  useEffect(() => {
    if (!stationId) {
      setState({ status: "idle", data: null, error: null, updatedAt: null });
      return;
    }

    // Serve fresh cache immediately to avoid loading flash
    const cached = getCachedArrivals(stationId);
    if (cached) {
      setState({
        status: "success",
        data: cached.data,
        error: null,
        updatedAt: cached.cachedAt,
      });
    } else {
      fetchArrivals();
    }

    // Auto-refresh on interval
    const interval = setInterval(fetchArrivals, refreshInterval * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, refreshInterval]);

  return { ...state, refresh: () => fetchArrivals(true) };
}
