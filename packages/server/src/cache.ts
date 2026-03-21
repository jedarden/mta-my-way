/**
 * In-memory cache for GTFS-RT feed data and transformed arrivals.
 *
 * Per-feed state tracks:
 * - Circuit breaker: open after 3 consecutive failures, resets after 60s
 * - Stale detection: mark stale after 5 min without a successful poll
 * - Last-good parsed feed: serve stale data rather than nothing
 *
 * The arrivals cache is a Map<stationId, StationArrivals> rebuilt after
 * every successful poll cycle.
 *
 * Alerts cache stores:
 * - Current alerts: Map<alertId, ParsedAlert>
 * - Previous alerts: for diffing (new/changed/resolved)
 * - Alert feed state: last poll, success, match rate
 */

import { SUBWAY_FEEDS } from "@mta-my-way/shared";
import type { StationArrivals } from "@mta-my-way/shared";
import type { ParsedFeed } from "./parser.js";
import type { ParsedAlert } from "./alerts-parser.js";

/** Number of consecutive failures before the circuit opens */
const CIRCUIT_OPEN_AFTER = 3;

/** How long (ms) to keep the circuit open before retrying */
const CIRCUIT_RESET_MS = 60_000;

/** How old (ms) a feed can be before it's considered stale */
const STALE_MS = 300_000; // 5 minutes

export interface FeedState {
  id: string;
  name: string;
  url: string;
  /** Timestamp (ms) of the last successful poll, or null if never polled */
  lastSuccessAt: number | null;
  /** Timestamp (ms) of the last poll attempt (success or failure) */
  lastPollAt: number | null;
  /** Error message from the most recent failure */
  lastErrorMessage: string | null;
  /** Number of consecutive failures since the last success */
  consecutiveFailures: number;
  /** Timestamp (ms) when the circuit was opened, or null if closed */
  circuitOpenAt: number | null;
  /** Number of entities in the last successful parse */
  entityCount: number;
  /** Last successfully parsed feed (used as fallback on failure) */
  parsedFeed: ParsedFeed | null;
}

// ---------------------------------------------------------------------------
// Module-level state (singleton)
// ---------------------------------------------------------------------------

const feedStates = new Map<string, FeedState>(
  SUBWAY_FEEDS.map((feed) => [
    feed.id,
    {
      id: feed.id,
      name: feed.name,
      url: feed.url,
      lastSuccessAt: null,
      lastPollAt: null,
      lastErrorMessage: null,
      consecutiveFailures: 0,
      circuitOpenAt: null,
      entityCount: 0,
      parsedFeed: null,
    },
  ])
);

/** Arrivals indexed by stationId, rebuilt on each poll cycle */
let arrivalsCache = new Map<string, StationArrivals>();

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

/**
 * Returns true if the circuit is open (feed should be skipped).
 * Auto-resets the circuit if the reset window has elapsed.
 */
export function isCircuitOpen(feedId: string): boolean {
  const state = feedStates.get(feedId);
  if (!state || state.circuitOpenAt === null) return false;

  if (Date.now() - state.circuitOpenAt >= CIRCUIT_RESET_MS) {
    state.circuitOpenAt = null;
    state.consecutiveFailures = 0;
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Feed state mutations
// ---------------------------------------------------------------------------

export function recordFeedSuccess(feedId: string, parsed: ParsedFeed, entityCount: number): void {
  const state = feedStates.get(feedId);
  if (!state) return;
  const now = Date.now();
  state.lastSuccessAt = now;
  state.lastPollAt = now;
  state.consecutiveFailures = 0;
  state.circuitOpenAt = null;
  state.entityCount = entityCount;
  state.lastErrorMessage = null;
  state.parsedFeed = parsed;
}

export function recordFeedFailure(feedId: string, error: string): void {
  const state = feedStates.get(feedId);
  if (!state) return;
  state.lastPollAt = Date.now();
  state.consecutiveFailures++;
  state.lastErrorMessage = error;
  if (state.consecutiveFailures >= CIRCUIT_OPEN_AFTER && state.circuitOpenAt === null) {
    state.circuitOpenAt = Date.now();
  }
}

// ---------------------------------------------------------------------------
// Feed state reads
// ---------------------------------------------------------------------------

export function getLastGoodParsed(feedId: string): ParsedFeed | null {
  return feedStates.get(feedId)?.parsedFeed ?? null;
}

/** Returns all feeds that have at least one successful parse */
export function getAllParsedFeeds(): Map<string, ParsedFeed> {
  const result = new Map<string, ParsedFeed>();
  for (const [id, state] of feedStates) {
    if (state.parsedFeed) result.set(id, state.parsedFeed);
  }
  return result;
}

/** Feed age in seconds since last successful poll, or 0 if never polled */
export function getFeedAgeSeconds(feedId: string): number {
  const state = feedStates.get(feedId);
  if (!state?.lastSuccessAt) return 0;
  return Math.floor((Date.now() - state.lastSuccessAt) / 1000);
}

/** Feed ages for all feeds */
export function getAllFeedAges(): Map<string, number> {
  return new Map(SUBWAY_FEEDS.map((f) => [f.id, getFeedAgeSeconds(f.id)]));
}

export function isFeedStale(feedId: string): boolean {
  const state = feedStates.get(feedId);
  if (!state?.lastSuccessAt) return false;
  return Date.now() - state.lastSuccessAt > STALE_MS;
}

/** Snapshot of all feed states for the /api/health endpoint */
export function getFeedStates(): (FeedState & { isStale: boolean })[] {
  const now = Date.now();
  return Array.from(feedStates.values()).map((state) => ({
    ...state,
    isStale: state.lastSuccessAt !== null && now - state.lastSuccessAt > STALE_MS,
  }));
}

// ---------------------------------------------------------------------------
// Arrivals cache
// ---------------------------------------------------------------------------

export function updateArrivals(arrivals: Map<string, StationArrivals>): void {
  arrivalsCache = arrivals;
}

export function getArrivals(stationId: string): StationArrivals | null {
  return arrivalsCache.get(stationId) ?? null;
}

export function getAllArrivals(): Map<string, StationArrivals> {
  return arrivalsCache;
}

// ---------------------------------------------------------------------------
// Alerts cache
// ---------------------------------------------------------------------------

/** State for the alerts feed */
export interface AlertsFeedState {
  /** Timestamp (ms) of the last successful poll */
  lastSuccessAt: number | null;
  /** Timestamp (ms) of the last poll attempt */
  lastPollAt: number | null;
  /** Error message from the most recent failure */
  lastErrorMessage: string | null;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Whether the circuit is open */
  circuitOpenAt: number | null;
  /** Number of alerts in the last successful parse */
  alertCount: number;
  /** Pattern match rate (0-1) from last parse */
  matchRate: number;
}

/** Current alerts indexed by alertId */
let alertsCache = new Map<string, ParsedAlert>();

/** Previous alerts for diffing */
let previousAlertsCache = new Map<string, ParsedAlert>();

/** Alerts feed state */
let alertsFeedState: AlertsFeedState = {
  lastSuccessAt: null,
  lastPollAt: null,
  lastErrorMessage: null,
  consecutiveFailures: 0,
  circuitOpenAt: null,
  alertCount: 0,
  matchRate: 1,
};

// ---------------------------------------------------------------------------
// Alerts state mutations
// ---------------------------------------------------------------------------

export function recordAlertsSuccess(
  alerts: ParsedAlert[],
  matchRate: number
): void {
  const now = Date.now();

  // Store previous alerts for diffing
  previousAlertsCache = new Map(alertsCache);

  // Update current alerts
  alertsCache = new Map(alerts.map((a) => [a.id, a]));

  // Update state
  alertsFeedState = {
    ...alertsFeedState,
    lastSuccessAt: now,
    lastPollAt: now,
    consecutiveFailures: 0,
    circuitOpenAt: null,
    lastErrorMessage: null,
    alertCount: alerts.length,
    matchRate,
  };
}

export function recordAlertsFailure(error: string): void {
  alertsFeedState.lastPollAt = Date.now();
  alertsFeedState.consecutiveFailures++;
  alertsFeedState.lastErrorMessage = error;

  if (
    alertsFeedState.consecutiveFailures >= CIRCUIT_OPEN_AFTER &&
    alertsFeedState.circuitOpenAt === null
  ) {
    alertsFeedState.circuitOpenAt = Date.now();
  }
}

export function isAlertsCircuitOpen(): boolean {
  if (alertsFeedState.circuitOpenAt === null) return false;

  if (Date.now() - alertsFeedState.circuitOpenAt >= CIRCUIT_RESET_MS) {
    alertsFeedState.circuitOpenAt = null;
    alertsFeedState.consecutiveFailures = 0;
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Alerts state reads
// ---------------------------------------------------------------------------

export function getAlerts(): ParsedAlert[] {
  return Array.from(alertsCache.values());
}

export function getAlertById(alertId: string): ParsedAlert | null {
  return alertsCache.get(alertId) ?? null;
}

export function getAlertsForLine(lineId: string): ParsedAlert[] {
  return getAlerts().filter((a) =>
    a.affectedLines.some((l) => l === lineId)
  );
}

export function getAlertsForLines(lineIds: string[]): ParsedAlert[] {
  const lineSet = new Set(lineIds);
  return getAlerts().filter((a) =>
    a.affectedLines.some((l) => lineSet.has(l))
  );
}

export function getAlertsFeedState(): AlertsFeedState & { isStale: boolean } {
  const isStale =
    alertsFeedState.lastSuccessAt !== null &&
    Date.now() - alertsFeedState.lastSuccessAt > STALE_MS;

  return {
    ...alertsFeedState,
    isStale,
  };
}

// ---------------------------------------------------------------------------
// Alert diffing
// ---------------------------------------------------------------------------

export interface AlertDiff {
  /** New alerts that weren't in the previous set */
  newAlerts: ParsedAlert[];
  /** Alerts that changed (headline, severity, etc.) */
  changedAlerts: ParsedAlert[];
  /** Alerts that were resolved (in previous but not current) */
  resolvedAlerts: ParsedAlert[];
}

/**
 * Diff current alerts against previous to detect changes.
 * Useful for push notifications.
 */
export function diffAlerts(): AlertDiff {
  const newAlerts: ParsedAlert[] = [];
  const changedAlerts: ParsedAlert[] = [];
  const resolvedAlerts: ParsedAlert[] = [];

  // Find new and changed alerts
  for (const [id, alert] of alertsCache) {
    const prev = previousAlertsCache.get(id);
    if (!prev) {
      newAlerts.push(alert);
    } else if (
      alert.simplifiedHeadline !== prev.simplifiedHeadline ||
      alert.severity !== prev.severity ||
      alert.activePeriod.start !== prev.activePeriod.start ||
      alert.activePeriod.end !== prev.activePeriod.end
    ) {
      changedAlerts.push(alert);
    }
  }

  // Find resolved alerts
  for (const [id, alert] of previousAlertsCache) {
    if (!alertsCache.has(id)) {
      resolvedAlerts.push(alert);
    }
  }

  return { newAlerts, changedAlerts, resolvedAlerts };
}
