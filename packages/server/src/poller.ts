/**
 * Feed poller: fetches all 8 MTA GTFS-RT feeds every 30 seconds.
 *
 * Guarantees:
 * - Promise.allSettled so one feed failure never blocks others
 * - Automatic retry with exponential backoff for transient failures
 * - Circuit breaker: after 3 consecutive failures, pause 60s before retry
 * - First poll fires immediately on startup (no 30s cold-start delay)
 * - Structured JSON logging on every poll (timestamp, feed, status, latency)
 * - MTA_API_KEY env var forwarded in x-api-key header if set
 */

import { type FeedConfig, POLLING_INTERVALS, SUBWAY_FEEDS, retry, type RetryOptions } from "@mta-my-way/shared";
import type { LinePositions, RouteIndex, StationIndex, TrainPosition } from "@mta-my-way/shared";
import {
  getAllFeedAges,
  getAllParsedFeeds,
  isCircuitOpen,
  recordFeedFailure,
  recordFeedSuccess,
  updateArrivals,
  updatePositions,
} from "./cache.js";
import { extractVehiclePositions, processVehicleUpdates } from "./delay-detector.js";
import { parseFeed } from "./parser.js";
import { buildStopToStationMap, transformFeeds } from "./transformer.js";

const POLL_INTERVAL_MS = POLLING_INTERVALS.arrivals * 1000; // 30 000 ms
const FETCH_TIMEOUT_MS = 15_000; // 15s per feed

let stopToStation: ReturnType<typeof buildStopToStationMap>;
let stations: StationIndex;
let routes: RouteIndex;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Must be called before startPoller() with the loaded station data.
 */
export function initPoller(stationData: StationIndex, routeData: RouteIndex): void {
  stations = stationData;
  routes = routeData;
  stopToStation = buildStopToStationMap(stationData);
}

/**
 * Start the polling loop. The first poll fires immediately.
 */
export function startPoller(): void {
  void runPoll();
  pollTimer = setInterval(() => void runPoll(), POLL_INTERVAL_MS);
}

export function stopPoller(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Poll cycle
// ---------------------------------------------------------------------------

async function runPoll(): Promise<void> {
  const cycleStart = Date.now();

  // Fetch all feeds in parallel; never let one failure abort the others
  const results = await Promise.allSettled(SUBWAY_FEEDS.map((feed) => fetchFeed(feed)));

  let feedsOk = 0;
  let feedsFailed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) feedsOk++;
    else feedsFailed++;
  }

  // Rebuild arrivals from all currently-good feeds
  const parsedFeeds = getAllParsedFeeds();
  const feedAges = getAllFeedAges();

  // Extract VehiclePositions for delay detection (Phase 5) and positions cache (Phase 6)
  const allVehiclePositions: ReturnType<typeof extractVehiclePositions> = [];
  for (const [feedId, parsed] of parsedFeeds) {
    const positions = extractVehiclePositions(feedId, parsed.message);
    allVehiclePositions.push(...positions);
  }
  if (allVehiclePositions.length > 0) {
    processVehicleUpdates(allVehiclePositions);
  }

  // Build and cache positions for train diagram
  const positionsMap = buildPositionsMap(allVehiclePositions, stations);
  updatePositions(positionsMap, cycleStart);

  const arrivals = transformFeeds(parsedFeeds, stations, routes, stopToStation, feedAges);
  updateArrivals(arrivals);

  console.log(
    JSON.stringify({
      event: "poll_complete",
      timestamp: new Date().toISOString(),
      elapsed_ms: Date.now() - cycleStart,
      feeds_ok: feedsOk,
      feeds_failed: feedsFailed,
      station_count: arrivals.size,
      train_count: allVehiclePositions.length,
    })
  );
}

// ---------------------------------------------------------------------------
// Individual feed fetch
// ---------------------------------------------------------------------------

/**
 * Retry configuration for MTA feed fetches
 *
 * - maxAttempts: 3 retries (4 total attempts)
 * - initialDelayMs: 500ms (feeds are polled every 30s, quick retry)
 * - backoffMultiplier: 2 (exponential backoff: 500ms, 1s, 2s)
 * - maxDelayMs: 5000ms (cap max wait time)
 * - isRetryable: retry on network errors and 5xx status codes
 */
const RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 4,
  initialDelayMs: 500,
  backoffMultiplier: 2,
  maxDelayMs: 5000,
  jitter: true,
  isRetryable: (error: unknown) => {
    // Retry on network errors
    if (error instanceof Error && error.name === "TypeError") {
      return true;
    }
    // Retry on timeout errors
    if (error instanceof Error && error.name === "AbortError") {
      return true;
    }
    // Retry on 5xx server errors and 429 rate limiting
    if (error instanceof Error && "status" in error) {
      const status = (error as { status: number }).status;
      return status === 429 || (status >= 500 && status < 600);
    }
    return false;
  },
  onRetry: (attempt, error, delayMs) => {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      JSON.stringify({
        event: "feed_retry",
        timestamp: new Date().toISOString(),
        feed: "unknown", // Will be set by fetchFeed wrapper
        attempt,
        delay_ms: delayMs,
        error: message,
      })
    );
  },
};

async function fetchFeed(config: FeedConfig): Promise<boolean> {
  // Circuit breaker: skip this feed until reset window expires
  if (isCircuitOpen(config.id)) {
    console.log(
      JSON.stringify({
        event: "feed_circuit_open",
        timestamp: new Date().toISOString(),
        feed: config.id,
      })
    );
    return false;
  }

  const start = Date.now();

  try {
    const headers: Record<string, string> = {
      Accept: "application/x-protobuf",
    };

    const apiKey = process.env["MTA_API_KEY"];
    if (apiKey) headers["x-api-key"] = apiKey;

    // Wrap onRetry to include feed ID
    const retryOptions: RetryOptions = {
      ...RETRY_OPTIONS,
      onRetry: (attempt, error, delayMs) => {
        RETRY_OPTIONS.onRetry?.(attempt, error, delayMs);
        // Log with feed ID
        const message = error instanceof Error ? error.message : String(error);
        console.log(
          JSON.stringify({
            event: "feed_retry",
            timestamp: new Date().toISOString(),
            feed: config.id,
            attempt,
            delay_ms: delayMs,
            error: message,
          })
        );
      },
    };

    // Fetch with retry logic
    const response = await retry(
      async () => {
        const res = await fetch(config.url, {
          headers,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (!res.ok) {
          // Create error with status for isRetryable predicate
          const error = new Error(`HTTP ${res.status} ${res.statusText}`) as Error & { status: number };
          error.status = res.status;
          throw error;
        }

        return res;
      },
      retryOptions
    );

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const parsed = parseFeed(config.id, data);

    recordFeedSuccess(config.id, parsed, parsed.entityCount, Date.now() - start);

    console.log(
      JSON.stringify({
        event: "feed_ok",
        timestamp: new Date().toISOString(),
        feed: config.id,
        status: "ok",
        latency_ms: Date.now() - start,
        entities: parsed.entityCount,
        parseErrors: 0, // Protobuf decode either succeeds or throws
      })
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordFeedFailure(config.id, message, Date.now() - start);

    console.log(
      JSON.stringify({
        event: "feed_error",
        timestamp: new Date().toISOString(),
        feed: config.id,
        status: "error",
        latency_ms: Date.now() - start,
        error: message,
      })
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Positions map builder
// ---------------------------------------------------------------------------

/**
 * Build a Map<routeId, LinePositions> from extracted vehicle positions.
 * Groups trains by route, resolves station names for destinations.
 */
function buildPositionsMap(
  positions: Array<{
    tripId: string;
    routeId: string;
    direction: "N" | "S";
    currentStopSequence: number;
    currentStopId: string;
    status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO";
    timestamp: number;
    isAssigned: boolean;
    destination: string;
    delay?: number;
  }>,
  stationIndex: StationIndex
): Map<string, LinePositions> {
  const now = Date.now();
  const map = new Map<string, LinePositions>();

  // Group positions by routeId
  const byRoute = new Map<string, typeof positions>();
  for (const pos of positions) {
    const routeId = pos.routeId.toUpperCase();
    if (!byRoute.has(routeId)) byRoute.set(routeId, []);
    byRoute.get(routeId)!.push(pos);
  }

  // Build LinePositions for each route
  for (const [routeId, routePositions] of byRoute) {
    const trains: TrainPosition[] = routePositions.map((pos) => {
      // Resolve destination station name
      let destName = pos.destination;
      if (destName) {
        // Try to resolve as stop ID
        const station = resolveStationFromStopId(destName, stationIndex);
        if (station) destName = station.name;
      }

      return {
        tripId: pos.tripId,
        routeId: pos.routeId,
        direction: pos.direction,
        currentStopSequence: pos.currentStopSequence,
        status: pos.status,
        currentStopId: pos.currentStopId,
        timestamp: pos.timestamp,
        isAssigned: pos.isAssigned,
        destination: destName || "Unknown",
        delay: pos.delay,
      };
    });

    map.set(routeId, {
      routeId,
      fetchedAt: now,
      feedAge: 0,
      trains,
    });
  }

  return map;
}

/**
 * Resolve a stop ID to its parent station.
 */
function resolveStationFromStopId(
  stopId: string,
  stationIndex: StationIndex
): { name: string; id: string } | null {
  // Check if it's already a parent station ID
  if (stationIndex[stopId]) {
    return { id: stopId, name: stationIndex[stopId].name };
  }

  // Try stripping direction suffix (N/S)
  for (const suffix of ["N", "S"]) {
    if (stopId.endsWith(suffix)) {
      const candidate = stopId.slice(0, -1);
      if (stationIndex[candidate]) {
        return { id: candidate, name: stationIndex[candidate].name };
      }
    }
  }

  // Try looking up by northStopId/southStopId
  for (const station of Object.values(stationIndex)) {
    if (station.northStopId === stopId || station.southStopId === stopId) {
      return { id: station.id, name: station.name };
    }
  }

  return null;
}
