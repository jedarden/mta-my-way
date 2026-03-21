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
 *   GET /*                         — serve React PWA from packages/web/dist
 */

import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_TTLS } from "@mta-my-way/shared";
import type { StationIndex, RouteIndex, ComplexIndex, Station, StationComplex } from "@mta-my-way/shared";
import { getArrivals, getFeedStates } from "./cache.js";

/** Cache header for static GTFS data */
const STATIC_CACHE_HEADER = `public, max-age=${CACHE_TTLS.gtfsStatic}, stale-while-revalidate=${CACHE_TTLS.gtfsStaticStale}`;

/**
 * Common abbreviation mappings for station search
 */
const ABBREVIATIONS: Record<string, string> = {
  "sq": "square",
  "st": "street",
  "ave": "avenue",
  "av": "avenue",
  "blvd": "boulevard",
  "pkwy": "parkway",
  "rd": "road",
  "dr": "drive",
  "ln": "lane",
  "ct": "court",
  "pl": "place",
  "hwy": "highway",
  "expwy": "expressway",
  "bway": "broadway",
  "'way": "way",
};

/**
 * Expand abbreviations in a search term
 */
function expandAbbreviations(term: string): string {
  const lower = term.toLowerCase();
  // Check for direct abbreviation match
  if (ABBREVIATIONS[lower]) {
    return ABBREVIATIONS[lower];
  }
  // Replace abbreviations within the term
  let expanded = term;
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, "gi");
    expanded = expanded.replace(regex, full);
  }
  return expanded;
}

/**
 * Normalize a string for search matching
 */
function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ")        // Normalize whitespace
    .trim();
}

/**
 * Check if a station matches a search query
 * Matches against: name, lines, and expanded abbreviations
 */
function stationMatchesQuery(station: Station, normalizedQuery: string, originalQuery: string): boolean {
  const normalizedName = normalizeForSearch(station.name);
  const expandedQuery = normalizeForSearch(expandAbbreviations(originalQuery));

  // Match against station name (original or expanded query)
  if (normalizedName.includes(normalizedQuery) || normalizedName.includes(expandedQuery)) {
    return true;
  }

  // Match against lines (e.g., searching "1" or "A")
  const upperQuery = originalQuery.toUpperCase();
  if (station.lines.some(line => line === upperQuery)) {
    return true;
  }

  // Match expanded station name against expanded query
  const expandedName = normalizeForSearch(expandAbbreviations(station.name));
  if (expandedName.includes(expandedQuery)) {
    return true;
  }

  return false;
}

/**
 * Score a search result for ranking
 * Higher score = better match
 */
function scoreSearchResult(station: Station, query: string): number {
  const normalizedQuery = normalizeForSearch(query);
  const normalizedName = normalizeForSearch(station.name);
  const upperQuery = query.toUpperCase();

  // Exact line match gets highest priority
  if (station.lines.some(line => line === upperQuery)) {
    return 1000;
  }

  // Name starts with query - high priority
  if (normalizedName.startsWith(normalizedQuery)) {
    return 100;
  }

  // Name contains query as a word
  const words = normalizedName.split(/\s+/);
  if (words.some(word => word.startsWith(normalizedQuery))) {
    return 50;
  }

  // Name contains query anywhere
  if (normalizedName.includes(normalizedQuery)) {
    return 10;
  }

  return 1;
}

/**
 * Build a station-to-complex lookup map
 */
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
 * @param webDistPath      Absolute path to the built React PWA (packages/web/dist)
 */
export function createApp(
  stations: StationIndex,
  routes: RouteIndex,
  complexes: ComplexIndex,
  webDistPath: string
): Hono {
  const app = new Hono();

  // Build station-to-complex lookup for efficient complex expansion
  const stationToComplex = buildStationToComplexMap(complexes);

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
        lastSuccessAt: f.lastSuccessAt
          ? new Date(f.lastSuccessAt).toISOString()
          : null,
        lastPollAt: f.lastPollAt
          ? new Date(f.lastPollAt).toISOString()
          : null,
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

    // Filter and score matching stations
    const results = Object.values(stations)
      .filter(station => stationMatchesQuery(station, normalizedQuery, trimmedQuery))
      .map(station => ({
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

    // Check if this station is part of a complex
    const complex = stationToComplex.get(id);

    // Build response with complex expansion
    const response: Record<string, unknown> = {
      ...station,
      complexStations: [] as Station[],
      complexLines: station.lines,
    };

    if (complex) {
      // Get all stations in this complex
      const complexStations = complex.stations
        .map(sid => stations[sid])
        .filter((s): s is Station => s !== undefined);

      // Collect all unique lines across the complex
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
  // Static GTFS data (complexes, transfers, travel times)
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
  // Static PWA assets (must come last; catches /* after /api/* routes)
  // -------------------------------------------------------------------------
  app.use(
    "/*",
    serveStatic({
      root: webDistPath,
    })
  );

  // SPA fallback: serve index.html for any non-API route that didn't match a
  // static file (so React Router can handle client-side routing)
  app.get("*", async (c) => {
    const html = await readFile(join(webDistPath, "index.html"), "utf8").catch(
      () => null
    );
    if (!html) return c.notFound();
    return c.html(html);
  });

  return app;
}
