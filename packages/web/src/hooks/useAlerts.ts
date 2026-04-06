/**
 * useAlerts - Fetch and filter service alerts.
 *
 * Provides:
 *   - Fetches alerts from /api/alerts
 *   - Filters by user's favorite lines
 *   - Sorts by severity (severe > warning > info) then recency
 *   - Returns DataState for loading/error/offline handling
 *   - Badge count for relevant alerts
 *
 * Per plan.md Phase 4: Enhanced with apiEnhanced for retry logic and better error handling.
 */

import type { StationAlert } from "@mta-my-way/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EnhancedApiError, apiEnhanced } from "../lib/apiEnhanced";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useSettingsStore } from "../stores/settingsStore";

export type AlertDataStatus = "idle" | "loading" | "success" | "stale" | "error" | "offline";

export interface AlertsMeta {
  count: number;
  lastUpdatedAt: string | null;
  matchRate: number;
}

export interface AlertsState {
  status: AlertDataStatus;
  alerts: StationAlert[];
  meta: AlertsMeta | null;
  error: string | null;
  updatedAt: number | null;
}

export interface AlertsResult extends AlertsState {
  /** Trigger an immediate re-fetch */
  refresh: () => void;
  /** Alerts filtered to user's favorite lines */
  myAlerts: StationAlert[];
  /** Count of alerts affecting user's lines (for badge) */
  myAlertsCount: number;
  /** Whether showing "my lines" or "all lines" */
  filterMode: "mine" | "all";
  /** Toggle filter mode */
  setFilterMode: (mode: "mine" | "all") => void;
}

/** Severity order for sorting (higher = more severe) */
const SEVERITY_ORDER: Record<string, number> = {
  severe: 3,
  warning: 2,
  info: 1,
};

/** Sort alerts by severity (descending) then by recency (most recent first) */
function sortAlerts(alerts: StationAlert[]): StationAlert[] {
  return [...alerts].sort((a, b) => {
    // First by severity
    const severityDiff = (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0);
    if (severityDiff !== 0) return severityDiff;

    // Then by recency (start time, most recent first)
    return b.activePeriod.start - a.activePeriod.start;
  });
}

/** Filter alerts to only those affecting the given line IDs */
function filterAlertsByLines(alerts: StationAlert[], lineIds: string[]): StationAlert[] {
  if (lineIds.length === 0) return [];

  const lineSet = new Set(lineIds);
  return alerts.filter((alert) => alert.affectedLines.some((line) => lineSet.has(line)));
}

/** Get all unique line IDs from user's favorites and commutes */
function getUserLines(
  favorites: { lines: string[] }[],
  commutes: { preferredLines: string[] }[]
): string[] {
  const lines = new Set<string>();

  for (const fav of favorites) {
    for (const line of fav.lines) {
      lines.add(line);
    }
  }

  for (const commute of commutes) {
    for (const line of commute.preferredLines) {
      lines.add(line);
    }
  }

  return Array.from(lines);
}

export function useAlerts(): AlertsResult {
  const [state, setState] = useState<AlertsState>({
    status: "idle",
    alerts: [],
    meta: null,
    error: null,
    updatedAt: null,
  });

  const [filterMode, setFilterMode] = useState<"mine" | "all">("mine");

  const favorites = useFavoritesStore((s) => s.favorites);
  const commutes = useFavoritesStore((s) => s.commutes);
  const alertSeverityFilter = useSettingsStore((s) => s.alertSeverityFilter);

  // Generation counter for stale response detection
  const fetchGenRef = useRef(0);

  // Get user's lines from favorites and commutes
  const userLines = useMemo(() => getUserLines(favorites, commutes), [favorites, commutes]);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    const gen = ++fetchGenRef.current;

    setState((prev) => ({
      ...prev,
      status: prev.alerts.length > 0 ? "stale" : "loading",
    }));

    try {
      // Use apiEnhanced with automatic retry and timeout
      const response = await apiEnhanced.getAlerts();

      if (gen !== fetchGenRef.current) return; // superseded

      const alerts = sortAlerts(response.alerts ?? []);
      const now = Date.now();

      setState({
        status: "success",
        alerts,
        meta: response.meta ?? null,
        error: null,
        updatedAt: now,
      });
    } catch (err) {
      if (gen !== fetchGenRef.current) return;

      // Enhanced error handling with user-friendly messages
      let errorMessage = "Failed to load alerts";
      if (err instanceof EnhancedApiError) {
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setState({
        status: navigator.onLine ? "error" : "offline",
        alerts: state.alerts, // keep stale data
        meta: state.meta,
        error: errorMessage,
        updatedAt: state.updatedAt,
      });
    }
  }, [state.alerts, state.meta, state.updatedAt]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    void fetchAlerts();

    // Refresh every 60 seconds (matching MTA alerts feed interval)
    const interval = setInterval(() => {
      void fetchAlerts();
    }, 60_000);

    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Filter alerts based on severity filter setting
  const filteredBySeverity = useMemo(() => {
    if (alertSeverityFilter === "all") return state.alerts;

    return state.alerts.filter((alert) => {
      if (alertSeverityFilter === "delays") {
        return alert.severity === "severe" || alert.severity === "warning";
      }
      if (alertSeverityFilter === "major") {
        return alert.severity === "severe";
      }
      return true;
    });
  }, [state.alerts, alertSeverityFilter]);

  // Alerts filtered to user's lines
  const myAlerts = useMemo(
    () => sortAlerts(filterAlertsByLines(filteredBySeverity, userLines)),
    [filteredBySeverity, userLines]
  );

  // Display alerts based on filter mode
  const displayAlerts = filterMode === "mine" ? myAlerts : filteredBySeverity;

  return {
    ...state,
    alerts: displayAlerts,
    myAlerts,
    myAlertsCount: myAlerts.length,
    refresh: () => {
      void fetchAlerts();
    },
    filterMode,
    setFilterMode,
  };
}

/** Hook to get alerts for a specific station (for AlertBanner) */
export function useAlertsForStation(
  stationId: string | null,
  stationLines: string[]
): {
  alerts: StationAlert[];
  status: AlertDataStatus;
  refresh: () => void;
} {
  const [allAlerts, setAllAlerts] = useState<StationAlert[]>([]);
  const [status, setStatus] = useState<AlertDataStatus>("idle");
  const fetchGenRef = useRef(0);

  const fetchAlerts = useCallback(async () => {
    if (!stationId) return;

    const gen = ++fetchGenRef.current;
    setStatus((prev) => (prev === "idle" ? "loading" : "stale"));

    try {
      // Use apiEnhanced with automatic retry and timeout
      const response = await apiEnhanced.getAlerts();
      if (gen !== fetchGenRef.current) return;

      setAllAlerts(sortAlerts(response.alerts ?? []));
      setStatus("success");
    } catch {
      if (gen !== fetchGenRef.current) return;
      setStatus(navigator.onLine ? "error" : "offline");
    }
  }, [stationId]);

  useEffect(() => {
    void fetchAlerts();
    const interval = setInterval(() => void fetchAlerts(), 60_000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  // Filter to alerts affecting this station's lines
  const alerts = useMemo(() => {
    if (stationLines.length === 0) return [];
    return filterAlertsByLines(allAlerts, stationLines);
  }, [allAlerts, stationLines]);

  return {
    alerts,
    status,
    refresh: () => {
      void fetchAlerts();
    },
  };
}
