/**
 * Hono application: API routes + static asset serving.
 *
 * Routes:
 *   GET /api/health                — per-feed status, circuit-breaker state
 *   GET /api/arrivals/:stationId   — real-time arrivals for one station
 *   GET /api/stations              — full GTFS static station list
 *   GET /api/stations/:id          — single station with complex expansion
 *   GET /api/stations/search       — type-ahead search by name, line, or cross-street
 *   GET /api/routes                — full route index
 *   GET /api/static/complexes      — station complexes index
 *   POST /api/commute/analyze      — analyze routes between origin and destination
 *   GET /api/alerts                — all current alerts with status
 *   GET /api/alerts/:lineId        — alerts filtered by line
 *   GET /api/push/vapid-public-key — VAPID public key for push subscription
 *   POST /api/push/subscribe       — register a push subscription
 *   DELETE /api/push/unsubscribe   — remove a push subscription
 *   PATCH /api/push/subscription   — update favorites/quiet hours
 *   GET /api/trip/:tripId          — live trip progress (stop-by-stop)
 *   GET /*                         — serve React PWA from packages/web/dist
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createBrotliCompress, createDeflate, createGzip } from "node:zlib";
import { serveStatic } from "@hono/node-server/serve-static";
import { CACHE_TTLS } from "@mta-my-way/shared";
import type {
  ComplexIndex,
  RouteIndex,
  Station,
  StationComplex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import {
  commuteAnalyzeRequestSchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  pushUpdateRequestSchema,
} from "@mta-my-way/shared";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { getAlertsForLine, getAlertsStatus, getAllAlerts } from "./alerts-poller.js";
import { avgLatency, errorCount24h, getArrivals, getFeedStates, getPositions } from "./cache.js";
import { getDelayDetectorStatus, getPredictedAlerts } from "./delay-detector.js";
import {
  getDelayPredictorStatus,
  getRouteDelayPatterns,
  getRouteDelayProbability,
  getRouteDelaySummary,
  predictDelay,
} from "./delay-predictor.js";
import { getAllEquipment, getEquipmentForStation, getEquipmentStatus } from "./equipment-poller.js";
import { rateLimiter, securityHeaders } from "./middleware/index.js";
import { validateBody } from "./middleware/validation.js";
import { buildLineDiagram } from "./positions-interpolator.js";
import {
  getSubscriptionCount,
  removeSubscription,
  updateSubscriptionFavorites,
  updateSubscriptionMorningScores,
  updateSubscriptionQuietHours,
  upsertSubscription,
} from "./push/subscriptions.js";
import { getVapidPublicKey } from "./push/vapid.js";
import { createTransferEngine } from "./transfer/index.js";
import { lookupTrip } from "./trip-lookup.js";

/** Server start time for uptime calculation */
const SERVER_START_MS = Date.now();

/** Number of feeds failing >5 min before returning 503 */
const UNHEALTHY_FEED_THRESHOLD = 3;

/** Track API cache hit/miss for cache hit rate metric */
let apiCacheHits = 0;
let apiCacheMisses = 0;

/** Record a cache hit (caller already returned cached data) */
export function recordCacheHit(): void {
  apiCacheHits++;
}
/** Record a cache miss (caller fetched fresh data) */
export function recordCacheMiss(): void {
  apiCacheMisses++;
}

/** Cache header for static GTFS data */
const STATIC_CACHE_HEADER = `public, max-age=${CACHE_TTLS.gtfsStatic}, stale-while-revalidate=${CACHE_TTLS.gtfsStaticStale}`;

/**
 * Common abbreviation mappings for station search
 */
const ABBREVIATIONS: Record<string, string> = {
  sq: "square",
  st: "street",
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  pkwy: "parkway",
  rd: "road",
  dr: "drive",
  ln: "lane",
  ct: "court",
  pl: "place",
  hwy: "highway",
  expwy: "expressway",
  bway: "broadway",
  "'way": "way",
};

function expandAbbreviations(term: string): string {
  const lower = term.toLowerCase();
  if (ABBREVIATIONS[lower]) {
    return ABBREVIATIONS[lower];
  }
  let expanded = term;
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, "gi");
    expanded = expanded.replace(regex, full);
  }
  return expanded;
}

function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stationMatchesQuery(
  station: Station,
  normalizedQuery: string,
  originalQuery: string
): boolean {
  const normalizedName = normalizeForSearch(station.name);
  const expandedQuery = normalizeForSearch(expandAbbreviations(originalQuery));
  const expandedNormalizedQuery = normalizeForSearch(expandAbbreviations(normalizedQuery));

  if (
    normalizedName.includes(normalizedQuery) ||
    normalizedName.includes(expandedQuery) ||
    normalizedName.includes(expandedNormalizedQuery)
  ) {
    return true;
  }

  const upperQuery = originalQuery.toUpperCase();
  if (station.lines.some((line) => line === upperQuery)) {
    return true;
  }

  const expandedName = normalizeForSearch(expandAbbreviations(station.name));
  if (expandedName.includes(expandedQuery) || expandedName.includes(expandedNormalizedQuery)) {
    return true;
  }

  return false;
}

function scoreSearchResult(station: Station, query: string): number {
  const normalizedQuery = normalizeForSearch(query);
  const normalizedName = normalizeForSearch(station.name);
  const upperQuery = query.toUpperCase();

  if (station.lines.some((line) => line === upperQuery)) {
    return 1000;
  }

  if (normalizedName.startsWith(normalizedQuery)) {
    return 100;
  }

  const words = normalizedName.split(/\s+/);
  if (words.some((word) => word.startsWith(normalizedQuery))) {
    return 50;
  }

  if (normalizedName.includes(normalizedQuery)) {
    return 10;
  }

  return 1;
}

function buildStationToComplexMap(complexes: ComplexIndex): Map<string, StationComplex> {
  const map = new Map<string, StationComplex>();
  for (const complex of Object.values(complexes)) {
    for (const stationId of complex.stations) {
      map.set(stationId, complex);
    }
  }
  return map;
}

/**
 * @param stations         Pre-loaded GTFS static station index
 * @param routes           Pre-loaded GTFS static route index
 * @param complexes        Pre-loaded station complexes index
 * @param transfers        Pre-loaded transfer connections
 * @param webDistPath      Absolute path to the built React PWA (packages/web/dist)
 */
/** Cache header for immutable assets (hashed filenames) */
const IMMUTABLE_CACHE_HEADER = "public, max-age=31536000, immutable";

/**
 * Compression middleware for API responses.
 * Supports brotli, gzip, and deflate based on Accept-Encoding header.
 * Brotli is preferred for best compression ratio.
 */
function compressionMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    const body = c.res.body;
    if (!body || c.res.headers.get("Content-Encoding")) return;

    const contentType = c.res.headers.get("Content-Type");
    if (!contentType?.includes("json") && !contentType?.includes("text")) return;

    const acceptEncoding = c.req.header("Accept-Encoding") || "";
    const contentLength = c.res.headers.get("Content-Length");

    // Skip small responses (not worth compressing)
    if (contentLength && parseInt(contentLength, 10) < 500) return;

    // Clone response to get the body as buffer
    const buffer = Buffer.from(await c.res.clone().arrayBuffer());

    // Prefer brotli for best compression, then gzip, then deflate
    if (acceptEncoding.includes("br")) {
      const brotlied = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const brotli = createBrotliCompress();
        brotli.on("data", (chunk) => chunks.push(chunk));
        brotli.on("end", () => resolve(Buffer.concat(chunks)));
        brotli.on("error", reject);
        brotli.end(buffer);
      });

      c.res = new Response(brotlied, {
        status: c.res.status,
        headers: c.res.headers,
      });
      c.res.headers.set("Content-Encoding", "br");
      c.res.headers.delete("Content-Length");
    } else if (acceptEncoding.includes("gzip")) {
      const gzipped = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const gzip = createGzip();
        gzip.on("data", (chunk) => chunks.push(chunk));
        gzip.on("end", () => resolve(Buffer.concat(chunks)));
        gzip.on("error", reject);
        gzip.end(buffer);
      });

      c.res = new Response(gzipped, {
        status: c.res.status,
        headers: c.res.headers,
      });
      c.res.headers.set("Content-Encoding", "gzip");
      c.res.headers.delete("Content-Length");
    } else if (acceptEncoding.includes("deflate")) {
      const deflated = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const deflate = createDeflate();
        deflate.on("data", (chunk) => chunks.push(chunk));
        deflate.on("end", () => resolve(Buffer.concat(chunks)));
        deflate.on("error", reject);
        deflate.end(buffer);
      });

      c.res = new Response(deflated, {
        status: c.res.status,
        headers: c.res.headers,
      });
      c.res.headers.set("Content-Encoding", "deflate");
      c.res.headers.delete("Content-Length");
    }
  };
}

/**
 * Check if a path has a content hash (for immutable caching).
 * Vite produces files like: assets/index-a1b2c3d4.js
 */
function isHashedAsset(path: string): boolean {
  // Match pattern: /assets/name-[hash].ext where hash is 8+ hex chars
  return /\/assets\/[^/]+-[a-f0-9]{8,}\.(js|css|svg|png|jpg|ico|woff2?)$/i.test(path);
}

export function createApp(
  stations: StationIndex,
  routes: RouteIndex,
  complexes: ComplexIndex,
  transfers: Record<string, TransferConnection[]>,
  webDistPath: string
): Hono {
  const app = new Hono();

  // Security headers on all responses (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
  app.use("*", securityHeaders());

  // Rate limiting on all API routes (60 req/min per IP, token bucket)
  app.use("/api/*", rateLimiter());

  // Compression for API responses
  app.use("/api/*", compressionMiddleware());

  const stationToComplex = buildStationToComplexMap(complexes);

  // Create transfer engine for commute analysis
  const transferEngine = createTransferEngine({
    stations,
    routes,
    transfers,
    complexes,
    getArrivals: (stationId: string) => {
      const stationArrivals = getArrivals(stationId);
      if (!stationArrivals) return null;
      return [...stationArrivals.northbound, ...stationArrivals.southbound];
    },
  });

  // -------------------------------------------------------------------------
  // Health endpoint
  // -------------------------------------------------------------------------
  app.get("/api/health", (c) => {
    const feedStates = getFeedStates();
    const alertsStatus = getAlertsStatus();
    const allFeedsOk = feedStates.every(
      (f) => f.circuitOpenAt === null && f.lastSuccessAt !== null && !f.isStale
    );
    const alertsOk = !alertsStatus.circuitOpen && alertsStatus.lastSuccessAt !== null;

    // Count feeds that have been failing for >5 minutes
    const now = Date.now();
    const failingFeeds = feedStates.filter(
      (f) =>
        f.consecutiveFailures > 0 && f.lastSuccessAt !== null && now - f.lastSuccessAt > 300_000
    );
    const unhealthy = failingFeeds.length >= UNHEALTHY_FEED_THRESHOLD;

    const status = allFeedsOk && alertsOk ? "ok" : "degraded";
    const httpStatus = unhealthy ? 503 : 200;

    const totalRequests = apiCacheHits + apiCacheMisses;
    const cacheHitRate =
      totalRequests > 0 ? Math.round((apiCacheHits / totalRequests) * 100) / 100 : 0;

    const memUsage = process.memoryUsage();

    return c.json(
      {
        status,
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor((Date.now() - SERVER_START_MS) / 1000),
        feeds: feedStates.map((f) => ({
          id: f.id,
          name: f.name,
          status:
            f.circuitOpenAt !== null
              ? "circuit_open"
              : f.lastSuccessAt === null
                ? "never_polled"
                : f.isStale
                  ? "stale"
                  : "ok",
          lastSuccessAt: f.lastSuccessAt ? new Date(f.lastSuccessAt).toISOString() : null,
          lastPollAt: f.lastPollAt ? new Date(f.lastPollAt).toISOString() : null,
          consecutiveFailures: f.consecutiveFailures,
          entityCount: f.entityCount,
          lastError: f.lastErrorMessage,
          tripReplacementPeriod: f.tripReplacementPeriod,
          avgLatencyMs: avgLatency(f.latencyHistory),
          errorCount24h: errorCount24h(f.errorTimestamps),
          parseErrors: f.parseErrors,
        })),
        alerts: {
          count: alertsStatus.alertCount,
          lastSuccessAt: alertsStatus.lastSuccessAt,
          matchRate: alertsStatus.matchRate,
          consecutiveFailures: alertsStatus.consecutiveFailures,
          circuitOpen: alertsStatus.circuitOpen,
          unmatchedCount: alertsStatus.unmatchedCount,
        },
        delayDetector: getDelayDetectorStatus(),
        delayPredictor: getDelayPredictorStatus(),
        equipment: getEquipmentStatus(),
        pushSubscriptions: getSubscriptionCount(),
        cacheHitRate,
        memory: {
          rssBytes: memUsage.rss,
          heapUsedBytes: memUsage.heapUsed,
          heapTotalBytes: memUsage.heapTotal,
          externalBytes: memUsage.external,
        },
        failingFeedsCount: failingFeeds.length,
      },
      httpStatus as 200 | 503
    );
  });

  // -------------------------------------------------------------------------
  // Real-time arrivals
  // -------------------------------------------------------------------------
  app.get("/api/arrivals/:stationId", (c) => {
    const stationId = c.req.param("stationId");
    const arrivals = getArrivals(stationId);

    if (!arrivals) {
      apiCacheMisses++; // Track cache miss (station not in cache)
      return c.json({ error: "Station not found or no data yet" }, 404);
    }

    apiCacheHits++; // Track cache hit

    // Inject equipment status into arrivals response
    const equipmentSummary = getEquipmentForStation(stationId);
    const response = {
      ...arrivals,
      equipment: equipmentSummary?.equipment ?? [],
    };

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json(response);
  });

  // -------------------------------------------------------------------------
  // GTFS static station data
  // -------------------------------------------------------------------------
  app.get("/api/stations", (c) => {
    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(Object.values(stations));
  });

  app.get("/api/stations/search", (c) => {
    const query = c.req.query("q");

    if (!query || query.trim().length === 0) {
      return c.json({ error: "Query parameter 'q' is required" }, 400);
    }

    const trimmedQuery = query.trim();
    const normalizedQuery = normalizeForSearch(trimmedQuery);

    const results = Object.values(stations)
      .filter((station) => stationMatchesQuery(station, normalizedQuery, trimmedQuery))
      .map((station) => ({
        station,
        score: scoreSearchResult(station, trimmedQuery),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ station }) => station);

    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(results);
  });

  app.get("/api/stations/:id", (c) => {
    const id = c.req.param("id");
    const station = stations[id];

    if (!station) {
      return c.json({ error: "Station not found" }, 404);
    }

    const complex = stationToComplex.get(id);

    const response: Record<string, unknown> = {
      ...station,
      complexStations: [] as Station[],
      complexLines: station.lines,
    };

    if (complex) {
      const complexStations = complex.stations
        .map((sid) => stations[sid])
        .filter((s): s is Station => s !== undefined);

      const allLines = new Set<string>();
      for (const s of complexStations) {
        for (const line of s.lines) {
          allLines.add(line);
        }
      }

      response.complexId = complex.complexId;
      response.complexName = complex.name;
      response.complexStations = complexStations;
      response.complexLines = Array.from(allLines).sort();
    }

    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(response);
  });

  // -------------------------------------------------------------------------
  // GTFS static route data
  // -------------------------------------------------------------------------
  app.get("/api/routes", (c) => {
    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(Object.values(routes));
  });

  app.get("/api/routes/:id", (c) => {
    const id = c.req.param("id");
    const route = routes[id];

    if (!route) {
      return c.json({ error: "Route not found" }, 404);
    }

    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(route);
  });

  // -------------------------------------------------------------------------
  // Static GTFS data (complexes)
  // -------------------------------------------------------------------------
  app.get("/api/static/complexes", (c) => {
    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(Object.values(complexes));
  });

  app.get("/api/static/complexes/:id", (c) => {
    const id = c.req.param("id");
    const complex = complexes[id];

    if (!complex) {
      return c.json({ error: "Complex not found" }, 404);
    }

    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(complex);
  });

  // -------------------------------------------------------------------------
  // Commute analysis
  // -------------------------------------------------------------------------
  app.post("/api/commute/analyze", async (c) => {
    try {
      const body = await validateBody(c, commuteAnalyzeRequestSchema);
      if (body instanceof Response) return body;

      const {
        originId,
        destinationId,
        preferredLines = [],
        commuteId = "default",
        accessibleMode = false,
      } = body;

      if (!stations[originId]) {
        return c.json({ error: `Origin station not found: ${originId}` }, 404);
      }
      if (!stations[destinationId]) {
        return c.json({ error: `Destination station not found: ${destinationId}` }, 404);
      }

      const analysis = transferEngine.analyzeCommute(
        originId,
        destinationId,
        preferredLines,
        commuteId,
        accessibleMode
      );

      c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
      return c.json(analysis);
    } catch (error) {
      console.error("Commute analysis error:", error);
      return c.json(
        {
          error: "Failed to analyze commute",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  });

  // -------------------------------------------------------------------------
  // Alerts
  // -------------------------------------------------------------------------
  app.get("/api/alerts", (c) => {
    const officialAlerts = getAllAlerts();
    const predictedAlerts = getPredictedAlerts();
    const status = getAlertsStatus();
    const delayDetector = getDelayDetectorStatus();

    // Merge official + predicted alerts; predicted are tagged with source field
    const alerts = [...officialAlerts, ...predictedAlerts];

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json({
      alerts,
      meta: {
        count: alerts.length,
        officialCount: officialAlerts.length,
        predictedCount: predictedAlerts.length,
        lastUpdatedAt: status.lastSuccessAt,
        matchRate: status.matchRate,
        consecutiveFailures: status.consecutiveFailures,
        circuitOpen: status.circuitOpen,
        delayDetector,
      },
    });
  });

  app.get("/api/alerts/:lineId", (c) => {
    const lineId = c.req.param("lineId").toUpperCase();
    const officialAlerts = getAlertsForLine(lineId);
    const predictedAlerts = getPredictedAlerts().filter((a) => a.affectedLines.includes(lineId));
    const alerts = [...officialAlerts, ...predictedAlerts];

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json({ alerts, lineId });
  });

  // -------------------------------------------------------------------------
  // Equipment (elevator/escalator outages)
  // -------------------------------------------------------------------------
  app.get("/api/equipment", (c) => {
    const summaries = getAllEquipment();
    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json({ stations: summaries, count: summaries.length });
  });

  app.get("/api/equipment/:stationId", (c) => {
    const stationId = c.req.param("stationId");
    const summary = getEquipmentForStation(stationId);

    if (!summary) {
      return c.json({ stationId, equipment: [], adaAccessible: true }, 200);
    }

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json(summary);
  });

  // -------------------------------------------------------------------------
  // Delay prediction API
  // -------------------------------------------------------------------------
  app.get("/api/predictions/delay", (c) => {
    const routeId = c.req.query("routeId");
    const direction = c.req.query("direction")?.toUpperCase();

    if (!routeId) {
      return c.json({ error: "routeId query parameter is required" }, 400);
    }
    if (direction !== "N" && direction !== "S") {
      return c.json({ error: "direction must be 'N' or 'S'" }, 400);
    }

    const probability = getRouteDelayProbability(routeId, direction as "N" | "S");

    if (probability === null) {
      return c.json({
        routeId,
        direction,
        probability: null,
        message: "Not enough data to predict delays for this route",
      });
    }

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json({
      routeId,
      direction,
      probability: Math.round(probability * 100) / 100,
      percentage: Math.round(probability * 100),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/predictions/delay/:routeId", (c) => {
    const routeId = c.req.param("routeId").toUpperCase();
    const direction = c.req.query("direction")?.toUpperCase();

    if (direction !== "N" && direction !== "S") {
      // Return patterns for both directions if none specified
      const northboundPatterns = getRouteDelayPatterns(routeId, "N");
      const southboundPatterns = getRouteDelayPatterns(routeId, "S");

      c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
      return c.json({
        routeId,
        northbound: northboundPatterns,
        southbound: southboundPatterns,
        timestamp: new Date().toISOString(),
      });
    }

    const patterns = getRouteDelayPatterns(routeId, direction as "N" | "S");

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json({
      routeId,
      direction,
      patterns,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/predictions/delay/:routeId/summary", (c) => {
    const routeId = c.req.param("routeId").toUpperCase();
    const summary = getRouteDelaySummary(routeId);

    if (!summary) {
      return c.json(
        {
          error: "No data available for this route",
          routeId,
        },
        404
      );
    }

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json(summary);
  });

  app.post("/api/predictions/predict", async (c) => {
    try {
      const body = await c.req.json();
      const { routeId, direction, fromStationId, toStationId, scheduledMinutes } = body;

      if (!routeId || !direction || !fromStationId || !toStationId || !scheduledMinutes) {
        return c.json(
          {
            error:
              "Missing required fields: routeId, direction, fromStationId, toStationId, scheduledMinutes",
          },
          400
        );
      }

      if (direction !== "N" && direction !== "S") {
        return c.json({ error: "direction must be 'N' or 'S'" }, 400);
      }

      const scheduledSeconds = scheduledMinutes * 60;
      const prediction = predictDelay(
        routeId.toUpperCase(),
        direction,
        fromStationId,
        toStationId,
        scheduledSeconds
      );

      if (!prediction) {
        return c.json(
          {
            error: "Not enough data to make a prediction for this route/segment",
            routeId,
            direction,
            fromStationId,
            toStationId,
          },
          404
        );
      }

      c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
      return c.json(prediction);
    } catch (error) {
      console.error("Delay prediction error:", error);
      return c.json(
        {
          error: "Failed to generate prediction",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  });

  // -------------------------------------------------------------------------
  // Live trip tracking
  // -------------------------------------------------------------------------
  app.get("/api/trip/:tripId", (c) => {
    const tripId = c.req.param("tripId");

    if (!tripId) {
      return c.json({ error: "tripId is required" }, 400);
    }

    const trip = lookupTrip(tripId, stations);

    if (!trip) {
      return c.json({ error: "Trip not found or no longer active" }, 404);
    }

    // Short cache: trip data updates every 30s with the feed
    c.header("Cache-Control", "public, max-age=15");
    return c.json(trip);
  });

  // -------------------------------------------------------------------------
  // Trip ETA prediction with delay modeling
  // -------------------------------------------------------------------------
  app.get("/api/trip/:tripId/predict", (c) => {
    const tripId = c.req.param("tripId");

    if (!tripId) {
      return c.json({ error: "tripId is required" }, 400);
    }

    const trip = lookupTrip(tripId, stations);

    if (!trip) {
      return c.json({ error: "Trip not found or no longer active" }, 404);
    }

    // Calculate remaining trip segments for delay prediction
    const segments: Array<{
      fromStationId: string;
      toStationId: string;
      fromStationName: string;
      toStationName: string;
      scheduledSeconds: number;
    }> = [];

    for (let i = trip.currentStopIndex; i < trip.stops.length - 1; i++) {
      const currentStop = trip.stops[i]!;
      const nextStop = trip.stops[i + 1]!;

      const departureTime = currentStop.departureTime ?? currentStop.arrivalTime;
      const arrivalTime = nextStop.arrivalTime ?? nextStop.departureTime;

      if (departureTime && arrivalTime && arrivalTime > departureTime) {
        segments.push({
          fromStationId: currentStop.stationId ?? currentStop.stopId,
          toStationId: nextStop.stationId ?? nextStop.stopId,
          fromStationName: currentStop.stationName,
          toStationName: nextStop.stationName,
          scheduledSeconds: arrivalTime - departureTime,
        });
      }
    }

    // Get delay predictions for each segment
    const segmentPredictions = segments.map((segment) => {
      const prediction = predictDelay(
        trip.routeId,
        trip.direction ?? "N",
        segment.fromStationId,
        segment.toStationId,
        segment.scheduledSeconds
      );

      return {
        ...segment,
        prediction: prediction ?? null,
      };
    });

    // Calculate overall ETA adjustment
    let totalScheduledSeconds = 0;
    let totalPredictedSeconds = 0;
    let hasPredictions = false;

    for (const segment of segmentPredictions) {
      totalScheduledSeconds += segment.scheduledSeconds;
      if (segment.prediction) {
        totalPredictedSeconds += segment.prediction.predictedMinutes * 60;
        hasPredictions = true;
      } else {
        totalPredictedSeconds += segment.scheduledSeconds;
      }
    }

    // Calculate base ETA from trip data
    const lastStop = trip.stops[trip.stops.length - 1];
    const baseEtaSeconds = lastStop?.arrivalTime ?? null;
    const baseEta = baseEtaSeconds ? new Date(baseEtaSeconds * 1000).toISOString() : null;

    // Calculate adjusted ETA if we have predictions
    let adjustedEtaSeconds: number | null = null;
    let adjustedEta: string | null = null;
    let delayRisk: "low" | "medium" | "high" | null = null;
    let delayMinutesRange: string | null = null;

    if (hasPredictions && baseEtaSeconds) {
      const etaAdjustmentSeconds = totalPredictedSeconds - totalScheduledSeconds;
      adjustedEtaSeconds = baseEtaSeconds + etaAdjustmentSeconds;
      adjustedEta = new Date(adjustedEtaSeconds * 1000).toISOString();

      // Calculate delay risk
      const delayRatio = totalPredictedSeconds / totalScheduledSeconds;
      if (delayRatio < 1.1) {
        delayRisk = "low";
      } else if (delayRatio < 1.3) {
        delayRisk = "medium";
      } else {
        delayRisk = "high";
      }

      // Calculate delay range in minutes
      const delayMinutes = Math.round(etaAdjustmentSeconds / 60);
      if (delayMinutes > 0) {
        delayMinutesRange = `+${delayMinutes} min`;
      } else if (delayMinutes < 0) {
        delayMinutesRange = `${delayMinutes} min`;
      } else {
        delayMinutesRange = "On time";
      }
    }

    // Get route-level delay probability
    const routeDelayProbability = getRouteDelayProbability(trip.routeId, trip.direction ?? "N");

    c.header("Cache-Control", "public, max-age=30");
    return c.json({
      tripId: trip.tripId,
      routeId: trip.routeId,
      direction: trip.direction,
      destination: trip.destination,
      progressPercent: trip.progressPercent,
      remainingStops: trip.remainingStops,
      totalStops: trip.totalStops,
      baseEta,
      adjustedEta,
      delayRisk,
      delayMinutesRange,
      routeDelayProbability,
      segments: segmentPredictions,
      hasPredictions,
      generatedAt: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------------------
  // Train positions (for line diagram)
  // -------------------------------------------------------------------------
  app.get("/api/positions/:lineId", (c) => {
    const lineId = c.req.param("lineId").toUpperCase();
    const positions = getPositions(lineId);

    if (!positions) {
      return c.json({ error: "No position data for line", lineId, trains: [] }, 404);
    }

    // Build interpolated diagram data
    const diagramData = buildLineDiagram(positions, lineId, routes, stations);

    if (!diagramData) {
      return c.json({ error: "Route not found", lineId, trains: [] }, 404);
    }

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json(diagramData);
  });

  // -------------------------------------------------------------------------
  // Push notification API
  // -------------------------------------------------------------------------

  /** Return the VAPID public key so the browser can create a push subscription */
  app.get("/api/push/vapid-public-key", (c) => {
    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return c.json({ error: "Push notifications not configured" }, 503);
    }
    // Short cache: browsers need a fresh key if we ever rotate
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({ publicKey });
  });

  /** Register a push subscription */
  app.post("/api/push/subscribe", async (c) => {
    try {
      const body = await validateBody(c, pushSubscribeRequestSchema);
      if (body instanceof Response) return body;

      upsertSubscription(body);

      console.log(
        JSON.stringify({
          event: "push_subscribe",
          timestamp: new Date().toISOString(),
          lines: body.favorites?.map((f) => f.lines).flat() ?? [],
          total_subscriptions: getSubscriptionCount(),
        })
      );

      return c.json({ success: true });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "push_subscribe_error",
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return c.json({ error: "Failed to register subscription" }, 500);
    }
  });

  /** Remove a push subscription */
  app.delete("/api/push/unsubscribe", async (c) => {
    try {
      const body = await validateBody(c, pushUnsubscribeRequestSchema);
      if (body instanceof Response) return body;

      const removed = removeSubscription(body.endpoint);

      console.log(
        JSON.stringify({
          event: "push_unsubscribe",
          timestamp: new Date().toISOString(),
          removed,
          total_subscriptions: getSubscriptionCount(),
        })
      );

      return c.json({ success: true });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "push_unsubscribe_error",
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return c.json({ error: "Failed to remove subscription" }, 500);
    }
  });

  /** Update favorites or quiet hours for an existing push subscription */
  app.patch("/api/push/subscription", async (c) => {
    try {
      const body = await validateBody(c, pushUpdateRequestSchema);
      if (body instanceof Response) return body;

      if (body.favorites) {
        updateSubscriptionFavorites(body.endpoint, body.favorites);
      }

      if (body.quietHours) {
        updateSubscriptionQuietHours(body.endpoint, body.quietHours);
      }

      if (body.morningScores) {
        updateSubscriptionMorningScores(body.endpoint, body.morningScores);
      }

      return c.json({ success: true });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "push_update_error",
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return c.json({ error: "Failed to update subscription" }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // Static PWA assets (must come last; catches /* after /api/* routes)
  // -------------------------------------------------------------------------
  app.use(
    "/*",
    serveStatic({
      root: webDistPath,
    })
  );

  // Add immutable caching header for hashed assets
  app.use("/assets/*", async (c, next) => {
    await next();
    if (isHashedAsset(c.req.path)) {
      c.res.headers.set("Cache-Control", IMMUTABLE_CACHE_HEADER);
    }
  });

  app.get("*", async (c) => {
    const html = await readFile(join(webDistPath, "index.html"), "utf8").catch(() => null);
    if (!html) return c.notFound();
    return c.html(html);
  });

  return app;
}
