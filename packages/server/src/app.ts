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
 *   GET /*                         — serve React PWA from packages/web/dist
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
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
import { Hono } from "hono";
import { getArrivals, getFeedStates } from "./cache.js";
import { getAllAlerts, getAlertsForLine, getAlertsStatus } from "./alerts-poller.js";
import { createTransferEngine } from "./transfer/index.js";

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
export function createApp(
  stations: StationIndex,
  routes: RouteIndex,
  complexes: ComplexIndex,
  transfers: Record<string, TransferConnection[]>,
  webDistPath: string
): Hono {
  const app = new Hono();

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
    const allOk = feedStates.every(
      (f) => f.circuitOpenAt === null && f.lastSuccessAt !== null && !f.isStale
    );

    return c.json({
      status: allOk ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
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
      })),
    });
  });

  // -------------------------------------------------------------------------
  // Real-time arrivals
  // -------------------------------------------------------------------------
  app.get("/api/arrivals/:stationId", (c) => {
    const stationId = c.req.param("stationId");
    const arrivals = getArrivals(stationId);

    if (!arrivals) {
      return c.json({ error: "Station not found or no data yet" }, 404);
    }

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json(arrivals);
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
      const body = await c.req.json<{
        originId: string;
        destinationId: string;
        preferredLines?: string[];
        commuteId?: string;
      }>();

      const { originId, destinationId, preferredLines = [], commuteId = "default" } = body;

      if (!originId || !destinationId) {
        return c.json({ error: "originId and destinationId are required" }, 400);
      }

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
        commuteId
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
    const alerts = getAllAlerts();
    const status = getAlertsStatus();

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json({
      alerts,
      meta: {
        count: alerts.length,
        lastUpdatedAt: status.lastSuccessAt,
        matchRate: status.matchRate,
        consecutiveFailures: status.consecutiveFailures,
        circuitOpen: status.circuitOpen,
      },
    });
  });

  app.get("/api/alerts/:lineId", (c) => {
    const lineId = c.req.param("lineId").toUpperCase();
    const alerts = getAlertsForLine(lineId);

    c.header("Cache-Control", `public, max-age=${CACHE_TTLS.api}`);
    return c.json({ alerts, lineId });
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

  app.get("*", async (c) => {
    const html = await readFile(join(webDistPath, "index.html"), "utf8").catch(() => null);
    if (!html) return c.notFound();
    return c.html(html);
  });

  return app;
}
