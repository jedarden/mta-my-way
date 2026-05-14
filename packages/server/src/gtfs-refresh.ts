/**
 * Weekly GTFS static data refresh scheduler.
 *
 * Spawns process-gtfs.mjs every 7 days to download and re-process MTA's
 * published GTFS static feeds. Updated JSON files are written to data/ and
 * take effect on the next server restart / pod redeploy.
 *
 * Dependencies required in the runtime image:
 *   - packages/server/scripts/ (process-gtfs.mjs)
 *   - csv-parse (production dependency)
 *   - unzip (system package)
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./observability/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// packages/server/ — one level up from dist/ or src/
const SERVER_DIR = join(__dirname, "..");
const SCRIPT_PATH = join(SERVER_DIR, "scripts", "process-gtfs.mjs");

const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let isRefreshing = false;

async function runGtfsRefresh(): Promise<void> {
  if (isRefreshing) {
    logger.info("GTFS refresh already in progress — skipping");
    return;
  }

  isRefreshing = true;
  const startMs = Date.now();
  logger.info("GTFS static data refresh starting", { script: SCRIPT_PATH });

  return new Promise<void>((resolve) => {
    const stderrLines: string[] = [];

    const child = spawn("node", [SCRIPT_PATH], {
      cwd: SERVER_DIR,
      stdio: ["ignore", "ignore", "pipe"],
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrLines.push(...chunk.toString().split("\n").filter(Boolean));
    });

    child.on("close", (code) => {
      isRefreshing = false;
      const durationMs = Date.now() - startMs;
      if (code === 0) {
        logger.info("GTFS static data refresh complete", {
          durationMs,
          note: "New data files written to disk; active in memory on next restart",
        });
      } else {
        logger.error(
          "GTFS static data refresh failed",
          new Error(`process-gtfs.mjs exited with code ${code}`),
          { durationMs, stderr: stderrLines.slice(-20) },
        );
      }
      resolve();
    });

    child.on("error", (err) => {
      isRefreshing = false;
      const durationMs = Date.now() - startMs;
      logger.error("GTFS refresh spawn error", err, { durationMs, script: SCRIPT_PATH });
      resolve();
    });
  });
}

/**
 * Start the weekly GTFS data refresh scheduler.
 * The first run fires 7 days after startup; the server is expected to have
 * fresh data baked in at build time for the initial boot.
 */
export function startGtfsRefreshScheduler(): void {
  if (refreshTimer !== null) return;

  const nextRun = new Date(Date.now() + REFRESH_INTERVAL_MS);

  refreshTimer = setInterval(() => {
    runGtfsRefresh().catch((err: Error) => {
      logger.error("GTFS refresh unexpected error", err);
    });
  }, REFRESH_INTERVAL_MS);

  logger.info("GTFS refresh scheduler started", {
    interval_days: 7,
    next_run: nextRun.toISOString(),
  });
}
