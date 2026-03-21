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
 */

import { SUBWAY_FEEDS } from "@mta-my-way/shared";
import type { StationArrivals } from "@mta-my-way/shared";
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

export function recordFeedSuccess(
  feedId: string,
  parsed: ParsedFeed,
  entityCount: number
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
}

export function recordFeedFailure(feedId: string, error: string): void {
  const state = feedStates.get(feedId);
  if (!state) return;
  state.lastPollAt = Date.now();
  state.consecutiveFailures++;
  state.lastErrorMessage = error;
  if (
    state.consecutiveFailures >= CIRCUIT_OPEN_AFTER &&
    state.circuitOpenAt === null
  ) {
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
    isStale:
      state.lastSuccessAt !== null &&
      now - state.lastSuccessAt > STALE_MS,
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
