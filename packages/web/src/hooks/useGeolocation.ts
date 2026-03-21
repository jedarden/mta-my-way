/**
 * useGeolocation — hook for requesting and tracking user location.
 *
 * Provides:
 * - Permission state tracking
 * - Loading/error states
 * - Coordinates when available
 * - Function to request permission
 */

import { useState, useCallback, useEffect, useRef } from "react";

export type GeolocationPermissionState = "prompt" | "granted" | "denied" | "unavailable";

export interface GeolocationState {
  /** Current permission state */
  permission: GeolocationPermissionState;
  /** Whether we're currently fetching location */
  loading: boolean;
  /** Error message if location fetch failed */
  error: string | null;
  /** User coordinates if available */
  coordinates: { lat: number; lon: number } | null;
}

export interface UseGeolocationReturn extends GeolocationState {
  /** Request location permission and fetch coordinates */
  requestLocation: () => void;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook for accessing user geolocation with permission handling.
 */
export function useGeolocation(): UseGeolocationReturn {
  const [state, setState] = useState<GeolocationState>({
    permission: "prompt",
    loading: false,
    error: null,
    coordinates: null,
  });

  // Track if we've already checked permissions
  const hasCheckedPermission = useRef(false);

  // Check initial permission state on mount
  useEffect(() => {
    if (hasCheckedPermission.current) return;
    hasCheckedPermission.current = true;

    // Check if geolocation is available
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, permission: "unavailable" }));
      return;
    }

    // Check permission state if the API is available
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          setState((s) => ({
            ...s,
            permission: status.state as GeolocationPermissionState,
          }));

          // Listen for permission changes
          status.addEventListener("change", () => {
            setState((s) => ({
              ...s,
              permission: status.state as GeolocationPermissionState,
            }));
          });
        })
        .catch(() => {
          // Permission API not fully supported, use default state
        });
    }
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({
        ...s,
        permission: "unavailable",
        error: "Geolocation is not supported by your browser",
      }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState((s) => ({
          ...s,
          loading: false,
          permission: "granted",
          coordinates: {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          },
          error: null,
        }));
      },
      (error) => {
        let errorMessage: string;
        let permission: GeolocationPermissionState = "denied";

        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied. You can search for stations manually.";
            permission = "denied";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location unavailable. Please search for stations manually.";
            permission = "prompt";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out. Please try again or search manually.";
            permission = "prompt";
            break;
          default:
            errorMessage = "Could not determine your location.";
            permission = "prompt";
        }

        setState((s) => ({
          ...s,
          loading: false,
          permission,
          error: errorMessage,
        }));
      },
      {
        enableHighAccuracy: false, // Don't need high accuracy for finding nearby stations
        timeout: 10_000, // 10 second timeout
        maximumAge: 60_000, // Accept cached position up to 1 minute old
      }
    );
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    ...state,
    requestLocation,
    clearError,
  };
}
