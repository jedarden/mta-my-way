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
import { initContextService } from "./context-service.js";
import { initDelayDetector } from "./delay-detector.js";
import { initDelayPredictor } from "./delay-predictor.js";
import { initEquipmentPoller, startEquipmentPoller } from "./equipment-poller.js";
import { initPoller, startPoller } from "./poller.js";
import { startBriefingScheduler } from "./push/briefing.js";
import { startPushPipeline } from "./push/index.js";
import { getPushDatabase, initPushDatabase } from "./push/subscriptions.js";
import { configureWebPush, loadOrGenerateVapidKeys } from "./push/vapid.js";
import { loadTravelTimes } from "./transfer/travel-times.js";
import { initTripTracking } from "./trip-tracking.js";
import { setRateLimiterTestMode } from "./middleware/rate-limiter.js";
import { runMigrations } from "./migration/index.js";
import { logger, createLogger, LogLevel } from "./observability/logger.js";

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
  // Enable test mode if environment variable is set (for E2E tests)
  const testMode = process.env["TEST_MODE"] === "true";
  if (testMode) {
    setRateLimiterTestMode(true);
    logger.info("Test mode enabled");
  }

  logger.info("Server startup", {
    version: PACKAGE_VERSION,
    port: PORT,
    data_dir: DATA_DIR,
    web_dist: WEB_DIST,
  });

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

    logger.info("Static data loaded", {
      stations: Object.keys(stations).length,
      routes: Object.keys(routes).length,
      complexes: Object.keys(complexes).length,
      transfers: Object.keys(transfers).length,
    });
  } catch (err) {
    logger.error("Failed to load static data", err as Error, {
      hint: "Run: npm run process-gtfs --workspace=packages/server",
    });
    process.exit(1);
  }

  // Hono app (builds TransferEngine internally from loaded data)
  const app = createApp(stations, routes, complexes, transfers, WEB_DIST);

  // Push notification subsystem
  const pushDbPath = process.env["PUSH_DB_PATH"] ?? join(DATA_DIR, "subscriptions.db");
  initPushDatabase(pushDbPath);
  const pushDb = getPushDatabase();

  // Run database migrations
  try {
    const results = await runMigrations(pushDb);
    const applied = results.filter((r) => r.applied);
    if (applied.length > 0) {
      logger.info("Database migrations applied", {
        count: applied.length,
        versions: applied.map((r) => r.version),
      });
    }
  } catch (err) {
    logger.error("Database migration failed", err as Error);
    throw err;
  }

  const vapidKeys = await loadOrGenerateVapidKeys(DATA_DIR);
  configureWebPush(vapidKeys);
  startPushPipeline();
  startBriefingScheduler();

  // Initialize trip tracking and journal (Phase 5)
  initTripTracking(pushDb, stations);

  // Initialize context-aware switching service (Phase 5)
  initContextService(pushDb, stations);

  // Feed poller (also triggers immediate first poll)
  initPoller(stations, routes);
  startPoller();
  startAlertsPoller();

  // Equipment poller (elevator/escalator outages)
  initEquipmentPoller(stations);
  startEquipmentPoller();

  // HTTP server
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    logger.info("Server started", {
      port: info.port,
      pid: process.pid,
      uptime: 0,
    });
  });
}

main().catch((err) => {
  logger.error("Server startup failed", err);
  process.exit(1);
});
