/**
 * MTA My Way server entry point.
 *
 * Startup sequence:
 *   1. Load GTFS static stations.json
 *   2. Create Hono app
 *   3. Initialise and start the feed poller (first poll fires immediately)
 *   4. Start the HTTP server
 */

import { serve } from "@hono/node-server";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { PACKAGE_VERSION } from "@mta-my-way/shared";
import type { StationIndex } from "@mta-my-way/shared";
import { createApp } from "./app.js";
import { initPoller, startPoller } from "./poller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// packages/server/data/ — same relative depth from both src/ and dist/
const DATA_DIR = join(__dirname, "..", "data");

// packages/web/dist/ — two levels up from src/ or dist/, then into sibling
const WEB_DIST = resolve(__dirname, "..", "..", "web", "dist");

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

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

  // Load GTFS static station data
  let stations: StationIndex;
  try {
    const raw = await readFile(join(DATA_DIR, "stations.json"), "utf8");
    stations = JSON.parse(raw) as StationIndex;
    console.log(
      JSON.stringify({
        event: "stations_loaded",
        timestamp: new Date().toISOString(),
        count: Object.keys(stations).length,
      })
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "stations_load_error",
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        hint: "Run: npm run process-gtfs --workspace=packages/server",
      })
    );
    process.exit(1);
  }

  // Hono app
  const app = createApp(stations, WEB_DIST);

  // Feed poller (also triggers immediate first poll)
  initPoller(stations);
  startPoller();

  // HTTP server
  serve(
    { fetch: app.fetch, port: PORT },
    (info) => {
      console.log(
        JSON.stringify({
          event: "server_started",
          timestamp: new Date().toISOString(),
          port: info.port,
          pid: process.pid,
        })
      );
    }
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
