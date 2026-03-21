/**
 * MTA My Way server entry point.
 *
 * Startup sequence:
 *   1. Load GTFS static data (stations, routes, complexes)
 *   2. Create Hono app
 *   3. Initialise and start the feed poller (first poll fires immediately)
 *   4. Start the HTTP server
 */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { PACKAGE_VERSION } from "@mta-my-way/shared";
import type { ComplexIndex, RouteIndex, StationIndex } from "@mta-my-way/shared";
import { createApp } from "./app.js";
import { initPoller, startPoller } from "./poller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// packages/server/data/ — same relative depth from both src/ and dist/
const DATA_DIR = join(__dirname, "..", "data");

// packages/web/dist/ — two levels up from src/ or dist/, then into sibling
const WEB_DIST = resolve(__dirname, "..", "..", "web", "dist");

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

/**
 * Load a JSON data file from the data directory
 */
async function loadJsonFile<T>(filename: string): Promise<T> {
  const raw = await readFile(join(DATA_DIR, filename), "utf8");
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify({
      event: "startup",
      timestamp: new Date().toISOString(),
      version: PACKAGE_VERSION,
      port: PORT,
      data_dir: DATA_DIR,
      web_dist: WEB_DIST,
    })
  );

  // Load GTFS static data in parallel
  let stations: StationIndex;
  let routes: RouteIndex;
  let complexes: ComplexIndex;

  try {
    [stations, routes, complexes] = await Promise.all([
      loadJsonFile<StationIndex>("stations.json"),
      loadJsonFile<RouteIndex>("routes.json"),
      loadJsonFile<ComplexIndex>("complexes.json"),
    ]);

    console.log(
      JSON.stringify({
        event: "static_data_loaded",
        timestamp: new Date().toISOString(),
        stations: Object.keys(stations).length,
        routes: Object.keys(routes).length,
        complexes: Object.keys(complexes).length,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "static_data_load_error",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        hint: "Run: npm run process-gtfs --workspace=packages/server",
      })
    );
    process.exit(1);
  }

  // Hono app
  const app = createApp(stations, routes, complexes, WEB_DIST);

  // Feed poller (also triggers immediate first poll)
  initPoller(stations);
  startPoller();

  // HTTP server
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(
      JSON.stringify({
        event: "server_started",
        timestamp: new Date().toISOString(),
        port: info.port,
        pid: process.pid,
      })
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
