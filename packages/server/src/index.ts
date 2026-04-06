/**
 * MTA My Way server entry point.
 *
 * Startup sequence:
 *   1. Load GTFS static data (stations, routes, complexes, transfers, travel times)
 *   2. Create Hono app (also builds TransferEngine internally)
 *   3. Initialise push notification subsystem (SQLite DB, VAPID keys, pipeline)
 *   4. Initialise and start the feed poller (first poll fires immediately)
 *   5. Start the HTTP server
 */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { PACKAGE_VERSION } from "@mta-my-way/shared";
import type {
  ComplexIndex,
  RouteIndex,
  StationIndex,
  TransferConnection,
} from "@mta-my-way/shared";
import { startAlertsPoller } from "./alerts-poller.js";
import { createApp } from "./app.js";
import { initDelayDetector } from "./delay-detector.js";
import { initDelayPredictor } from "./delay-predictor.js";
import { initEquipmentPoller, startEquipmentPoller } from "./equipment-poller.js";
import { initPoller, startPoller } from "./poller.js";
import { startBriefingScheduler } from "./push/briefing.js";
import { startPushPipeline } from "./push/index.js";
import { initPushDatabase } from "./push/subscriptions.js";
import { configureWebPush, loadOrGenerateVapidKeys } from "./push/vapid.js";
import { loadTravelTimes } from "./transfer/travel-times.js";

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
  let transfers: Record<string, TransferConnection[]>;

  try {
    [stations, routes, complexes, transfers] = await Promise.all([
      loadJsonFile<StationIndex>("stations.json"),
      loadJsonFile<RouteIndex>("routes.json"),
      loadJsonFile<ComplexIndex>("complexes.json"),
      loadJsonFile<Record<string, TransferConnection[]>>("transfers.json"),
    ]);

    // Load travel times into module cache before createApp builds the TransferEngine
    const travelTimes = await loadTravelTimes(join(DATA_DIR, "travel-times.json"));

    // Initialize delay detector for predictive alerts
    initDelayDetector(travelTimes, routes, stations);

    // Initialize delay predictor for historical pattern analysis
    initDelayPredictor(travelTimes, stations);

    console.log(
      JSON.stringify({
        event: "static_data_loaded",
        timestamp: new Date().toISOString(),
        stations: Object.keys(stations).length,
        routes: Object.keys(routes).length,
        complexes: Object.keys(complexes).length,
        transfers: Object.keys(transfers).length,
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

  // Hono app (builds TransferEngine internally from loaded data)
  const app = createApp(stations, routes, complexes, transfers, WEB_DIST);

  // Push notification subsystem
  const pushDbPath = process.env["PUSH_DB_PATH"] ?? join(DATA_DIR, "subscriptions.db");
  initPushDatabase(pushDbPath);
  const vapidKeys = await loadOrGenerateVapidKeys(DATA_DIR);
  configureWebPush(vapidKeys);
  startPushPipeline();
  startBriefingScheduler();

  // Feed poller (also triggers immediate first poll)
  initPoller(stations, routes);
  startPoller();
  startAlertsPoller();

  // Equipment poller (elevator/escalator outages)
  initEquipmentPoller(stations);
  startEquipmentPoller();

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
