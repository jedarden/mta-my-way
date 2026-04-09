/**
 * Hono application: API routes + static asset serving.
 *
 * Routes:
 *   GET /api/health                — per-feed status, circuit-breaker state
 *   GET /api/metrics               — Prometheus metrics export
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
  alertsQuerySchema,
  commuteAnalyzeRequestSchema,
  commuteIdQuerySchema,
  complexIdParamsSchema,
  contextClearRequestSchema,
  contextDetectRequestSchema,
  contextOverrideRequestSchema,
  contextSettingsUpdateRequestSchema,
  dateRangeParamsSchema,
  delayPatternsQuerySchema,
  delayPredictionRequestSchema,
  delayProbabilityQuerySchema,
  emptyQuerySchema,
  equipmentQuerySchema,
  lineIdParamsSchema,
  positionsQuerySchema,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  pushUpdateRequestSchema,
  routeIdParamsSchema,
  stationIdParamsSchema,
  stationSearchQuerySchema,
  tripCreateRequestSchema,
  tripIdParamsSchema,
  tripNotesUpdateRequestSchema,
  tripQuerySchema,
} from "@mta-my-way/shared";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { getAlertsForLine, getAlertsStatus, getAllAlerts } from "./alerts-poller.js";
import { avgLatency, errorCount24h, getArrivals, getFeedStates, getPositions } from "./cache.js";
import {
  clearManualOverride,
  detectContextFromRequest,
  getContextSettings,
  getContextSummary,
  setManualContext,
  updateContextSettings,
} from "./context-service.js";
import { getDelayDetectorStatus, getPredictedAlerts } from "./delay-detector.js";
import {
  getDelayPredictorStatus,
  getRouteDelayPatterns,
  getRouteDelayProbability,
  getRouteDelaySummary,
  predictDelay,
} from "./delay-predictor.js";
import { getAllEquipment, getEquipmentForStation, getEquipmentStatus } from "./equipment-poller.js";
import {
  auditLogAccess,
  csrfProtection,
  getCsrfToken,
  hppProtection,
  inputSanitization,
  rateLimiter,
  requestSizeLimits,
  requireResourceAccess,
  requireSameOrigin,
  securityHeaders,
  validateBody,
  validateParams,
  validateQuery,
} from "./middleware/index.js";
import { httpMetrics } from "./middleware/metrics.js";
import {
  recordCommuteAnalysisDuration,
  recordCommuteAnalysisRequest,
  recordDelayPredictionDuration,
  recordDelayPredictionRequest,
  recordStationSearchDuration,
  recordStationSearchRequest,
} from "./middleware/metrics.js";
import { logger } from "./observability/logger.js";
import { metrics } from "./observability/metrics.js";
import { tracingMiddleware } from "./observability/tracing.js";
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
import {
  calculateCommuteStats,
  deleteTrip,
  getTotalTripCount,
  getTripById,
  getTrips,
  getTripsByDateRange,
  recordTrip,
  updateTripNotes,
} from "./trip-tracking.js";

/** Server start time for uptime calculation */
const SERVER_START_MS = Date.now();

/** Number of feeds failing >5 min before returning 503 */
const UNHEALTHY_FEED_THRESHOLD = 3;

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

  // Distributed tracing for all requests
  app.use("*", tracingMiddleware);

  // Request size limits for all routes (DoS protection)
  app.use("*", requestSizeLimits());

  // Input sanitization for all API routes (XSS, SQL injection prevention)
  app.use("/api/*", inputSanitization());

  // CSRF protection for state-changing operations
  // Excludes health, metrics, and safe read-only endpoints
  app.use(
    "/api/*",
    csrfProtection({
      excludePaths: [
        "/api/health",
        "/api/metrics",
        "/api/stations",
        "/api/routes",
        "/api/static",
        "/api/arrivals",
        "/api/alerts",
        "/api/equipment",
        "/api/trip",
        "/api/positions",
        "/api/push/vapid-public-key",
        "/api/journal",
        "/api/context",
      ],
    })
  );

  // HPP protection for all API routes (prevents parameter pollution attacks)
  app.use("/api/*", hppProtection({ strategy: "first" }));

  // HTTP metrics collection for all API routes
  app.use("/api/*", httpMetrics());

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
  // CSRF token endpoint
  // -------------------------------------------------------------------------
  app.get("/api/csrf-token", (c) => {
    const token = getCsrfToken(c);
    if (!token) {
      // Generate a new token if none exists
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const newToken = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");

      c.header("Set-Cookie", `csrf_token=${newToken}; Path=/; SameSite=Strict; HttpOnly; Secure`);

      return c.json({ token: newToken });
    }

    return c.json({ token });
  });

  // -------------------------------------------------------------------------
  // Health endpoint
  // -------------------------------------------------------------------------
  app.get("/api/health", (c) => {
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;
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

    const memUsage = process.memoryUsage();
    const allMetrics = metrics.getAll();

    // Get cache hit rate from metrics (sum across all label combinations)
    let cacheHitsValue = 0;
    let cacheMissesValue = 0;
    const cacheHitsMap = allMetrics.get("cache_hits_total");
    const cacheMissesMap = allMetrics.get("cache_misses_total");
    if (cacheHitsMap) {
      for (const labeled of cacheHitsMap.values()) {
        if (labeled.metric.type === "counter") {
          cacheHitsValue += labeled.metric.value;
        }
      }
    }
    if (cacheMissesMap) {
      for (const labeled of cacheMissesMap.values()) {
        if (labeled.metric.type === "counter") {
          cacheMissesValue += labeled.metric.value;
        }
      }
    }
    const totalCacheRequests = cacheHitsValue + cacheMissesValue;
    const cacheHitRate =
      totalCacheRequests > 0 ? Math.round((cacheHitsValue / totalCacheRequests) * 100) / 100 : 0;

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
  // Metrics export endpoint (for Prometheus)
  // -------------------------------------------------------------------------
  app.get("/api/metrics", (c) => {
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;

    const metricsText = metrics.exportPrometheus();
    c.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return c.text(metricsText);
  });

  // -------------------------------------------------------------------------
  // Real-time arrivals
  // -------------------------------------------------------------------------
  app.get("/api/arrivals/:stationId", (c) => {
    const params = validateParams(c, stationIdParamsSchema);
    if (params instanceof Response) return params;

    const { id: stationId } = params;
    const arrivals = getArrivals(stationId);

    if (!arrivals) {
      return c.json({ error: "Station not found or no data yet" }, 404);
    }

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
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;

    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(Object.values(stations));
  });

  app.get("/api/stations/search", (c) => {
    const startTime = Date.now();
    const query = validateQuery(c, stationSearchQuerySchema);
    if (query instanceof Response) return query;

    const { q } = query;
    const trimmedQuery = q.trim();
    const normalizedQuery = normalizeForSearch(trimmedQuery);

    const results = Object.values(stations)
      .filter((station) => stationMatchesQuery(station, normalizedQuery, trimmedQuery))
      .map((station) => ({
        station,
        score: scoreSearchResult(station, trimmedQuery),
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ station }) => station);

    const duration = (Date.now() - startTime) / 1000;
    recordStationSearchDuration(duration);
    recordStationSearchRequest(results.length);

    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(results);
  });

  app.get("/api/stations/:id", (c) => {
    const params = validateParams(c, stationIdParamsSchema);
    if (params instanceof Response) return params;

    const { id } = params;
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
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;

    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(Object.values(routes));
  });

  app.get("/api/routes/:id", (c) => {
    const params = validateParams(c, routeIdParamsSchema);
    if (params instanceof Response) return params;

    const { id } = params;
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
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;

    c.header("Cache-Control", STATIC_CACHE_HEADER);
    return c.json(Object.values(complexes));
  });

  app.get("/api/static/complexes/:id", (c) => {
    const params = validateParams(c, complexIdParamsSchema);
    if (params instanceof Response) return params;

    const { id } = params;
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
  app.post("/api/commute/analyze", requireResourceAccess("commute", "create"), async (c) => {
    const startTime = Date.now();
    let success = false;
    let hasTransfers = false;
    let accessibleMode = false;

    try {
      const body = await validateBody(c, commuteAnalyzeRequestSchema);
      if (body instanceof Response) return body;

      const {
        originId,
        destinationId,
        preferredLines = [],
        commuteId = "default",
        accessibleMode: accessible,
      } = body;

      accessibleMode = accessible;

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

      hasTransfers = analysis.transferRoutes.length > 0;
      success = true;

      const duration = (Date.now() - startTime) / 1000;
      recordCommuteAnalysisDuration(duration);
      recordCommuteAnalysisRequest(success, hasTransfers, accessibleMode);

      c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
      return c.json(analysis);
    } catch (error) {
      logger.error("Commute analysis error", error instanceof Error ? error : undefined);

      const duration = (Date.now() - startTime) / 1000;
      recordCommuteAnalysisDuration(duration);
      recordCommuteAnalysisRequest(false, false, accessibleMode);

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
    // Validate query parameters to prevent injection attacks
    const query = validateQuery(c, alertsQuerySchema);
    if (query instanceof Response) return query;

    // Apply filtering if query parameters are provided
    let officialAlerts = getAllAlerts();
    if (query.lineId) {
      officialAlerts = getAlertsForLine(query.lineId);
    }
    if (query.activeOnly) {
      officialAlerts = officialAlerts.filter((a) => a.isActive);
    }

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
    const params = validateParams(c, lineIdParamsSchema);
    if (params instanceof Response) return params;

    const { lineId } = params;
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
    // Validate query parameters to prevent injection attacks
    const query = validateQuery(c, equipmentQuerySchema);
    if (query instanceof Response) return query;

    // Apply filtering if query parameters are provided
    let summaries = getAllEquipment();
    if (query.stationId) {
      const summary = getEquipmentForStation(query.stationId);
      return c.json(summary ? { stations: [summary], count: 1 } : { stations: [], count: 0 });
    }
    if (query.type && query.type !== "all") {
      summaries = summaries.filter((s) =>
        s.equipment.some((e) => e.type.toLowerCase() === query.type!.toLowerCase())
      );
    }

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json({ stations: summaries, count: summaries.length });
  });

  app.get("/api/equipment/:stationId", (c) => {
    const params = validateParams(c, stationIdParamsSchema);
    if (params instanceof Response) return params;

    const { id: stationId } = params;
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
    const query = validateQuery(c, delayProbabilityQuerySchema);
    if (query instanceof Response) return query;

    const { routeId, direction } = query;

    const probability = getRouteDelayProbability(routeId, direction as "N" | "S" | undefined);

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
    const params = validateParams(c, lineIdParamsSchema);
    if (params instanceof Response) return params;

    const query = validateQuery(c, delayPatternsQuerySchema);
    if (query instanceof Response) return query;

    const { lineId: routeId } = params;
    const { direction } = query;

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
    const params = validateParams(c, lineIdParamsSchema);
    if (params instanceof Response) return params;

    const { lineId: routeId } = params;
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
    const startTime = Date.now();
    let success = false;
    let hasData = false;

    try {
      const body = await validateBody(c, delayPredictionRequestSchema);
      if (body instanceof Response) return body;

      const { routeId, direction, fromStationId, toStationId, scheduledMinutes } = body;

      const scheduledSeconds = scheduledMinutes * 60;
      const prediction = predictDelay(
        routeId,
        direction,
        fromStationId,
        toStationId,
        scheduledSeconds
      );

      if (!prediction) {
        const duration = (Date.now() - startTime) / 1000;
        recordDelayPredictionDuration(duration);
        recordDelayPredictionRequest(false, false);

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

      hasData = true;
      success = true;

      const duration = (Date.now() - startTime) / 1000;
      recordDelayPredictionDuration(duration);
      recordDelayPredictionRequest(success, hasData);

      c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
      return c.json(prediction);
    } catch (error) {
      logger.error("Delay prediction error", error instanceof Error ? error : undefined);

      const duration = (Date.now() - startTime) / 1000;
      recordDelayPredictionDuration(duration);
      recordDelayPredictionRequest(false, false);

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
    const params = validateParams(c, tripIdParamsSchema);
    if (params instanceof Response) return params;

    const { tripId } = params;
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
    const params = validateParams(c, tripIdParamsSchema);
    if (params instanceof Response) return params;

    const { tripId } = params;
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
    const params = validateParams(c, lineIdParamsSchema);
    if (params instanceof Response) return params;

    const query = validateQuery(c, positionsQuerySchema);
    if (query instanceof Response) return query;

    const { lineId } = params;
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

  // Apply same-origin protection to all push subscription operations
  app.use("/api/push/*", requireSameOrigin());

  /** Return the VAPID public key so the browser can create a push subscription */
  app.get("/api/push/vapid-public-key", (c) => {
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;

    const publicKey = getVapidPublicKey();
    if (!publicKey) {
      return c.json({ error: "Push notifications not configured" }, 503);
    }
    // Short cache: browsers need a fresh key if we ever rotate
    c.header("Cache-Control", "public, max-age=3600");
    return c.json({ publicKey });
  });

  /** Register a push subscription */
  app.post(
    "/api/push/subscribe",
    requireResourceAccess("subscription", "create", { adminBypass: false }),
    auditLogAccess("subscription", "create"),
    async (c) => {
      try {
        const body = await validateBody(c, pushSubscribeRequestSchema);
        if (body instanceof Response) return body;

        upsertSubscription(body);

        logger.info("Push subscription registered", {
          lines: body.favorites?.map((f) => f.lines).flat() ?? [],
          total_subscriptions: getSubscriptionCount(),
        });

        return c.json({ success: true });
      } catch (err) {
        logger.error("Push subscription registration failed", err as Error);
        return c.json({ error: "Failed to register subscription" }, 500);
      }
    }
  );

  /** Remove a push subscription */
  app.delete(
    "/api/push/unsubscribe",
    requireResourceAccess("subscription", "delete", { adminBypass: false }),
    auditLogAccess("subscription", "delete"),
    async (c) => {
      try {
        const body = await validateBody(c, pushUnsubscribeRequestSchema);
        if (body instanceof Response) return body;

        const removed = removeSubscription(body.endpoint);

        logger.info("Push subscription removed", {
          removed,
          total_subscriptions: getSubscriptionCount(),
        });

        return c.json({ success: true });
      } catch (err) {
        logger.error("Push subscription removal failed", err as Error);
        return c.json({ error: "Failed to remove subscription" }, 500);
      }
    }
  );

  /** Update favorites or quiet hours for an existing push subscription */
  app.patch(
    "/api/push/subscription",
    requireResourceAccess("subscription", "update", { adminBypass: false }),
    auditLogAccess("subscription", "update"),
    async (c) => {
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
        logger.error("Push subscription update failed", err as Error);
        return c.json({ error: "Failed to update subscription" }, 500);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Trip tracking and commute journal API (Phase 5)
  // -------------------------------------------------------------------------

  // Apply same-origin protection to all trip tracking operations
  app.use("/api/trips*", requireSameOrigin());
  app.use("/api/journal/*", requireSameOrigin());

  /** Record a trip in the journal */
  app.post(
    "/api/trips",
    requireResourceAccess("trip", "create"),
    auditLogAccess("trip", "create"),
    async (c) => {
      try {
        const body = await validateBody(c, tripCreateRequestSchema);
        if (body instanceof Response) return body;

        const { date, origin, destination, line, departureTime, arrivalTime, notes } = body;

        const actualDurationMinutes = Math.round((arrivalTime - departureTime) / 60000);

        const trip = recordTrip({
          date: date ?? new Date(departureTime * 1000).toISOString().split("T")[0]!,
          origin,
          destination,
          line,
          departureTime,
          arrivalTime,
          actualDurationMinutes,
          source: "manual",
          notes,
        });

        if (!trip) {
          return c.json({ error: "Failed to record trip" }, 500);
        }

        c.header("Cache-Control", "no-cache");
        return c.json({ success: true, trip }, 201);
      } catch (error) {
        logger.error("Trip recording failed", error as Error);
        return c.json(
          {
            error: "Failed to record trip",
            message: error instanceof Error ? error.message : "Unknown error",
          },
          500
        );
      }
    }
  );

  /** Get trips from the journal with optional filters */
  app.get("/api/trips", (c) => {
    const query = validateQuery(c, tripQuerySchema);
    if (query instanceof Response) return query;

    const trips = getTrips(query);

    c.header("Cache-Control", "public, max-age=15");
    return c.json({
      trips,
      count: trips.length,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  });

  /** Get a single trip by ID */
  app.get("/api/trips/:tripId", (c) => {
    const params = validateParams(c, tripIdParamsSchema);
    if (params instanceof Response) return params;

    const { tripId } = params;
    const trip = getTripById(tripId);

    if (!trip) {
      return c.json({ error: "Trip not found" }, 404);
    }

    c.header("Cache-Control", "public, max-age=60");
    return c.json(trip);
  });

  /** Update trip notes */
  app.patch(
    "/api/trips/:tripId/notes",
    requireResourceAccess("trip", "update"),
    auditLogAccess("trip", "update"),
    async (c) => {
      const params = validateParams(c, tripIdParamsSchema);
      if (params instanceof Response) return params;

      const body = await validateBody(c, tripNotesUpdateRequestSchema);
      if (body instanceof Response) return body;

      const { tripId } = params;
      const { notes } = body;

      const success = updateTripNotes(tripId, notes);

      if (!success) {
        return c.json({ error: "Trip not found" }, 404);
      }

      return c.json({ success: true });
    }
  );

  /** Delete a trip from the journal */
  app.delete(
    "/api/trips/:tripId",
    requireResourceAccess("trip", "delete"),
    auditLogAccess("trip", "delete"),
    (c) => {
      const params = validateParams(c, tripIdParamsSchema);
      if (params instanceof Response) return params;

      const { tripId } = params;
      const success = deleteTrip(tripId);

      if (!success) {
        return c.json({ error: "Trip not found" }, 404);
      }

      return c.json({ success: true });
    }
  );

  /** Get commute statistics */
  app.get("/api/journal/stats", (c) => {
    const query = validateQuery(c, commuteIdQuerySchema);
    if (query instanceof Response) return query;

    const commuteId = query.commuteId ?? "default";
    const stats = calculateCommuteStats(commuteId);

    c.header("Cache-Control", "public, max-age=60");
    return c.json(stats);
  });

  /** Get trips for a specific date range */
  app.get("/api/journal/dates/:startDate/:endDate", (c) => {
    const params = validateParams(c, dateRangeParamsSchema);
    if (params instanceof Response) return params;

    const { startDate, endDate } = params;
    const trips = getTripsByDateRange(startDate, endDate);

    c.header("Cache-Control", "public, max-age=30");
    return c.json({
      startDate,
      endDate,
      trips,
      count: trips.length,
    });
  });

  /** Get journal summary (recent trips + stats) */
  app.get("/api/journal/summary", (c) => {
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;

    const recentTrips = getTrips({ limit: 10 });
    const stats = calculateCommuteStats("default");
    const totalTrips = getTotalTripCount();

    c.header("Cache-Control", "public, max-age=30");
    return c.json({
      recentTrips,
      stats,
      totalTrips,
    });
  });

  // -------------------------------------------------------------------------
  // Context-aware switching API (Phase 5)
  // -------------------------------------------------------------------------

  // Apply same-origin protection to context operations
  app.use("/api/context/*", requireSameOrigin());

  /** Get current context and UI hints */
  app.get("/api/context", (c) => {
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;

    const summary = getContextSummary();

    c.header("Cache-Control", "public, max-age=15");
    return c.json(summary);
  });

  /** Detect context from request parameters */
  app.post("/api/context/detect", requireResourceAccess("context", "create"), async (c) => {
    try {
      const body = await validateBody(c, contextDetectRequestSchema);
      if (body instanceof Response) return body;

      const context = detectContextFromRequest(body);

      c.header("Cache-Control", "no-cache");
      return c.json({ context });
    } catch (err) {
      logger.error("Context detection failed", err as Error);
      return c.json(
        {
          error: "Failed to detect context",
          message: err instanceof Error ? err.message : "Unknown error",
        },
        500
      );
    }
  });

  /** Set manual context override */
  app.post(
    "/api/context/override",
    requireResourceAccess("context", "update"),
    auditLogAccess("context", "update"),
    async (c) => {
      try {
        const body = await validateBody(c, contextOverrideRequestSchema);
        if (body instanceof Response) return body;

        const { context } = body;
        const newContext = setManualContext(context);

        c.header("Cache-Control", "no-cache");
        return c.json({ success: true, context: newContext });
      } catch (error) {
        logger.error("Context override failed", error as Error);
        return c.json({ error: "Failed to set context override" }, 500);
      }
    }
  );

  /** Clear manual context override */
  app.post("/api/context/clear", async (c) => {
    const body = await validateBody(c, contextClearRequestSchema);
    if (body instanceof Response) return body;

    const context = clearManualOverride();

    c.header("Cache-Control", "no-cache");
    return c.json({ success: true, context });
  });

  /** Update context settings */
  app.patch(
    "/api/context/settings",
    requireResourceAccess("context", "update"),
    auditLogAccess("context", "update"),
    async (c) => {
      try {
        const body = await validateBody(c, contextSettingsUpdateRequestSchema);
        if (body instanceof Response) return body;

        updateContextSettings(body);

        return c.json({ success: true, settings: getContextSettings() });
      } catch (error) {
        logger.error("Context settings update failed", error as Error);
        return c.json({ error: "Failed to update context settings" }, 500);
      }
    }
  );

  // -------------------------------------------------------------------------
  // Static PWA assets (must come last; catches /* after /api/* routes)
  // -------------------------------------------------------------------------

  /**
   * Cache header for non-hashed static assets (icons, images, etc.)
   * 1 day cache with 7 day stale-while-revalidate for CDN/edge caching
   */
  const STATIC_ASSET_CACHE_HEADER = "public, max-age=86400, stale-while-revalidate=604800";

  /**
   * No-cache header for HTML entry points (index.html, offline.html)
   * Ensures users always get the latest HTML which references the hashed assets
   */
  const HTML_CACHE_HEADER = "no-cache";

  /**
   * Determine appropriate cache header based on file path.
   * - Hashed assets: immutable (1 year)
   * - HTML files: no-cache
   * - Other static assets: 1 day with stale-while-revalidate
   */
  function getCacheHeaderForPath(path: string): string {
    // HTML files should not be cached (always fresh)
    if (path.endsWith(".html")) {
      return HTML_CACHE_HEADER;
    }
    // Hashed assets get immutable caching
    if (isHashedAsset(path)) {
      return IMMUTABLE_CACHE_HEADER;
    }
    // All other static assets get moderate caching
    return STATIC_ASSET_CACHE_HEADER;
  }

  // Serve static files with appropriate cache headers
  app.use("/*", async (c, next) => {
    // Only apply to static file requests (not API routes)
    if (c.req.path.startsWith("/api/")) {
      return next();
    }

    // Determine cache header for this path
    const cacheHeader = getCacheHeaderForPath(c.req.path);

    // Set cache header before serving static content
    c.header("Cache-Control", cacheHeader);

    return next();
  });

  app.use(
    "/*",
    serveStatic({
      root: webDistPath,
    })
  );

  app.get("*", async (c) => {
    const html = await readFile(join(webDistPath, "index.html"), "utf8").catch(() => null);
    if (!html) return c.notFound();
    return c.html(html);
  });

  return app;
}
