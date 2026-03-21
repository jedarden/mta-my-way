/**
 * Hono application: API routes + static asset serving.
 *
 * Routes:
 *   GET /api/health                — per-feed status, circuit-breaker state
 *   GET /api/arrivals/:stationId   — real-time arrivals for one station
 *   GET /api/stations              — full GTFS static station list
 *   GET /api/stations/:id          — single station metadata
 *   GET /*                         — serve React PWA from packages/web/dist
 */

import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { CACHE_TTLS } from "@mta-my-way/shared";
import type { StationIndex } from "@mta-my-way/shared";
import { getArrivals, getFeedStates } from "./cache.js";

/**
 * @param stations       Pre-loaded GTFS static station index
 * @param webDistPath    Absolute path to the built React PWA (packages/web/dist)
 */
export function createApp(stations: StationIndex, webDistPath: string): Hono {
  const app = new Hono();

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
    c.header(
      "Cache-Control",
      `public, max-age=${CACHE_TTLS.gtfsStatic}, stale-while-revalidate=${CACHE_TTLS.gtfsStaticStale}`
    );
    return c.json(Object.values(stations));
  });

  app.get("/api/stations/:id", (c) => {
    const id = c.req.param("id");
    const station = stations[id];

    if (!station) {
      return c.json({ error: "Station not found" }, 404);
    }

    c.header(
      "Cache-Control",
      `public, max-age=${CACHE_TTLS.gtfsStatic}, stale-while-revalidate=${CACHE_TTLS.gtfsStaticStale}`
    );
    return c.json(station);
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

  return app;
}
