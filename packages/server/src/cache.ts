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
import type { LinePositions, StationArrivals } from "@mta-my-way/shared";
import type { ParsedFeed } from "./parser.js";

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
  /** Trip replacement period (seconds) from NYCT feed header, or null if not present */
  tripReplacementPeriod: number | null;
  /** Rolling window of recent poll latencies (ms), capped at 100 entries */
  latencyHistory: number[];
  /** Timestamps of recent errors for 24h error count, auto-pruned */
  errorTimestamps: number[];
  /** Number of parse errors in the last successful poll */
  parseErrors: number;
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
      tripReplacementPeriod: null,
      latencyHistory: [],
      errorTimestamps: [],
      parseErrors: 0,
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

export function recordFeedSuccess(
  feedId: string,
  parsed: ParsedFeed,
  entityCount: number,
  latencyMs: number,
  parseErrors: number = 0
): void {
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
  state.tripReplacementPeriod = parsed.tripReplacementPeriod;
  state.parseErrors = parseErrors;
  // Track latency (rolling window of last 100)
  state.latencyHistory.push(latencyMs);
  if (state.latencyHistory.length > 100) state.latencyHistory.shift();
}

export function recordFeedFailure(feedId: string, error: string, latencyMs: number): void {
  const state = feedStates.get(feedId);
  if (!state) return;
  const now = Date.now();
  state.lastPollAt = now;
  state.consecutiveFailures++;
  state.lastErrorMessage = error;
  // Track latency even on failure
  state.latencyHistory.push(latencyMs);
  if (state.latencyHistory.length > 100) state.latencyHistory.shift();
  // Track error timestamps for 24h error count
  state.errorTimestamps.push(now);
  if (state.consecutiveFailures >= CIRCUIT_OPEN_AFTER && state.circuitOpenAt === null) {
    state.circuitOpenAt = now;
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

/** 24 hours in ms */
const TWENTY_FOUR_H_MS = 86_400_000;

/** Per-feed metrics for the health endpoint */
export function getFeedMetrics(): {
  avgLatencyMs: number;
  errorCount24h: number;
} {
  const now = Date.now();
  const cutoff = now - TWENTY_FOUR_H_MS;
  // Prune old error timestamps
  for (const state of feedStates.values()) {
    state.errorTimestamps = state.errorTimestamps.filter((t) => t >= cutoff);
  }
  // Empty map to be filled by callers if needed
  return { avgLatencyMs: 0, errorCount24h: 0 };
}

/** Compute average latency from a latency history array */
export function avgLatency(latencyHistory: number[]): number {
  if (latencyHistory.length === 0) return 0;
  return Math.round(latencyHistory.reduce((a, b) => a + b, 0) / latencyHistory.length);
}

/** Count errors within the last 24h */
export function errorCount24h(errorTimestamps: number[]): number {
  const cutoff = Date.now() - TWENTY_FOUR_H_MS;
  return errorTimestamps.filter((t) => t >= cutoff).length;
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
// Positions cache (for train diagram)
// ---------------------------------------------------------------------------

/** Positions indexed by routeId, rebuilt on each poll cycle */
let positionsCache = new Map<string, LinePositions>();

/** When the positions cache was last updated */
let positionsFetchedAt = 0;

export function updatePositions(positions: Map<string, LinePositions>, fetchedAt: number): void {
  positionsCache = positions;
  positionsFetchedAt = fetchedAt;
}

export function getPositions(routeId: string): LinePositions | null {
  const positions = positionsCache.get(routeId.toUpperCase());
  if (!positions) return null;

  // Update feedAge based on current time
  const feedAge = Math.floor((Date.now() - positionsFetchedAt) / 1000);
  return {
    ...positions,
    feedAge,
  };
}

export function getAllPositions(): Map<string, LinePositions> {
  return positionsCache;
}
