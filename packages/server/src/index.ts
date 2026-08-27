/**
 * MTA My Way server entry point.
 *
 * Startup sequence:
 *   1. Load GTFS static data (stations, routes, complexes, transfers, travel times)
 *   2. Create Hono app (also builds TransferEngine internally)
 *   3. Initialise push notification subsystem (SQLite DB, VAPID keys, pipeline)
 *   4. Start the HTTP server (health endpoint becomes available immediately)
 *   5. Start feed pollers in background (first poll fires immediately but async)
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
import { CORE_ONLY } from "./config.js";
import { initDelayDetector } from "./delay-detector.js";
import { initDelayPredictor, initDelayPredictorForTesting } from "./delay-predictor.js";
import { initEquipmentPoller, startEquipmentPoller } from "./equipment-poller.js";
import { startGtfsRefreshScheduler } from "./gtfs-refresh.js";
import { setRateLimiterTestMode } from "./middleware/rate-limiter.js";
import { initObservability, logger, shutdownObservability } from "./observability/index.js";
import { initPoller, startPoller } from "./poller.js";
import { configurePushDatabase } from "./push/subscriptions.js";
import { validateSecurityOrThrow } from "./security-startup.js";
import { configureEmailProvider } from "./services/password-reset.service.js";
import { loadTravelTimes } from "./transfer/travel-times.js";
import { initTripTracking } from "./trip-tracking.js";

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
  // Initialize all observability subsystems (OTel, tracing, metrics — logger is import-time)
  await initObservability();

  // Validate security configuration first (fail-fast on critical issues)
  validateSecurityOrThrow();

  // Configure email provider for password reset emails
  const emailProvider = (process.env["EMAIL_PROVIDER"] ?? "console") as
    | "sendgrid"
    | "ses"
    | "smtp"
    | "console";
  configureEmailProvider({
    provider: emailProvider,
    apiKey: process.env["SENDGRID_API_KEY"],
    fromEmail: process.env["EMAIL_FROM"] ?? "noreply@mtamyway.com",
    fromName: process.env["EMAIL_FROM_NAME"] ?? "MTA My Way",
    replyTo: process.env["EMAIL_REPLY_TO"],
    smtpHost: process.env["SMTP_HOST"],
    smtpPort: process.env["SMTP_PORT"] ? parseInt(process.env["SMTP_PORT"], 10) : undefined,
    smtpUser: process.env["SMTP_USER"],
    smtpPassword: process.env["SMTP_PASSWORD"],
  });

  // Enable test mode if environment variable is set (for E2E tests)
  const testMode =
    (process.env["TEST_MODE"] ?? "").toLowerCase() === "true" || process.env["TEST_MODE"] === "1";
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
    if (testMode) {
      initDelayPredictorForTesting();
    }
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

  // Push notification subsystem — best-effort initialization
  // In CORE_ONLY mode, skip all DB-dependent subsystems entirely
  if (!CORE_ONLY) {
    const pushDbPath = process.env["PUSH_DB_PATH"] ?? join(DATA_DIR, "subscriptions.db");

    // Configure push database path — will be opened lazily on first use
    configurePushDatabase(pushDbPath);

    // Configure trip tracking — will use the same database, initialized lazily
    initTripTracking(null, stations);

    // Note: Database migrations and DB-dependent services initialization
    // are now deferred. They will be triggered on first use of DB-dependent
    // features. If the DB cannot be opened, those features will return 503
    // while core functionality remains available.

    logger.info("Stateful subsystems configured", {
      pushDb: "lazy-init",
      tripTracking: "lazy-init",
      hint: "DB will be initialized on first use. Core endpoints remain available.",
    });
  } else {
    logger.info("CORE_ONLY mode: skipping all DB-dependent subsystems", {
      disabled: [
        "push subscriptions",
        "trip tracking",
        "context service",
        "session cleanup",
        "password reset",
      ],
      hint: "Set CORE_ONLY=false to enable stateful features",
    });
  }

  // Weekly GTFS static data refresh (first run fires 7 days after startup)
  startGtfsRefreshScheduler();

  // HTTP server — start BEFORE pollers so health endpoint responds immediately
  // Pollers will fire their first poll in the background after server is listening
  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    logger.info("Server started", {
      port: info.port,
      pid: process.pid,
      uptime: 0,
    });
  });

  // Feed poller (fires immediately but server is already listening)
  initPoller(stations, routes);
  startPoller();
  startAlertsPoller();

  // Equipment poller (elevator/escalator outages)
  initEquipmentPoller(stations);
  startEquipmentPoller();

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info("Received shutdown signal", { signal });

    // Stop accepting new connections so in-flight requests drain naturally
    server.close();

    // Give in-flight requests a short grace period, then force exit
    const forceExit = setTimeout(() => process.exit(0), 5_000);

    try {
      await shutdownObservability();
    } catch (err) {
      logger.error("Error during observability shutdown", err as Error);
    }

    clearTimeout(forceExit);
    process.exit(0);
  };

  // Register shutdown handlers
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error("Server startup failed", err);
  process.exit(1);
});
