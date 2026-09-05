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
import { initApiKeyRegistryFromDb } from "./middleware/api-key-management.js";
import { loadRateLimitDataFromDb } from "./middleware/auth-rate-limit.js";
import { startSessionCleanup } from "./middleware/concurrent-session-management.js";
import { initPasswordManagementFromDb } from "./middleware/password-management.js";
import { setRateLimiterTestMode } from "./middleware/rate-limiter.js";
import { initNotificationsFromDb } from "./middleware/suspicious-activity-notifications.js";
import { runMigrations } from "./migration/index.js";
import { initObservability, logger, shutdownObservability } from "./observability/index.js";
import { initPoller, startPoller } from "./poller.js";
import { startBriefingScheduler } from "./push/briefing.js";
import { startPushPipeline } from "./push/index.js";
import { configurePushDatabase, withPushDatabase } from "./push/subscriptions.js";
import { configureWebPush, isWebPushConfigured, loadOrGenerateVapidKeys } from "./push/vapid.js";
import { validateSecurityOrThrow } from "./security-startup.js";
import { setSecurityDb } from "./security/security-db.js";
import { configureEmailProvider } from "./services/password-reset.service.js";
import { runStartupChecks } from "./startup-check.js";
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
  // Run startup checks first - verify required runtime artifacts are present
  runStartupChecks();

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

    // VAPID keys must be in place before the HTTP server reports ready: the
    // browser needs the public key to subscribe and every send is gated on
    // them. Env vars win in production; otherwise keys load from (or are
    // generated into) DATA_DIR. loadOrGenerateVapidKeys already tolerates an
    // unwritable directory by falling back to ephemeral keys, so a throw here
    // is logged and startup continues with push disabled instead of blocking
    // the server.
    try {
      const vapidKeys = await loadOrGenerateVapidKeys(DATA_DIR);
      configureWebPush(vapidKeys);
    } catch (err) {
      logger.error("Push notifications unavailable — VAPID keys not configured", err as Error, {
        hint: "Set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY, or make the data directory writable",
      });
    }

    // Safe to start before the database is ready: subscriptions are read
    // lazily through withPushDatabase and sender.ts no-ops while web-push is
    // unconfigured.
    startPushPipeline();
    startBriefingScheduler();

    // Security persistence. API keys, password reset state, rate-limit bans,
    // notification preferences and sessions only survive a restart if they are
    // hydrated from SQLite before the server accepts traffic, so this runs
    // eagerly rather than on first use — unlike the push reads above.
    //
    // Migrations run first: the lazy push schema creates only
    // push_subscriptions, and every loader below reads a security_* table that
    // does not exist until they are applied.
    //
    // A failure degrades the same way the push subsystem does — the security
    // stores stay unwired (their writes no-op and their reads come back empty)
    // and core endpoints stay available — rather than blocking startup.
    let securityPersistence: "ready" | "degraded" = "degraded";
    try {
      await withPushDatabase(async (pushDb) => {
        const results = await runMigrations(pushDb);
        const applied = results.filter((r) => r.applied);
        if (applied.length > 0) {
          logger.info("Database migrations applied", {
            count: applied.length,
            versions: applied.map((r) => r.version),
          });
        }

        // Must follow runMigrations so the tables these read exist.
        setSecurityDb(pushDb);
        await initApiKeyRegistryFromDb();
        // The remaining three hydrators are synchronous (they return void, not
        // a promise), so they are called un-awaited on purpose — only the API
        // key registry has an async body to wait for.
        loadRateLimitDataFromDb();
        initPasswordManagementFromDb();
        initNotificationsFromDb();
      });
      securityPersistence = "ready";
    } catch (err) {
      logger.error("Security persistence unavailable — running in degraded mode", err as Error, {
        hint: "API keys, password resets, rate-limit bans and sessions will not survive a restart",
      });
    }

    // Automatic expiry of idle and timed-out sessions. Purely in-memory, so it
    // starts regardless of whether the database opened.
    startSessionCleanup();

    logger.info("Stateful subsystems configured", {
      pushDb: "lazy-init",
      pushNotifications: isWebPushConfigured() ? "configured" : "unavailable",
      securityPersistence,
      tripTracking: "lazy-init",
      hint: "Core endpoints remain available.",
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

void main().catch((err) => {
  logger.error("Server startup failed", err);
  // Keep the rejection handled so startup failures do not surface as an
  // unhandled error in tests or callers importing the entry point. Node exits
  // naturally once the failed startup has no remaining handles.
  process.exitCode = 1;
});
