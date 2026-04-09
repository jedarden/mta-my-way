/**
 * Alerts poller: fetches MTA subway alerts feed every 60 seconds.
 *
 * Responsibilities:
 * - Poll the MTA alerts GTFS-RT feed on a 60-second interval
 * - Parse alerts using the alerts-parser module
 * - Track alert changes (new, updated, resolved) for push notifications
 * - Cache parsed alerts for API routes
 * - Circuit breaker for resilience
 */

import { MTA_ALERTS_FEED_URL, POLLING_INTERVALS } from "@mta-my-way/shared";
import type { StationAlert } from "@mta-my-way/shared";
import type { ParsedAlert } from "./alerts-parser.js";
import {
  calculateMatchRate,
  getUnmatchedAlerts,
  parseAlerts,
  toStationAlert,
} from "./alerts-parser.js";
import {
  recordAlertsChange,
  recordFeedError,
  recordFeedPollDuration,
  setAlertsActive,
  setAlertsMatchRate,
} from "./middleware/metrics.js";
import { logger } from "./observability/logger.js";
import { tracedFetch, withChildSpan } from "./observability/tracing.js";

const POLL_INTERVAL_MS = POLLING_INTERVALS.alerts * 1000; // 60,000 ms
const FETCH_TIMEOUT_MS = 15_000;
const CIRCUIT_OPEN_AFTER = 3;
const CIRCUIT_RESET_MS = 60_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlertChange {
  /** Type of change */
  type: "new" | "updated" | "resolved";
  /** The alert (for new/updated) or the alert that was resolved */
  alert: StationAlert;
  /** Timestamp when this change was detected */
  detectedAt: number;
}

export interface AlertsCache {
  /** All current alerts */
  alerts: ParsedAlert[];
  /** Timestamp when alerts were last fetched */
  lastFetchAt: number | null;
  /** Timestamp when alerts were last successfully parsed */
  lastSuccessAt: number | null;
  /** Pattern match rate (0-1) */
  matchRate: number;
  /** Number of consecutive fetch failures */
  consecutiveFailures: number;
  /** Whether the circuit breaker is open */
  circuitOpen: boolean;
  /** When the circuit was opened (null if closed) */
  circuitOpenAt: number | null;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const cache: AlertsCache = {
  alerts: [],
  lastFetchAt: null,
  lastSuccessAt: null,
  matchRate: 0,
  consecutiveFailures: 0,
  circuitOpen: false,
  circuitOpenAt: null,
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
let previousAlertIds = new Set<string>();

/** Listeners for alert changes (for push notifications) */
const changeListeners: Array<(changes: AlertChange[]) => void> = [];

// ---------------------------------------------------------------------------
// Alert fetching
// ---------------------------------------------------------------------------

/**
 * Fetch and parse the alerts feed.
 */
async function fetchAlerts(): Promise<ParsedAlert[] | null> {
  // Check circuit breaker
  if (cache.circuitOpen && cache.circuitOpenAt) {
    if (Date.now() - cache.circuitOpenAt >= CIRCUIT_RESET_MS) {
      // Reset circuit
      cache.circuitOpen = false;
      cache.circuitOpenAt = null;
      cache.consecutiveFailures = 0;
    } else {
      logger.warn("Alerts circuit breaker is open");
      return null;
    }
  }

  const start = Date.now();
  const headers: Record<string, string> = {
    Accept: "application/x-protobuf",
  };

  const apiKey = process.env["MTA_API_KEY"];
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const response = await tracedFetch(MTA_ALERTS_FEED_URL, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      spanName: "MTA Alerts Feed",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const alerts = await withChildSpan("parse-alerts", () => parseAlerts(data), {
      "alert.count": data.length,
    });

    // Success - reset failure count
    cache.consecutiveFailures = 0;
    cache.circuitOpen = false;
    cache.circuitOpenAt = null;
    cache.lastSuccessAt = Date.now();
    cache.matchRate = calculateMatchRate(alerts);

    const latencyMs = Date.now() - start;

    // Record alerts feed poll duration metric
    recordFeedPollDuration(latencyMs / 1000, "alerts");

    const matchedCount = alerts.filter((a) => a.patternMatched).length;

    // Update alert metrics
    setAlertsActive(alerts.length);
    setAlertsMatchRate(cache.matchRate);

    logger.info("Alerts fetched successfully", {
      latency_ms: latencyMs,
      alert_count: alerts.length,
      match_rate: Math.round(cache.matchRate * 100) / 100,
      matched_count: matchedCount,
      unmatched_count: alerts.length - matchedCount,
    });

    return alerts;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latencyMs = Date.now() - start;
    cache.consecutiveFailures++;

    if (cache.consecutiveFailures >= CIRCUIT_OPEN_AFTER && !cache.circuitOpen) {
      cache.circuitOpen = true;
      cache.circuitOpenAt = Date.now();
    }

    // Record alerts feed poll duration and error metrics
    recordFeedPollDuration(latencyMs / 1000, "alerts");

    // Determine error type for metric labeling
    let errorType: string;
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        errorType = "timeout";
      } else if (err.name === "TypeError") {
        errorType = "network";
      } else if ("status" in err) {
        const status = (err as { status: number }).status;
        errorType = status === 429 ? "rate_limited" : status >= 500 ? "server_error" : "http_error";
      } else {
        errorType = "unknown";
      }
    } else {
      errorType = "unknown";
    }
    recordFeedError("alerts", errorType);

    logger.error("Alerts fetch failed", err instanceof Error ? err : undefined, {
      latency_ms: latencyMs,
      error: message,
      consecutive_failures: cache.consecutiveFailures,
      circuit_open: cache.circuitOpen,
    });

    return null;
  }
}

// ---------------------------------------------------------------------------
// Alert diffing
// ---------------------------------------------------------------------------

/**
 * Compare new alerts with previous state to detect changes.
 */
function detectChanges(newAlerts: ParsedAlert[]): AlertChange[] {
  const changes: AlertChange[] = [];
  const now = Date.now();
  const newAlertIds = new Set(newAlerts.map((a) => a.id));

  // Detect new and updated alerts
  for (const alert of newAlerts) {
    if (!previousAlertIds.has(alert.id)) {
      // New alert
      changes.push({
        type: "new",
        alert: toStationAlert(alert),
        detectedAt: now,
      });
    } else {
      // Check if updated (by comparing modifiedAt)
      const prevAlert = cache.alerts.find((a) => a.id === alert.id);
      if (prevAlert && alert.modifiedAt > prevAlert.modifiedAt) {
        changes.push({
          type: "updated",
          alert: toStationAlert(alert),
          detectedAt: now,
        });
      }
    }
  }

  // Detect resolved alerts
  for (const prevAlert of cache.alerts) {
    if (!newAlertIds.has(prevAlert.id)) {
      changes.push({
        type: "resolved",
        alert: toStationAlert(prevAlert),
        detectedAt: now,
      });
    }
  }

  return changes;
}

/**
 * Notify all change listeners.
 */
function notifyListeners(changes: AlertChange[]): void {
  if (changes.length === 0) return;

  for (const listener of changeListeners) {
    try {
      listener(changes);
    } catch (err) {
      logger.error("Alert change listener error", err instanceof Error ? err : undefined, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Poll cycle
// ---------------------------------------------------------------------------

async function runPoll(): Promise<void> {
  cache.lastFetchAt = Date.now();

  const alerts = await fetchAlerts();
  if (alerts === null) {
    // Fetch failed, keep existing cache
    return;
  }

  // Detect changes before updating cache
  const changes = detectChanges(alerts);

  // Update cache
  const previousIds = new Set(cache.alerts.map((a) => a.id));
  previousAlertIds = previousIds;
  cache.alerts = alerts;

  // Log changes
  if (changes.length > 0) {
    const newCount = changes.filter((c) => c.type === "new").length;
    const updatedCount = changes.filter((c) => c.type === "updated").length;
    const resolvedCount = changes.filter((c) => c.type === "resolved").length;

    logger.info("Alerts changed", {
      new: newCount,
      updated: updatedCount,
      resolved: resolvedCount,
    });

    // Record alert change metrics
    if (newCount > 0) recordAlertsChange("new");
    if (updatedCount > 0) recordAlertsChange("updated");
    if (resolvedCount > 0) recordAlertsChange("resolved");

    // Notify listeners
    notifyListeners(changes);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the alerts polling loop.
 * First poll fires immediately.
 */
export function startAlertsPoller(): void {
  void runPoll();
  pollTimer = setInterval(() => void runPoll(), POLL_INTERVAL_MS);

  logger.info("Alerts poller started", {
    interval_ms: POLL_INTERVAL_MS,
  });
}

/**
 * Stop the alerts poller.
 */
export function stopAlertsPoller(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Get all current alerts.
 */
export function getAllAlerts(): StationAlert[] {
  return cache.alerts.map(toStationAlert);
}

/**
 * Get alerts filtered by line ID.
 */
export function getAlertsForLine(lineId: string): StationAlert[] {
  return cache.alerts.filter((a) => a.affectedLines.includes(lineId)).map(toStationAlert);
}

/**
 * Get alerts filtered by multiple line IDs.
 */
export function getAlertsForLines(lineIds: string[]): StationAlert[] {
  return cache.alerts
    .filter((a) => a.affectedLines.some((line: string) => lineIds.includes(line)))
    .map(toStationAlert);
}

/**
 * Get alerts affecting a specific station.
 * Note: This requires station IDs to be extracted from the alert.
 */
export function getAlertsForStation(stationId: string): StationAlert[] {
  return cache.alerts.filter((a) => a.affectedStations.includes(stationId)).map(toStationAlert);
}

/**
 * Get the alerts cache status for the health endpoint.
 */
export function getAlertsStatus(): {
  lastFetchAt: string | null;
  lastSuccessAt: string | null;
  alertCount: number;
  matchRate: number;
  consecutiveFailures: number;
  circuitOpen: boolean;
  unmatchedCount: number;
} {
  return {
    lastFetchAt: cache.lastFetchAt ? new Date(cache.lastFetchAt).toISOString() : null,
    lastSuccessAt: cache.lastSuccessAt ? new Date(cache.lastSuccessAt).toISOString() : null,
    alertCount: cache.alerts.length,
    matchRate: cache.matchRate,
    consecutiveFailures: cache.consecutiveFailures,
    circuitOpen: cache.circuitOpen,
    unmatchedCount: getUnmatchedAlerts().length,
  };
}

/**
 * Get alerts feed age in seconds.
 */
export function getAlertsAgeSeconds(): number {
  if (!cache.lastSuccessAt) return 0;
  return Math.floor((Date.now() - cache.lastSuccessAt) / 1000);
}

/**
 * Register a listener for alert changes.
 * Returns an unsubscribe function.
 */
export function onAlertChange(listener: (changes: AlertChange[]) => void): () => void {
  changeListeners.push(listener);
  return () => {
    const index = changeListeners.indexOf(listener);
    if (index >= 0) {
      changeListeners.splice(index, 1);
    }
  };
}

/**
 * Force a refresh of the alerts feed.
 */
export async function refreshAlerts(): Promise<StationAlert[]> {
  await runPoll();
  return getAllAlerts();
}
