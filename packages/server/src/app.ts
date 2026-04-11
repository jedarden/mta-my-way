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
  dateRangeParamsSchema,
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
// Context-aware switching service imports - DISABLED: Feature not used by frontend
// Uncomment to re-enable context detection functionality.
// import {
//   DEFAULT_CONTEXT,
//   checkContextOwnership,
//   clearManualOverride,
//   clearManualOverrideForOwner,
//   detectAndUpdateContextWithOwner,
//   getContextByOwner,
//   getContextOwner,
//   getContextSettings,
//   getContextTransitionsForOwner,
//   getCurrentContext,
//   updateContextSettings,
// } from "./context-service.js";
import { getDelayDetectorStatus, getPredictedAlerts } from "./delay-detector.js";
import { getDelayPredictorStatus } from "./delay-predictor.js";
import { getAllEquipment, getEquipmentForStation, getEquipmentStatus } from "./equipment-poller.js";
// Authentication imports - MFA functions disabled: Feature not used by frontend
// Uncomment to re-enable MFA functionality.
import {
  // createSession,
  // disableTotp,
  // enableTotp,
  // getAuthContext,
  // setupTotp,
  // verifyMfaForSession,
  // verifyTotpCode,
} from "./middleware/authentication.js";
import {
  auditLogAccess,
  csrfProtection,
  getCsrfToken,
  hostHeaderProtection,
  hppProtection,
  inputSanitization,
  rateLimiter,
  requestSizeLimits,
  requireResourceAccess,
  requireSameOrigin,
  securityHeaders,
  securityLogging,
  validateBody,
  validateParams,
  validateQuery,
} from "./middleware/index.js";
import { httpMetrics } from "./middleware/metrics.js";
import {
  recordCommuteAnalysisDuration,
  recordCommuteAnalysisRequest,
  recordStationSearchDuration,
  recordStationSearchRequest,
} from "./middleware/metrics.js";
import {
  type Permission,
  getRbacAuthContext,
  requireOwnershipOrAdmin,
  requirePermission,
} from "./middleware/rbac.js";
// OAuth 2.0 imports - DISABLED: Feature not used by frontend
// Uncomment to re-enable OAuth 2.0 authentication functionality.
// import {
//   cleanupExpiredStates,
//   createAuthorizationUrl,
//   getActiveOAuthProviders,
//   handleOAuthCallback,
//   initializeDefaultProviders,
// } from "./oauth/index.js";
import { logger } from "./observability/logger.js";
import { metrics } from "./observability/metrics.js";
import { tracingMiddleware } from "./observability/tracing.js";
import { buildLineDiagram } from "./positions-interpolator.js";
import {
  getSubscriptionCount,
  getSubscriptionOwner,
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
  // CSP includes report-uri for violation monitoring at /api/security/csp-report
  app.use(
    "*",
    securityHeaders({
      reportUri: "/api/security/csp-report",
    })
  );

  // Security logging for all requests (OWASP A09: Security Logging and Monitoring Failures)
  // Logs authentication failures, authorization failures, rate limit exceeded, and blocked attacks
  app.use("*", securityLogging());

  // Host header protection to prevent cache poisoning and password reset poisoning
  // In production, set ALLOWED_HOSTS environment variable to restrict allowed hosts
  const isProduction = process.env["NODE_ENV"] === "production";
  const allowedHosts = process.env["ALLOWED_HOSTS"]
    ? process.env["ALLOWED_HOSTS"].split(",")
    : undefined;
  app.use(
    "*",
    hostHeaderProtection({
      allowedHosts,
      blockMissingHost: isProduction, // Only require Host header in production
      blockIpAddresses: isProduction,
      blockPrivateNetworks: isProduction,
      blockLocalhost: !isProduction, // Block localhost only in production
    })
  );

  // Distributed tracing for all requests
  app.use("*", tracingMiddleware);

  // Request size limits for all routes (DoS protection)
  app.use("*", requestSizeLimits());

  // Input sanitization for all API routes (XSS, SQL injection prevention)
  app.use("/api/*", inputSanitization());

  // CSRF protection for state-changing operations
  // Excludes health, metrics, and safe read-only endpoints
  // NOTE: /api/context, /api/auth/oauth, /api/auth/mfa, /api/auth/session, and /api/auth/password are disabled
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
        // "/api/context", // DISABLED: Feature not used by frontend
        // "/api/auth/oauth", // DISABLED: Feature not used by frontend
        // "/api/auth/mfa", // DISABLED: Feature not used by frontend
        // "/api/auth/session", // DISABLED: Feature not used by frontend
        // "/api/auth/password", // DISABLED: Feature not used by frontend
        "/api/csrf-token",
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
  // CSP violation reporting endpoint
  // -------------------------------------------------------------------------
  app.post("/api/security/csp-report", async (c) => {
    try {
      const report = await c.req.json().catch(() => null);

      if (!report) {
        return c.json({ error: "Invalid report" }, 400);
      }

      // Log the CSP violation for security monitoring
      logger.warn("CSP violation detected", {
        "user-agent": c.req.header("user-agent"),
        referrer: c.req.header("referrer"),
        "x-forwarded-for": c.req.header("x-forwarded-for")?.split(",")[0] ?? "unknown",
        report,
      });

      // Return 200 to acknowledge the report
      return c.json({ received: true });
    } catch (error) {
      logger.error("Failed to process CSP report", error as Error);
      return c.json({ error: "Failed to process report" }, 400);
    }
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
  // Commute analysis - requires authentication for personal commute tracking
  // -------------------------------------------------------------------------
  app.post(
    "/api/commute/analyze",
    requireResourceAccess("commute", "create"),
    requirePermission("commutes:create" as Permission),
    auditLogAccess("commute", "analyze"),
    async (c) => {
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
    }
  );

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
  // Delay prediction API - DISABLED: Feature not used by frontend
  // These endpoints are disabled to reduce security surface area.
  // Uncomment to re-enable delay prediction functionality.
  // -------------------------------------------------------------------------
  // app.get("/api/predictions/delay", (c) => {
  //   const query = validateQuery(c, delayProbabilityQuerySchema);
  //   if (query instanceof Response) return query;
  //
  //   const { routeId, direction } = query;
  //
  //   const probability = getRouteDelayProbability(routeId, direction as "N" | "S" | undefined);
  //
  //   if (probability === null) {
  //     return c.json({
  //       routeId,
  //       direction,
  //       probability: null,
  //       message: "Not enough data to predict delays for this route",
  //     });
  //   }
  //
  //   c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
  //   return c.json({
  //     routeId,
  //     direction,
  //     probability: Math.round(probability * 100) / 100,
  //     percentage: Math.round(probability * 100),
  //     timestamp: new Date().toISOString(),
  //   });
  // });
  //
  // app.get("/api/predictions/delay/:routeId", (c) => {
  //   const params = validateParams(c, lineIdParamsSchema);
  //   if (params instanceof Response) return params;
  //
  //   const query = validateQuery(c, delayPatternsQuerySchema);
  //   if (query instanceof Response) return query;
  //
  //   const { lineId: routeId } = params;
  //   const { direction } = query;
  //
  //   if (direction !== "N" && direction !== "S") {
  //     // Return patterns for both directions if none specified
  //     const northboundPatterns = getRouteDelayPatterns(routeId, "N");
  //     const southboundPatterns = getRouteDelayPatterns(routeId, "S");
  //
  //     c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
  //     return c.json({
  //       routeId,
  //       northbound: northboundPatterns,
  //       southbound: southboundPatterns,
  //       timestamp: new Date().toISOString(),
  //     });
  //   }
  //
  //   const patterns = getRouteDelayPatterns(routeId, direction as "N" | "S");
  //
  //   c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
  //   return c.json({
  //     routeId,
  //     direction,
  //     patterns,
  //     timestamp: new Date().toISOString(),
  //   });
  // });
  //
  // app.get("/api/predictions/delay/:routeId/summary", (c) => {
  //   const params = validateParams(c, lineIdParamsSchema);
  //   if (params instanceof Response) return params;
  //
  //   const { lineId: routeId } = params;
  //   const summary = getRouteDelaySummary(routeId);
  //
  //   if (!summary) {
  //     return c.json(
  //       {
  //         error: "No data available for this route",
  //         routeId,
  //       },
  //       404
  //     );
  //   }
  //
  //   c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
  //   return c.json(summary);
  // });
  //
  // app.post("/api/predictions/predict", async (c) => {
  //   const startTime = Date.now();
  //   let success = false;
  //   let hasData = false;
  //
  //   try {
  //     const body = await validateBody(c, delayPredictionRequestSchema);
  //     if (body instanceof Response) return body;
  //
  //     const { routeId, direction, fromStationId, toStationId, scheduledMinutes } = body;
  //
  //     const scheduledSeconds = scheduledMinutes * 60;
  //     const prediction = predictDelay(
  //       routeId,
  //       direction,
  //       fromStationId,
  //       toStationId,
  //       scheduledSeconds
  //     );
  //
  //     if (!prediction) {
  //       const duration = (Date.now() - startTime) / 1000;
  //       recordDelayPredictionDuration(duration);
  //       recordDelayPredictionRequest(false, false);
  //
  //       return c.json(
  //         {
  //           error: "Not enough data to make a prediction for this route/segment",
  //           routeId,
  //           direction,
  //           fromStationId,
  //           toStationId,
  //         },
  //         404
  //       );
  //     }
  //
  //     hasData = true;
  //     success = true;
  //
  //     const duration = (Date.now() - startTime) / 1000;
  //     recordDelayPredictionDuration(duration);
  //     recordDelayPredictionRequest(success, hasData);
  //
  //     c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
  //     return c.json(prediction);
  //   } catch (error) {
  //     logger.error("Delay prediction error", error instanceof Error ? error : undefined);
  //
  //     const duration = (Date.now() - startTime) / 1000;
  //     recordDelayPredictionDuration(duration);
  //     recordDelayPredictionRequest(false, false);
  //
  //     return c.json(
  //       {
  //         error: "Failed to generate prediction",
  //         message: error instanceof Error ? error.message : "Unknown error",
  //       },
  //       500
  //     );
  //   }
  // });

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
  // Trip ETA prediction with delay modeling - DISABLED: Feature not used by frontend
  // This endpoint is disabled to reduce security surface area.
  // Uncomment to re-enable trip ETA prediction functionality.
  // -------------------------------------------------------------------------
  // app.get("/api/trip/:tripId/predict", (c) => {
  //   const params = validateParams(c, tripIdParamsSchema);
  //   if (params instanceof Response) return params;
  //
  //   const { tripId } = params;
  //   const trip = lookupTrip(tripId, stations);
  //
  //   if (!trip) {
  //     return c.json({ error: "Trip not found or no longer active" }, 404);
  //   }
  //
  //   // Calculate remaining trip segments for delay prediction
  //   const segments: Array<{
  //     fromStationId: string;
  //     toStationId: string;
  //     fromStationName: string;
  //     toStationName: string;
  //     scheduledSeconds: number;
  //   }> = [];
  //
  //   for (let i = trip.currentStopIndex; i < trip.stops.length - 1; i++) {
  //     const currentStop = trip.stops[i]!;
  //     const nextStop = trip.stops[i + 1]!;
  //
  //     const departureTime = currentStop.departureTime ?? currentStop.arrivalTime;
  //     const arrivalTime = nextStop.arrivalTime ?? nextStop.departureTime;
  //
  //     if (departureTime && arrivalTime && arrivalTime > departureTime) {
  //       segments.push({
  //         fromStationId: currentStop.stationId ?? currentStop.stopId,
  //         toStationId: nextStop.stationId ?? nextStop.stopId,
  //         fromStationName: currentStop.stationName,
  //         toStationName: nextStop.stationName,
  //         scheduledSeconds: arrivalTime - departureTime,
  //       });
  //     }
  //   }
  //
  //   // Get delay predictions for each segment
  //   const segmentPredictions = segments.map((segment) => {
  //     const prediction = predictDelay(
  //       trip.routeId,
  //       trip.direction ?? "N",
  //       segment.fromStationId,
  //       segment.toStationId,
  //       segment.scheduledSeconds
  //     );
  //
  //     return {
  //       ...segment,
  //       prediction: prediction ?? null,
  //     };
  //   });
  //
  //   // Calculate overall ETA adjustment
  //   let totalScheduledSeconds = 0;
  //   let totalPredictedSeconds = 0;
  //   let hasPredictions = false;
  //
  //   for (const segment of segmentPredictions) {
  //     totalScheduledSeconds += segment.scheduledSeconds;
  //     if (segment.prediction) {
  //       totalPredictedSeconds += segment.prediction.predictedMinutes * 60;
  //       hasPredictions = true;
  //     } else {
  //       totalPredictedSeconds += segment.scheduledSeconds;
  //     }
  //   }
  //
  //   // Calculate base ETA from trip data
  //   const lastStop = trip.stops[trip.stops.length - 1];
  //   const baseEtaSeconds = lastStop?.arrivalTime ?? null;
  //   const baseEta = baseEtaSeconds ? new Date(baseEtaSeconds * 1000).toISOString() : null;
  //
  //   // Calculate adjusted ETA if we have predictions
  //   let adjustedEtaSeconds: number | null = null;
  //   let adjustedEta: string | null = null;
  //   let delayRisk: "low" | "medium" | "high" | null = null;
  //   let delayMinutesRange: string | null = null;
  //
  //   if (hasPredictions && baseEtaSeconds) {
  //     const etaAdjustmentSeconds = totalPredictedSeconds - totalScheduledSeconds;
  //     adjustedEtaSeconds = baseEtaSeconds + etaAdjustmentSeconds;
  //     adjustedEta = new Date(adjustedEtaSeconds * 1000).toISOString();
  //
  //     // Calculate delay risk
  //     const delayRatio = totalPredictedSeconds / totalScheduledSeconds;
  //     if (delayRatio < 1.1) {
  //       delayRisk = "low";
  //     } else if (delayRatio < 1.3) {
  //       delayRisk = "medium";
  //     } else {
  //       delayRisk = "high";
  //     }
  //
  //     // Calculate delay range in minutes
  //     const delayMinutes = Math.round(etaAdjustmentSeconds / 60);
  //     if (delayMinutes > 0) {
  //       delayMinutesRange = `+${delayMinutes} min`;
  //     } else if (delayMinutes < 0) {
  //       delayMinutesRange = `${delayMinutes} min`;
  //     } else {
  //       delayMinutesRange = "On time";
  //     }
  //   }
  //
  //   // Get route-level delay probability
  //   const routeDelayProbability = getRouteDelayProbability(trip.routeId, trip.direction ?? "N");
  //
  //   c.header("Cache-Control", "public, max-age=30");
  //   return c.json({
  //     tripId: trip.tripId,
  //     routeId: trip.routeId,
  //     direction: trip.direction,
  //     destination: trip.destination,
  //     progressPercent: trip.progressPercent,
  //     remainingStops: trip.remainingStops,
  //     totalStops: trip.totalStops,
  //     baseEta,
  //     adjustedEta,
  //     delayRisk,
  //     delayMinutesRange,
  //     routeDelayProbability,
  //     segments: segmentPredictions,
  //     hasPredictions,
  //     generatedAt: new Date().toISOString(),
  //   });
  // });

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
        const auth = getRbacAuthContext(c);
        const body = await validateBody(c, pushSubscribeRequestSchema);
        if (body instanceof Response) return body;

        // Use the authenticated user's keyId as the owner
        const ownerId = auth?.keyId || "anonymous";
        upsertSubscription(body, ownerId);

        logger.info("Push subscription registered", {
          lines: body.favorites?.map((f) => f.lines).flat() ?? [],
          total_subscriptions: getSubscriptionCount(),
          ownerId,
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
    requireOwnershipOrAdmin("subscriptions", {
      getOwnerId: async (c) => {
        const body = await c.req.json().catch(() => ({}));
        return getSubscriptionOwner(body.endpoint) || "";
      },
      adminBypass: true,
    }),
    requireResourceAccess("subscription", "delete", { adminBypass: true }),
    auditLogAccess("subscription", "delete"),
    async (c) => {
      try {
        const auth = getRbacAuthContext(c);
        const body = await validateBody(c, pushUnsubscribeRequestSchema);
        if (body instanceof Response) return body;

        // Use the authenticated user's keyId as the owner
        const ownerId = auth?.keyId || "anonymous";
        const removed = removeSubscription(body.endpoint, ownerId);

        logger.info("Push subscription removed", {
          removed,
          total_subscriptions: getSubscriptionCount(),
          ownerId,
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
    requireOwnershipOrAdmin("subscriptions", {
      getOwnerId: async (c) => {
        const body = await c.req.json().catch(() => ({}));
        return getSubscriptionOwner(body.endpoint) || "";
      },
      adminBypass: true,
    }),
    requireResourceAccess("subscription", "update", { adminBypass: true }),
    auditLogAccess("subscription", "update"),
    async (c) => {
      try {
        const auth = getRbacAuthContext(c);
        const body = await validateBody(c, pushUpdateRequestSchema);
        if (body instanceof Response) return body;

        const ownerId = auth?.keyId || "anonymous";

        if (body.favorites) {
          updateSubscriptionFavorites(body.endpoint, body.favorites, ownerId);
        }

        if (body.quietHours) {
          updateSubscriptionQuietHours(body.endpoint, body.quietHours, ownerId);
        }

        if (body.morningScores) {
          updateSubscriptionMorningScores(body.endpoint, body.morningScores, ownerId);
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
        const auth = getRbacAuthContext(c);
        const body = await validateBody(c, tripCreateRequestSchema);
        if (body instanceof Response) return body;

        const { date, origin, destination, line, departureTime, arrivalTime, notes } = body;

        const actualDurationMinutes = Math.round((arrivalTime - departureTime) / 60000);

        // Use authenticated user's keyId as owner
        const ownerId = auth?.keyId || "anonymous";
        const trip = recordTrip(
          {
            date: date ?? new Date(departureTime * 1000).toISOString().split("T")[0]!,
            origin,
            destination,
            line,
            departureTime,
            arrivalTime,
            actualDurationMinutes,
            source: "manual",
            notes,
          },
          ownerId
        );

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
  app.get("/api/trips", requirePermission("trips:read:own" as Permission), (c) => {
    const query = validateQuery(c, tripQuerySchema);
    if (query instanceof Response) return query;

    const auth = getRbacAuthContext(c);

    // Non-admin users can only see their own trips
    const trips = getTrips({
      ...query,
      ownerId: auth?.role === "admin" ? undefined : auth?.keyId || "anonymous",
    });

    c.header("Cache-Control", "public, max-age=15");
    return c.json({
      trips,
      count: trips.length,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  });

  /** Get a single trip by ID */
  app.get(
    "/api/trips/:tripId",
    requireOwnershipOrAdmin("trips", {
      getOwnerId: (c) => {
        const tripId = c.req.param("tripId");
        const trip = getTripById(tripId);
        return trip?.ownerId || "";
      },
      adminBypass: true,
    }),
    (c) => {
      const params = validateParams(c, tripIdParamsSchema);
      if (params instanceof Response) return params;

      const { tripId } = params;
      const trip = getTripById(tripId);

      if (!trip) {
        return c.json({ error: "Trip not found" }, 404);
      }

      c.header("Cache-Control", "public, max-age=60");
      return c.json(trip);
    }
  );

  /** Update trip notes */
  app.patch(
    "/api/trips/:tripId/notes",
    requireOwnershipOrAdmin("trips", {
      getOwnerId: (c) => {
        const tripId = c.req.param("tripId");
        const trip = getTripById(tripId);
        return trip?.ownerId || "";
      },
    }),
    requireResourceAccess("trip", "update"),
    auditLogAccess("trip", "update"),
    async (c) => {
      const auth = getRbacAuthContext(c);
      const params = validateParams(c, tripIdParamsSchema);
      if (params instanceof Response) return params;

      const body = await validateBody(c, tripNotesUpdateRequestSchema);
      if (body instanceof Response) return body;

      const { tripId } = params;
      const { notes } = body;

      // Pass ownerId for defense-in-depth check (middleware already validated)
      const ownerId = auth?.role === "admin" ? undefined : auth?.keyId || "anonymous";
      const success = updateTripNotes(tripId, notes, ownerId);

      if (!success) {
        return c.json({ error: "Trip not found" }, 404);
      }

      return c.json({ success: true });
    }
  );

  /** Delete a trip from the journal */
  app.delete(
    "/api/trips/:tripId",
    requireOwnershipOrAdmin("trips", {
      getOwnerId: (c) => {
        const tripId = c.req.param("tripId");
        const trip = getTripById(tripId);
        return trip?.ownerId || "";
      },
    }),
    requireResourceAccess("trip", "delete"),
    auditLogAccess("trip", "delete"),
    (c) => {
      const auth = getRbacAuthContext(c);
      const params = validateParams(c, tripIdParamsSchema);
      if (params instanceof Response) return params;

      const { tripId } = params;

      // Pass ownerId for defense-in-depth check (middleware already validated)
      const ownerId = auth?.role === "admin" ? undefined : auth?.keyId || "anonymous";
      const success = deleteTrip(tripId, ownerId);

      if (!success) {
        return c.json({ error: "Trip not found" }, 404);
      }

      return c.json({ success: true });
    }
  );

  /** Get commute statistics */
  app.get("/api/journal/stats", requirePermission("journals:read:own" as Permission), (c) => {
    const query = validateQuery(c, commuteIdQuerySchema);
    if (query instanceof Response) return query;

    const auth = getRbacAuthContext(c);
    const commuteId = query.commuteId ?? "default";

    // Non-admin users can only see their own stats
    const stats = calculateCommuteStats(
      commuteId,
      auth?.role === "admin" ? undefined : auth?.keyId || "anonymous"
    );

    c.header("Cache-Control", "public, max-age=60");
    return c.json(stats);
  });

  /** Get trips for a specific date range */
  app.get(
    "/api/journal/dates/:startDate/:endDate",
    requirePermission("journals:read:own" as Permission),
    (c) => {
      const params = validateParams(c, dateRangeParamsSchema);
      if (params instanceof Response) return params;

      const auth = getRbacAuthContext(c);
      const { startDate, endDate } = params;

      // Non-admin users can only see their own trips
      const ownerId = auth?.role === "admin" ? undefined : auth?.keyId || "anonymous";
      const trips = getTrips({ startDate, endDate, limit: 1000, ownerId });

      c.header("Cache-Control", "public, max-age=30");
      return c.json({
        startDate,
        endDate,
        trips,
        count: trips.length,
      });
    }
  );

  /** Get journal summary (recent trips + stats) */
  app.get("/api/journal/summary", requirePermission("journals:read:own" as Permission), (c) => {
    // Validate that no unexpected query parameters are passed
    const query = validateQuery(c, emptyQuerySchema);
    if (query instanceof Response) return query;

    const auth = getRbacAuthContext(c);
    const ownerId = auth?.role === "admin" ? undefined : auth?.keyId || "anonymous";

    const recentTrips = getTrips({ limit: 10, ownerId });
    const stats = calculateCommuteStats("default", ownerId);

    // Non-admin users only get their own trip count
    const totalTrips =
      auth?.role === "admin" ? getTotalTripCount() : getTrips({ limit: 1000000, ownerId }).length;

    c.header("Cache-Control", "public, max-age=30");
    return c.json({
      recentTrips,
      stats,
      totalTrips,
    });
  });

  // -------------------------------------------------------------------------
  // Context-aware switching API (Phase 5) - DISABLED: Feature not used by frontend
  // These endpoints are disabled to reduce security surface area.
  // Uncomment to re-enable context detection functionality.
  // -------------------------------------------------------------------------

  // // Apply same-origin protection to context operations
  // app.use("/api/context/*", requireSameOrigin());
  //
  // /** Get current context and UI hints - scoped to authenticated user */
  // app.get("/api/context", (c) => {
  //   // Validate that no unexpected query parameters are passed
  //   const query = validateQuery(c, emptyQuerySchema);
  //   if (query instanceof Response) return query;
  //
  //   const auth = getRbacAuthContext(c);
  //   const ownerId = auth?.keyId || "anonymous";
  //
  //   // Get context settings (global)
  //   const settings = getContextSettings();
  //
  //   // Admin users get full summary, regular users get scoped data
  //   let currentContext: ReturnType<typeof getCurrentContext>;
  //   let recentTransitions: ReturnType<typeof getContextTransitions>;
  //
  //   if (auth?.role === "admin") {
  //     // Admins see the global context (for system monitoring)
  //     currentContext = getCurrentContext();
  //     recentTransitions = getContextTransitions(10);
  //   } else {
  //     // Regular users get their own context if available, otherwise default
  //     const userContext = getContextByOwner(ownerId);
  //     currentContext = userContext || { ...DEFAULT_CONTEXT };
  //
  //     // Get user's own transitions
  //     const userTransitions = getContextTransitionsForOwner(ownerId, ownerId, 10);
  //     recentTransitions = userTransitions || [];
  //   }
  //
  //   const uiHints = getContextUIHints(currentContext.context);
  //   const label = getContextLabel(currentContext.context);
  //   const icon = getContextIcon(currentContext.context);
  //
  //   c.header("Cache-Control", "public, max-age=15");
  //   return c.json({
  //     current: currentContext,
  //     settings,
  //     uiHints,
  //     label,
  //     icon,
  //     recentTransitions,
  //   });
  // });
  //
  // /** Get context for a specific owner with ownership check */
  // app.get(
  //   "/api/context/owner/:ownerId",
  //   requireOwnershipOrAdmin("context", {
  //     getOwnerId: (c) => {
  //       return c.req.param("ownerId") || "";
  //     },
  //     adminBypass: true,
  //   }),
  //   (c) => {
  //     const ownerId = c.req.param("ownerId");
  //
  //     if (!ownerId) {
  //       return c.json({ error: "Owner ID is required" }, 400);
  //     }
  //
  //     const contextState = getContextByOwner(ownerId);
  //     const transitions = getContextTransitionsForOwner(ownerId, ownerId, 10);
  //
  //     if (!contextState) {
  //       return c.json({ error: "Context not found" }, 404);
  //     }
  //
  //     c.header("Cache-Control", "public, max-age=15");
  //     return c.json({
  //       current: contextState,
  //       settings: getContextSettings(),
  //       uiHints: getContextUIHints(contextState.context),
  //       label: getContextLabel(contextState.context),
  //       icon: getContextIcon(contextState.context),
  //       recentTransitions: transitions || [],
  //     });
  //   }
  // );
  //
  // /** Detect context from request parameters */
  // app.post(
  //   "/api/context/detect",
  //   requireResourceAccess("context", "create"),
  //   requirePermission("predictions:create" as Permission),
  //   async (c) => {
  //     try {
  //       const auth = getRbacAuthContext(c);
  //       const body = await validateBody(c, contextDetectRequestSchema);
  //       if (body instanceof Response) return body;
  //
  //       // Get owner ID from auth context - users can only detect context for themselves
  //       const ownerId = auth?.keyId || "anonymous";
  //
  //       // Explicit ownership check: non-admin users can only detect their own context
  //       if (auth?.role !== "admin" && body.ownerId && body.ownerId !== ownerId) {
  //         return c.json(
  //           {
  //             error: "Access denied: you can only detect context for yourself",
  //           },
  //           403
  //         );
  //       }
  //
  //       const context = detectContextFromRequest(body);
  //
  //       // Store context with ownership - always use authenticated user's ID
  //       const { context: detectedContext } = detectAndUpdateContextWithOwner(
  //         {
  //           nearStation: context.factors.location.nearStation,
  //           nearStationId: context.factors.location.stationId,
  //           distanceToStation: context.factors.location.distance,
  //           tapHistory: body.tapHistory || [],
  //           currentScreen: body.currentScreen || "home",
  //           screenTime: body.screenTime || 0,
  //           recentActions: body.recentActions || [],
  //         },
  //         ownerId
  //       );
  //
  //       c.header("Cache-Control", "no-cache");
  //       return c.json({ context: detectedContext });
  //     } catch (err) {
  //       logger.error("Context detection failed", err as Error);
  //       return c.json(
  //         {
  //           error: "Failed to detect context",
  //           message: err instanceof Error ? err.message : "Unknown error",
  //         },
  //         500
  //       );
  //     }
  //   }
  // );
  //
  // /** Set manual context override */
  // app.post(
  //   "/api/context/override",
  //   requireResourceAccess("context", "update"),
  //   requirePermission("predictions:create" as Permission),
  //   auditLogAccess("context", "update"),
  //   async (c) => {
  //     try {
  //       const auth = getRbacAuthContext(c);
  //       const body = await validateBody(c, contextOverrideRequestSchema);
  //       if (body instanceof Response) return body;
  //
  //       const { context } = body;
  //       const ownerId = auth?.keyId || "anonymous";
  //
  //       // Explicit ownership check: non-admin users can only override their own context
  //       if (auth?.role !== "admin" && body.ownerId && body.ownerId !== ownerId) {
  //         return c.json(
  //           {
  //             error: "Access denied: you can only override your own context",
  //           },
  //           403
  //         );
  //       }
  //
  //       // Store context with ownership - always use authenticated user's ID
  //       const { context: newContext } = detectAndUpdateContextWithOwner(
  //         {
  //           nearStation: false,
  //           tapHistory: [],
  //           currentScreen: "home",
  //           screenTime: 0,
  //           recentActions: [],
  //           manualOverride: context,
  //         },
  //         ownerId
  //       );
  //
  //       c.header("Cache-Control", "no-cache");
  //       return c.json({ success: true, context: newContext });
  //     } catch (error) {
  //       logger.error("Context override failed", error as Error);
  //       return c.json({ error: "Failed to set context override" }, 500);
  //     }
  //   }
  // );
  //
  // /** Clear manual context override - requires authentication */
  // app.post(
  //   "/api/context/clear",
  //   requireResourceAccess("context", "update"),
  //   requirePermission("predictions:create" as Permission),
  //   auditLogAccess("context", "clear"),
  //   async (c) => {
  //     const auth = getRbacAuthContext(c);
  //     const body = await validateBody(c, contextClearRequestSchema);
  //     if (body instanceof Response) return body;
  //
  //     // Get owner ID from auth context
  //     const ownerId = auth?.keyId || "anonymous";
  //
  //     // Explicit ownership check: non-admin users can only clear their own context
  //     if (auth?.role !== "admin" && body.ownerId && body.ownerId !== ownerId) {
  //       return c.json(
  //         {
  //           error: "Access denied: you can only clear your own context",
  //         },
  //         403
  //       );
  //     }
  //
  //     // Clear manual override for authenticated user only (owner-scoped)
  //     const context = clearManualOverrideForOwner(ownerId);
  //
  //     logger.info("Manual context override cleared", { ownerId });
  //
  //     c.header("Cache-Control", "no-cache");
  //     return c.json({ success: true, context });
  //   }
  // );
  //
  // /** Update context settings - admin only */
  // app.patch(
  //   "/api/context/settings",
  //   requireRole("admin"),
  //   requireAdmin(),
  //   auditLogAccess("context", "update"),
  //   async (c) => {
  //     try {
  //       const body = await validateBody(c, contextSettingsUpdateRequestSchema);
  //       if (body instanceof Response) return body;
  //
  //       updateContextSettings(body);
  //
  //       return c.json({ success: true, settings: getContextSettings() });
  //     } catch (error) {
  //       logger.error("Context settings update failed", error as Error);
  //       return c.json({ error: "Failed to update context settings" }, 500);
  //     }
  //   }
  // );

  // -------------------------------------------------------------------------
  // OAuth 2.0 Authentication - DISABLED: Feature not used by frontend
  // These endpoints are disabled to reduce security surface area.
  // Uncomment to re-enable OAuth 2.0 authentication functionality.
  // -------------------------------------------------------------------------

  // // Initialize OAuth providers on startup
  // initializeDefaultProviders();
  //
  // // Clean up expired OAuth states every hour
  // setInterval(
  //   () => {
  //     cleanupExpiredStates();
  //   },
  //   60 * 60 * 1000
  // );
  //
  // /** Get available OAuth providers */
  // app.get("/api/auth/oauth/providers", requirePermission("oauth:authorize" as Permission), (c) => {
  //   const providers = getActiveOAuthProviders();
  //
  //   // Return only safe provider information (no secrets)
  //   const safeProviders = providers.map((p) => ({
  //     providerId: p.providerId,
  //     displayName: p.displayName,
  //     active: p.active,
  //   }));
  //
  //   c.header("Cache-Control", "public, max-age=300");
  //   return c.json({ providers: safeProviders });
  // });
  //
  // /** Initiate OAuth authorization flow */
  // app.get(
  //   "/api/auth/oauth/authorize/:providerId",
  //   requirePermission("oauth:authorize" as Permission),
  //   async (c) => {
  //     const providerId = c.req.param("providerId");
  //     const redirectUrl = c.req.query("redirect_url");
  //
  //     if (!providerId) {
  //       return c.json({ error: "Provider ID is required" }, 400);
  //     }
  //
  //     const result = await createAuthorizationUrl(providerId, redirectUrl);
  //
  //     if ("error" in result) {
  //       return c.json({ error: result.error }, 400);
  //     }
  //
  //     // Return authorization URL and state
  //     return c.json({
  //       authorizationUrl: result.url,
  //       stateId: result.stateId,
  //     });
  //   }
  // );
  //
  // /** OAuth callback endpoint */
  // app.get("/api/auth/oauth/callback/:providerId", async (c) => {
  //   const providerId = c.req.param("providerId");
  //   const state = c.req.query("state");
  //   const code = c.req.query("code");
  //   const error = c.req.query("error");
  //   const errorDescription = c.req.query("error_description");
  //
  //   // Handle OAuth errors from provider
  //   if (error) {
  //     logger.warn("OAuth callback error", {
  //       providerId,
  //       error,
  //       errorDescription,
  //     });
  //     return c.json(
  //       {
  //         success: false,
  //         error: error || "OAuth authorization failed",
  //         errorDescription,
  //       },
  //       400
  //     );
  //   }
  //
  //   // Validate required parameters
  //   if (!state || !code) {
  //     return c.json(
  //       {
  //         success: false,
  //         error: "Missing required parameters: state and code",
  //       },
  //       400
  //     );
  //   }
  //
  //   // Get client info for logging and session creation
  //   const clientIp =
  //     c.req.header("x-forwarded-for")?.split(",")[0] ??
  //     c.req.header("cf-connecting-ip") ??
  //     "unknown";
  //   const userAgent = c.req.header("user-agent");
  //
  //   // Handle the callback
  //   const result = await handleOAuthCallback(
  //     state,
  //     code,
  //     clientIp,
  //     userAgent,
  //     async (keyId, ip, ua, metadata) => {
  //       // Create session with OAuth type
  //       const sessionResult = await createSession(keyId, ip, ua, metadata, {
  //         type: "oauth",
  //         ipBinding: true,
  //         createRefreshToken: true,
  //       });
  //
  //       if ("sessionId" in sessionResult) {
  //         return {
  //           sessionId: sessionResult.sessionId,
  //           csrfToken: getCsrfToken(c) || sessionResult.refreshToken || "",
  //         };
  //       }
  //
  //       return { error: "Failed to create session" };
  //     }
  //   );
  //
  //   if (!result.success) {
  //     return c.json(
  //       {
  //         success: false,
  //         error: result.error,
  //         errorDescription: result.errorDescription,
  //       },
  //       400
  //     );
  //   }
  //
  //   // Set session cookie
  //   if (result.sessionId) {
  //     const isSecure = process.env["NODE_ENV"] === "production";
  //     c.header(
  //       "Set-Cookie",
  //       `session_id=${result.sessionId}; Path=/; SameSite=Lax; ${isSecure ? "Secure; " : ""}HttpOnly; Max-Age=86400`
  //     );
  //   }
  //
  //   // Return success with profile (excluding sensitive data)
  //   return c.json({
  //     success: true,
  //     profile: {
  //       providerId: result.profile?.providerId,
  //       email: result.profile?.email,
  //       name: result.profile?.name,
  //       picture: result.profile?.picture,
  //     },
  //   });
  // });

  // -------------------------------------------------------------------------
  // Multi-Factor Authentication (MFA) - TOTP - DISABLED: Feature not used by frontend
  // These endpoints are disabled to reduce security surface area.
  // Uncomment to re-enable MFA functionality.
  // -------------------------------------------------------------------------

  // // Apply same-origin protection to all MFA operations
  // app.use("/api/auth/mfa/*", requireSameOrigin());
  //
  // /** Get MFA status for the current session */
  // app.get("/api/auth/mfa/status", requirePermission("mfa:verify" as Permission), async (c) => {
  //   const auth = getAuthContext(c);
  //
  //   if (!auth) {
  //     return c.json({ error: "Authentication required" }, 401);
  //   }
  //
  //   // Check if MFA is configured for this user
  //   const totpEnabled = true; // In production, check database for TOTP config
  //   const mfaVerified = auth.mfaVerified ?? false;
  //
  //   return c.json({
  //     enabled: totpEnabled,
  //     verified: mfaVerified,
  //   });
  // });
  //
  // /** Initiate TOTP setup - returns secret and QR code URL */
  // app.post("/api/auth/mfa/setup", requirePermission("mfa:setup" as Permission), async (c) => {
  //   const auth = getAuthContext(c);
  //
  //   if (!auth) {
  //     return c.json({ error: "Authentication required" }, 401);
  //   }
  //
  //   const result = setupTotp(auth.keyId);
  //
  //   logger.info("TOTP setup initiated", { keyId: auth.keyId });
  //
  //   return c.json({
  //     secret: result.secret,
  //     backupCodes: result.backupCodes,
  //     qrCodeUrl: result.qrCodeUrl,
  //     message: "Scan the QR code with your authenticator app, then verify a code to enable MFA",
  //   });
  // });
  //
  // /** Enable TOTP after initial verification */
  // app.post("/api/auth/mfa/enable", requirePermission("mfa:verify" as Permission), async (c) => {
  //   const auth = getAuthContext(c);
  //
  //   if (!auth) {
  //     return c.json({ error: "Authentication required" }, 401);
  //   }
  //
  //   try {
  //     const body = await c.req.json();
  //     const code = body.code;
  //
  //     if (!code || typeof code !== "string") {
  //       return c.json({ error: "TOTP code is required" }, 400);
  //     }
  //
  //     // Verify the code before enabling
  //     const result = await verifyTotpCode(auth.keyId, code);
  //
  //     if (!result.valid) {
  //       return c.json({ error: "Invalid TOTP code" }, 400);
  //     }
  //
  //     // Enable TOTP
  //     enableTotp(auth.keyId);
  //
  //     logger.info("TOTP enabled", { keyId: auth.keyId });
  //
  //     return c.json({
  //       success: true,
  //       message: "MFA enabled successfully",
  //       remainingBackupCodes: result.remainingBackupCodes,
  //     });
  //   } catch (error) {
  //     logger.error("TOTP enable failed", error as Error);
  //     return c.json({ error: "Failed to enable MFA" }, 500);
  //   }
  // });
  //
  // /** Disable TOTP for the current user */
  // app.post("/api/auth/mfa/disable", requirePermission("mfa:disable" as Permission), async (c) => {
  //   const auth = getAuthContext(c);
  //
  //   if (!auth) {
  //     return c.json({ error: "Authentication required" }, 401);
  //   }
  //
  //   const disabled = disableTotp(auth.keyId);
  //
  //   if (!disabled) {
  //     return c.json({ error: "MFA not configured" }, 400);
  //   }
  //
  //   logger.info("TOTP disabled", { keyId: auth.keyId });
  //
  //   return c.json({
  //     success: true,
  //     message: "MFA disabled successfully",
  //   });
  // });
  //
  // /** Verify MFA for a session (after login, before sensitive operations) */
  // app.post("/api/auth/mfa/verify", requirePermission("mfa:verify" as Permission), async (c) => {
  //   const auth = getAuthContext(c);
  //
  //   if (!auth) {
  //     return c.json({ error: "Authentication required" }, 401);
  //   }
  //
  //   if (!auth.sessionId) {
  //     return c.json({ error: "Session required" }, 400);
  //   }
  //
  //   try {
  //     const body = await c.req.json();
  //     const code = body.code;
  //
  //     if (!code || typeof code !== "string") {
  //       return c.json({ error: "TOTP code is required" }, 400);
  //     }
  //
  //     const result = await verifyMfaForSession(auth.sessionId, code);
  //
  //     if (!result.valid) {
  //       return c.json({ error: "Invalid TOTP code" }, 400);
  //     }
  //
  //     // Set new session cookie
  //     if (result.newSessionId) {
  //       const isSecure = process.env["NODE_ENV"] === "production";
  //       c.header(
  //         "Set-Cookie",
  //         `session_id=${result.newSessionId}; Path=/; SameSite=Lax; ${isSecure ? "Secure; " : ""}HttpOnly; Max-Age=86400`
  //       );
  //     }
  //
  //     logger.info("MFA verified for session", { keyId: auth.keyId });
  //
  //     return c.json({
  //       success: true,
  //       message: "MFA verified successfully",
  //     });
  //   } catch (error) {
  //     logger.error("MFA verification failed", error as Error);
  //     return c.json({ error: "Failed to verify MFA" }, 500);
  //   }
  // });

  // -------------------------------------------------------------------------
  // Session Management - DISABLED: Feature not used by frontend
  // These endpoints are disabled to reduce security surface area.
  // Uncomment to re-enable session management functionality.
  // -------------------------------------------------------------------------

  // // Apply same-origin protection to session operations
  // app.use("/api/auth/session/*", requireSameOrigin());
  //
  // /** Get current session info */
  // app.get("/api/auth/session", (c) => {
  //   const auth = getAuthContext(c);
  //
  //   if (!auth) {
  //     return c.json({ authenticated: false });
  //   }
  //
  //   return c.json({
  //     authenticated: true,
  //     keyId: auth.keyId,
  //     scope: auth.scope,
  //     authMethod: auth.authMethod,
  //     oauthProvider: auth.oauthProvider,
  //     mfaVerified: auth.mfaVerified,
  //   });
  // });
  //
  // /** Refresh session using refresh token */
  // app.post("/api/auth/session/refresh", async (c) => {
  //   const auth = getAuthContext(c);
  //
  //   if (!auth) {
  //     return c.json({ error: "Authentication required" }, 401);
  //   }
  //
  //   try {
  //     const body = await c.req.json();
  //     const refreshToken = body.refreshToken;
  //
  //     if (!refreshToken || typeof refreshToken !== "string") {
  //       return c.json({ error: "Refresh token is required" }, 400);
  //     }
  //
  //     const clientIp =
  //       c.req.header("x-forwarded-for")?.split(",")[0] ??
  //       c.req.header("cf-connecting-ip") ??
  //       "unknown";
  //
  //     const result = await refreshSession(refreshToken, clientIp);
  //
  //     if (!result) {
  //       return c.json({ error: "Invalid or expired refresh token" }, 401);
  //     }
  //
  //     // Set new session cookie
  //     const isSecure = process.env["NODE_ENV"] === "production";
  //     c.header(
  //       "Set-Cookie",
  //       `session_id=${result.sessionId}; Path=/; SameSite=Lax; ${isSecure ? "Secure; " : ""}HttpOnly; Max-Age=86400`
  //     );
  //
  //     logger.info("Session refreshed", { keyId: auth.keyId });
  //
  //     return c.json({
  //       success: true,
  //       sessionId: result.sessionId,
  //       newRefreshToken: result.newRefreshToken,
  //     });
  //   } catch (error) {
  //     logger.error("Session refresh failed", error as Error);
  //     return c.json({ error: "Failed to refresh session" }, 500);
  //   }
  // });
  //
  // /** Revoke current session (logout) */
  // app.post("/api/auth/session/revoke", (c) => {
  //   const auth = getAuthContext(c);
  //
  //   if (!auth || !auth.sessionId) {
  //     return c.json({ error: "No active session" }, 400);
  //   }
  //
  //   const clientIp =
  //     c.req.header("x-forwarded-for")?.split(",")[0] ??
  //     c.req.header("cf-connecting-ip") ??
  //     "unknown";
  //
  //   const revoked = revokeSession(auth.sessionId, clientIp);
  //
  //   if (!revoked) {
  //     return c.json({ error: "Failed to revoke session" }, 500);
  //   }
  //
  //   // Clear session cookie
  //   const isSecure = process.env["NODE_ENV"] === "production";
  //   c.header(
  //     "Set-Cookie",
  //     `session_id=; Path=/; SameSite=Lax; ${isSecure ? "Secure; " : ""}HttpOnly; Max-Age=0`
  //   );
  //
  //   logger.info("Session revoked", { keyId: auth.keyId });
  //
  //   return c.json({
  //     success: true,
  //     message: "Session revoked successfully",
  //   });
  // });

  // -------------------------------------------------------------------------
  // Password Reset & Management - DISABLED: Feature not used by frontend
  // These endpoints are disabled to reduce security surface area.
  // Uncomment to re-enable password management functionality.
  // -------------------------------------------------------------------------

  // // Apply same-origin protection to password reset operations
  // app.use("/api/auth/password/*", requireSameOrigin());
  //
  // /** Get password policy requirements */
  // app.get("/api/auth/password/policy", (c) => {
  //   // Validate that no unexpected query parameters are passed
  //   const query = validateQuery(c, emptyQuerySchema);
  //   if (query instanceof Response) return query;
  //
  //   const policy = getPasswordPolicyDescription();
  //
  //   c.header("Cache-Control", "public, max-age=300");
  //   return c.json(policy);
  // });
  //
  // /** Initiate password reset request */
  // app.post(
  //   "/api/auth/password/reset",
  //   // Apply strict rate limiting (5 requests per minute)
  //   authRateLimit("strict", {
  //     addHeaders: true,
  //   }),
  //   // Require CAPTCHA after rate limit violations
  //   requireCaptcha({
  //     alwaysRequired: false,
  //   }),
  //   auditLogAccess("password", "reset_request"),
  //   async (c) => {
  //     try {
  //       const body = await validateBody(c, passwordResetRequestSchema);
  //       if (body instanceof Response) return body;
  //
  //       const { email } = body;
  //
  //       // Get client IP for rate limiting and security logging
  //       const clientIp =
  //         c.req.header("x-forwarded-for")?.split(",")[0] ??
  //         c.req.header("cf-connecting-ip") ??
  //         "unknown";
  //
  //       // In production, you would:
  //       // 1. Look up the user by email (in a database)
  //       // 2. Generate and store a reset token
  //       // 3. Send an email with the reset link
  //       // For now, we'll generate a token and return it (for testing)
  //
  //       // Note: In a real implementation, email would be used as keyId
  //       // Here we use email as keyId for demonstration
  //       const keyId = email;
  //
  //       // Invalidate any existing reset tokens for this user
  //       invalidateResetTokensForKey(keyId);
  //
  //       // Generate new reset token
  //       const resetData = await generatePasswordResetToken(keyId, clientIp);
  //
  //       // In production, send email with reset link
  //       // The email would contain: tokenId and token (as query params)
  //       // For now, return the token (in production, NEVER return the token)
  //
  //       logger.info("Password reset requested", { keyId, clientIp });
  //
  //       // Return success (in production, don't include token in response)
  //       return c.json({
  //         success: true,
  //         message: "If an account exists with this email, a password reset link has been sent",
  //         // Note: In production, remove these fields - only send via email
  //         tokenId: resetData.tokenId,
  //         token: resetData.token,
  //         expiresAt: new Date(resetData.expiresAt).toISOString(),
  //       });
  //     } catch (error) {
  //       logger.error("Password reset request failed", error as Error);
  //       return c.json(
  //         {
  //           error: "Failed to process password reset request",
  //           message: error instanceof Error ? error.message : "Unknown error",
  //         },
  //         500
  //       );
  //     }
  //   }
  // );
  //
  // /** Confirm password reset with token */
  // app.post(
  //   "/api/auth/password/reset/confirm",
  //   // Apply strict rate limiting (5 requests per minute)
  //   authRateLimit("strict", {
  //     addHeaders: true,
  //   }),
  //   // Require CAPTCHA after rate limit violations
  //   requireCaptcha({
  //     alwaysRequired: false,
  //   }),
  //   auditLogAccess("password", "reset_confirm"),
  //   async (c) => {
  //     try {
  //       const body = await validateBody(c, passwordResetConfirmSchema);
  //       if (body instanceof Response) return body;
  //
  //       const { tokenId, token, newPassword } = body;
  //
  //       const clientIp =
  //         c.req.header("x-forwarded-for")?.split(",")[0] ??
  //         c.req.header("cf-connecting-ip") ??
  //         "unknown";
  //
  //       // Validate the reset token
  //       const keyId = await validatePasswordResetToken(tokenId, token, clientIp);
  //
  //       if (!keyId) {
  //         logger.warn("Invalid password reset token", { tokenId, clientIp });
  //         return c.json(
  //           {
  //             error: "Invalid or expired reset token",
  //             message:
  //               "The reset link is invalid or has expired. Please request a new password reset.",
  //           },
  //           400
  //         );
  //       }
  //
  //       // Validate the new password against policy
  //       const passwordValidation = await validatePassword(newPassword, {}, keyId);
  //
  //       if (!passwordValidation.valid) {
  //         return c.json(
  //           {
  //             error: "Password does not meet security requirements",
  //             errors: passwordValidation.errors,
  //           },
  //           400
  //         );
  //       }
  //
  //       // Hash the new password
  //       const passwordHash = await hashPassword(newPassword);
  //
  //       // In production, update the password in the database
  //       // For now, just log the password hash (in production, NEVER log passwords)
  //       logger.info("Password reset confirmed", { keyId, clientIp });
  //
  //       // Consume the reset token (single-use)
  //       consumePasswordResetToken(tokenId);
  //
  //       // Invalidate all other reset tokens for this user
  //       invalidateResetTokensForKey(keyId);
  //
  //       // Invalidate all existing sessions for security
  //       // (force re-login with new password)
  //       // In production, this would be: invalidateAllSessionsForKey(keyId);
  //
  //       return c.json({
  //         success: true,
  //         message: "Password has been reset successfully. Please log in with your new password.",
  //       });
  //     } catch (error) {
  //       logger.error("Password reset confirmation failed", error as Error);
  //       return c.json(
  //         {
  //           error: "Failed to reset password",
  //           message: error instanceof Error ? error.message : "Unknown error",
  //         },
  //         500
  //       );
  //     }
  //   }
  // );
  //
  // /** Change password for authenticated user */
  // app.post(
  //   "/api/auth/password/change",
  //   requireResourceAccess("password", "update"),
  //   auditLogAccess("password", "change"),
  //   async (c) => {
  //     try {
  //       const auth = getRbacAuthContext(c);
  //
  //       if (!auth) {
  //         return c.json({ error: "Authentication required" }, 401);
  //       }
  //
  //       const body = await validateBody(c, passwordChangeSchema);
  //       if (body instanceof Response) return body;
  //
  //       const { currentPassword, newPassword } = body;
  //
  //       // In production, verify current password against stored hash
  //       // For now, skip current password verification (demo mode)
  //
  //       // Validate the new password against policy
  //       const passwordValidation = await validatePassword(newPassword, {}, auth.keyId);
  //
  //       if (!passwordValidation.valid) {
  //         return c.json(
  //           {
  //             error: "Password does not meet security requirements",
  //             errors: passwordValidation.errors,
  //           },
  //           400
  //         );
  //       }
  //
  //       // Hash the new password
  //       const passwordHash = await hashPassword(newPassword);
  //
  //       // In production, update the password in the database
  //       logger.info("Password changed", { keyId: auth.keyId });
  //
  //       return c.json({
  //         success: true,
  //         message: "Password has been changed successfully",
  //       });
  //     } catch (error) {
  //       logger.error("Password change failed", error as Error);
  //       return c.json(
  //         {
  //           error: "Failed to change password",
  //           message: error instanceof Error ? error.message : "Unknown error",
  //         },
  //         500
  //       );
  //     }
  //   }
  // );

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
