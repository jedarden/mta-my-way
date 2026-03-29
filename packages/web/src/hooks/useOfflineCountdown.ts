/**
 * useOfflineCountdown — timer-based arrival estimation for underground/offline use.
 *
 * When offline, loads pre-fetched arrival data from the Cache API and counts
 * down the arrival times using a 1-second timer tick.
 *
 * Each arrival's `arrivalTime` (POSIX timestamp) is compared against the
 * current time to produce a live countdown. Arrivals that have passed are
 * removed. The hook re-fetches live data when connectivity returns.
 *
 * Estimated arrivals are marked with `isEstimated: true` so the UI can
 * display an "estimated" badge.
 */

import { useEffect, useRef, useState } from "react";
import type { ArrivalTime, StationArrivals } from "@mta-my-way/shared";
import { getPrefetchedArrivals } from "../lib/prefetch";
import { useOnlineStatus } from "./useOnlineStatus";

/** Tick interval for countdown (1 second) */
const TICK_INTERVAL_MS = 1_000;

/** How often to re-check the pre-fetch cache (10 seconds) */
const CACHE_CHECK_INTERVAL_MS = 10_000;

export interface EstimatedArrival extends ArrivalTime {
  /** This arrival was computed from cached data, not live */
  isEstimated: true;
}

export interface OfflineCountdownState {
  /** Whether the countdown is active (offline + has pre-fetched data) */
  isActive: boolean;
  /** Estimated arrivals with live countdown */
  arrivals: StationArrivals | null;
  /** When the pre-fetched data was originally fetched */
  prefetchedAt: number | null;
  /** Whether the user is currently offline */
  isOffline: boolean;
}

export function useOfflineCountdown(stationId: string | null): OfflineCountdownState {
  const isOnline = useOnlineStatus();
  const isOffline = !isOnline;

  const [arrivals, setArrivals] = useState<StationArrivals | null>(null);
  const [prefetchedAt, setPrefetchedAt] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const cachedDataRef = useRef<{ data: StationArrivals; prefetchedAt: number } | null>(null);
  const stationIdRef = useRef(stationId);
  stationIdRef.current = stationId;

  // Load pre-fetched data when going offline
  useEffect(() => {
    if (!isOffline || !stationId) {
      if (isOnline) {
        // Going back online — clear estimated data
        setArrivals(null);
        setPrefetchedAt(null);
        setIsActive(false);
        cachedDataRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const loadCachedData = async () => {
      const cached = await getPrefetchedArrivals(stationId);
      if (cancelled) return;

      if (cached) {
        cachedDataRef.current = cached;
        setPrefetchedAt(cached.prefetchedAt);
        setIsActive(true);
      } else {
        cachedDataRef.current = null;
        setIsActive(false);
      }
    };

    void loadCachedData();

    // Periodically re-check cache in case new data was prefetched
    const checkInterval = setInterval(() => {
      if (!isOffline || !stationIdRef.current) return;
      void loadCachedData();
    }, CACHE_CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(checkInterval);
    };
  }, [isOffline, stationId]);

  // Tick every second to update countdown values
  useEffect(() => {
    if (!isActive || !cachedDataRef.current) return;

    const tick = () => {
      const cached = cachedDataRef.current;
      if (!cached) return;

      const now = Date.now();

      // Filter out arrivals that have already passed (with 30s grace)
      const filterArrivals = (list: ArrivalTime[]): ArrivalTime[] =>
        list.filter((a) => a.arrivalTime - now > -30_000);

      // Compute estimated minutesAway for each arrival
      const estimateArrivals = (list: ArrivalTime[]): EstimatedArrival[] =>
        filterArrivals(list).map((a) => ({
          ...a,
          minutesAway: Math.max(0, (a.arrivalTime - now) / 60_000),
          isEstimated: true as const,
        }));

      setArrivals({
        ...cached.data,
        northbound: estimateArrivals(cached.data.northbound),
        southbound: estimateArrivals(cached.data.southbound),
      });
    };

    tick();
    const interval = setInterval(tick, TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isActive]);

  return { isActive, arrivals, prefetchedAt, isOffline };
}
