/**
 * useGeofence — watches user position and detects entry into 200m radius
 * of any station from the station index.
 *
 * Battery-conscious:
 * - enableHighAccuracy=false (cell-tower triangulation is enough)
 * - Stops watching after 3 consecutive GPS failures (underground)
 * - Resumes watching when going back online
 *
 * Design:
 * - Uses a single watchPosition ID shared across the hook lifecycle.
 * - Computes distance to all stations on each position update using a
 *   spatial index (stations loaded once from useStationIndex).
 * - Fires `onEnter` callback when user first enters a station's radius.
 * - Tracks which stations the user is currently inside to avoid repeated fires.
 */

import { haversineDistance } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./useOnlineStatus";
import { useStationIndex } from "./useStationIndex";

/** Geofence radius in meters (200m) */
const GEOFENCE_RADIUS_M = 200;

/** Max consecutive GPS errors before stopping watch (underground) */
const MAX_GPS_FAILURES = 3;

/** Position update interval: accept positions up to 30s old */
const MAX_POSITION_AGE_MS = 30_000;

export interface GeofenceEvent {
  /** Station ID the user entered */
  stationId: string;
  /** Station name */
  stationName: string;
  /** Distance to station in meters */
  distanceM: number;
}

export interface UseGeofenceOptions {
  /** Radius in meters (default: 200) */
  radius?: number;
  /** Called when user enters a station's geofence */
  onEnter?: (event: GeofenceEvent) => void;
  /** Whether geofencing is active (default: true when permission granted) */
  enabled?: boolean;
}

export interface UseGeofenceReturn {
  /** Whether geofencing is actively watching position */
  isWatching: boolean;
  /** Last geofence entry event */
  lastEvent: GeofenceEvent | null;
  /** GPS failure count (for debugging) */
  gpsFailureCount: number;
}

export function useGeofence(options: UseGeofenceOptions = {}): UseGeofenceReturn {
  const { radius = GEOFENCE_RADIUS_M, onEnter, enabled = true } = options;
  const { stations } = useStationIndex();
  const isOnline = useOnlineStatus();

  const [isWatching, setIsWatching] = useState(false);
  const [lastEvent, setLastEvent] = useState<GeofenceEvent | null>(null);
  const [gpsFailureCount, setGpsFailureCount] = useState(0);

  const watchIdRef = useRef<number | null>(null);
  const stationsInsideRef = useRef<Set<string>>(new Set());
  const onEnterRef = useRef(onEnter);
  const gpsFailuresRef = useRef(0);
  const stationsRef = useRef(stations);
  const radiusRef = useRef(radius);

  // Keep refs in sync
  onEnterRef.current = onEnter;
  stationsRef.current = stations;
  radiusRef.current = radius;

  // Check if geolocation permission has been granted
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) return;

    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        setPermissionGranted(status.state === "granted");
        status.addEventListener("change", () => {
          setPermissionGranted(status.state === "granted");
        });
      })
      .catch(() => {
        // Permission API not supported — try anyway
      });
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;

    gpsFailuresRef.current = 0;
    setGpsFailureCount(0);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        // Reset failure count on success
        gpsFailuresRef.current = 0;
        setGpsFailureCount(0);
        setIsWatching(true);

        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        // Check against all stations
        const currentStations = stationsRef.current;
        const radiusM = radiusRef.current;

        for (const station of currentStations) {
          const distKm = haversineDistance(lat, lon, station.lat, station.lon);
          const distM = distKm * 1000;
          const stationKey = station.id;

          if (distM <= radiusM) {
            if (!stationsInsideRef.current.has(stationKey)) {
              stationsInsideRef.current.add(stationKey);
              const event: GeofenceEvent = {
                stationId: station.id,
                stationName: station.name,
                distanceM: distM,
              };
              setLastEvent(event);
              onEnterRef.current?.(event);
            }
          } else {
            // User left this station's radius
            stationsInsideRef.current.delete(stationKey);
          }
        }
      },
      (_error) => {
        gpsFailuresRef.current++;
        setGpsFailureCount(gpsFailuresRef.current);

        // Stop watching after consecutive failures (underground)
        if (gpsFailuresRef.current >= MAX_GPS_FAILURES) {
          stopWatchingInternal();
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 15_000,
        maximumAge: MAX_POSITION_AGE_MS,
      }
    );
  }, []);

  const stopWatchingInternal = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
    stationsInsideRef.current.clear();
  }, []);

  // Start/stop watching based on permission, enabled state, and online status
  useEffect(() => {
    const shouldWatch = enabled && permissionGranted && isOnline && stations.length > 0;

    if (shouldWatch) {
      startWatching();
    } else {
      stopWatchingInternal();
    }

    return () => {
      stopWatchingInternal();
    };
  }, [enabled, permissionGranted, isOnline, stations.length, startWatching, stopWatchingInternal]);

  return { isWatching, lastEvent, gpsFailureCount };
}
