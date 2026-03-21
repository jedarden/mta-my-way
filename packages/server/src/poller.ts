/**
 * Feed poller: fetches all 8 MTA GTFS-RT feeds every 30 seconds.
 *
 * Guarantees:
 * - Promise.allSettled so one feed failure never blocks others
 * - Circuit breaker: after 3 consecutive failures, pause 60s before retry
 * - First poll fires immediately on startup (no 30s cold-start delay)
 * - Structured JSON logging on every poll (timestamp, feed, status, latency)
 * - MTA_API_KEY env var forwarded in x-api-key header if set
 */

import { type FeedConfig, POLLING_INTERVALS, SUBWAY_FEEDS } from "@mta-my-way/shared";
import type { RouteIndex, StationIndex } from "@mta-my-way/shared";
import {
  getAllFeedAges,
  getAllParsedFeeds,
  isCircuitOpen,
  recordFeedFailure,
  recordFeedSuccess,
  updateArrivals,
} from "./cache.js";
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
    })
  );
}

// ---------------------------------------------------------------------------
// Individual feed fetch
// ---------------------------------------------------------------------------

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
  const headers: Record<string, string> = {
    Accept: "application/x-protobuf",
  };

  const apiKey = process.env["MTA_API_KEY"];
  if (apiKey) headers["x-api-key"] = apiKey;

  try {
    const response = await fetch(config.url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const data = new Uint8Array(buffer);
    const parsed = parseFeed(config.id, data);

    recordFeedSuccess(config.id, parsed, parsed.entityCount);

    console.log(
      JSON.stringify({
        event: "feed_ok",
        timestamp: new Date().toISOString(),
        feed: config.id,
        latency_ms: Date.now() - start,
        entities: parsed.entityCount,
      })
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordFeedFailure(config.id, message);

    console.log(
      JSON.stringify({
        event: "feed_error",
        timestamp: new Date().toISOString(),
        feed: config.id,
        latency_ms: Date.now() - start,
        error: message,
      })
    );
    return false;
  }
}
