/**
 * usePrefetch — orchestrates geofence-triggered pre-fetching of arrivals.
 *
 * When the user enters a 200m radius of any station, batch-fetches arrivals
 * for all stations on their commute routes and favorites, storing results
 * in the Cache API via prefetch.ts.
 *
 * Also listens for online/offline transitions:
 * - On offline: stops prefetching (GPS won't work underground anyway)
 * - On online: triggers a fresh pre-fetch cycle for any nearby station
 */

import { useCallback, useEffect, useRef } from "react";
import { prefetchStations } from "../lib/prefetch";
import { useFavoritesStore } from "../stores/favoritesStore";
import { type GeofenceEvent, useGeofence } from "./useGeofence";
import { useOnlineStatus } from "./useOnlineStatus";

export interface UsePrefetchReturn {
  /** Whether geofencing is actively watching */
  isWatching: boolean;
  /** Last geofence entry event */
  lastGeofenceEvent: GeofenceEvent | null;
  /** Manually trigger a prefetch for all commute/favorite stations */
  prefetchAll: () => void;
}

export function usePrefetch(): UsePrefetchReturn {
  const isOnline = useOnlineStatus();
  const lastPrefetchRef = useRef<number>(0);
  const lastGeofenceEventRef = useRef<GeofenceEvent | null>(null);

  /**
   * Collect all unique station IDs from favorites and commutes.
   */
  const getStationIds = useCallback((): string[] => {
    const state = useFavoritesStore.getState();
    const ids = new Set<string>();

    // Favorites
    for (const fav of state.favorites) {
      ids.add(fav.stationId);
    }

    // Commute origins and destinations
    for (const commute of state.commutes) {
      ids.add(commute.origin.stationId);
      ids.add(commute.destination.stationId);
    }

    return [...ids];
  }, []);

  /**
   * Run prefetch for all commute/favorite stations.
   * Throttled to at most once per 60 seconds.
   */
  const doPrefetch = useCallback(() => {
    const now = Date.now();
    if (now - lastPrefetchRef.current < 60_000) return;
    lastPrefetchRef.current = now;

    const stationIds = getStationIds();
    if (stationIds.length > 0) {
      void prefetchStations(stationIds);
    }
  }, [getStationIds]);

  /**
   * Handle geofence entry — trigger prefetch.
   */
  const handleGeofenceEnter = useCallback(
    (event: GeofenceEvent) => {
      lastGeofenceEventRef.current = event;
      doPrefetch();
    },
    [doPrefetch]
  );

  // Geofence watcher
  const { isWatching, lastEvent } = useGeofence({
    radius: 200,
    onEnter: handleGeofenceEnter,
    enabled: isOnline,
  });

  // Also prefetch on connectivity return (e.g., exiting a tunnel)
  useEffect(() => {
    if (isOnline && lastGeofenceEventRef.current) {
      doPrefetch();
    }
  }, [isOnline, doPrefetch]);

  return {
    isWatching,
    lastGeofenceEvent: lastEvent,
    prefetchAll: doPrefetch,
  };
}
