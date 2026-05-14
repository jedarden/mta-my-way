/**
 * Comprehensive health check endpoint.
 *
 * Provides detailed health status including database connectivity,
 * feed freshness, memory usage, and system metrics.
 */

import type { MiddlewareHandler } from "hono";
import type Database from "better-sqlite3";
import { logger } from "../observability/logger.js";

/**
 * Health status levels.
 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

/**
 * Health check result for a single component.
 */
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  latency?: number;
  details?: Record<string, unknown>;
}

/**
 * Overall health check response.
 */
export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  checks: Record<string, HealthCheckResult>;
  system: {
    memory: NodeJS.MemoryUsage;
    cpu: NodeJS.CpuUsage;
    platform: string;
    nodeVersion: string;
  };
}

/**
 * Health check configuration.
 */
export interface HealthCheckConfig {
  /** Database instance to check */
  db?: Database.Database;
  /** Feed freshness check function */
  checkFeedFreshness?: () => { fresh: boolean; age: number; lastUpdate: string };
  /** Custom health checks to include */
  customChecks?: Record<string, () => HealthCheckResult | Promise<HealthCheckResult>>;
  /** Maximum memory usage ratio before degraded status (default: 0.9) */
  maxMemoryRatio?: number;
  /** Maximum feed age in seconds before degraded status (default: 120) */
  maxFeedAge?: number;
  /** Application version */
  version?: string;
}

/**
 * Default health check configuration.
 */
const DEFAULT_CONFIG: Required<Omit<HealthCheckConfig, "db" | "checkFeedFreshness" | "customChecks">> = {
  maxMemoryRatio: 0.9,
  maxFeedAge: 120,
  version: "0.0.1",
};

/**
 * Perform a database health check.
 */
function checkDatabase(db: Database.Database): HealthCheckResult {
  const start = Date.now();

  try {
    // Simple query to test connectivity
    db.prepare("SELECT 1").get();

    // Check table count
    const tables = db
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'")
      .get() as { count: number };

    // Check migration status
    const migrations = db
      .prepare("SELECT COUNT(*) as count FROM _migrations")
      .get() as { count: number };

    const latency = Date.now() - start;

    return {
      name: "database",
      status: "healthy",
      latency,
      details: {
        tables: tables.count,
        migrations: migrations.count,
      },
    };
  } catch (error) {
    logger.error("Database health check failed", error instanceof Error ? error : undefined);

    return {
      name: "database",
      status: "unhealthy",
      message: error instanceof Error ? error.message : String(error),
      latency: Date.now() - start,
    };
  }
}

/**
 * Perform a feed freshness health check.
 */
function checkFeedFreshness(
  checkFn: () => { fresh: boolean; age: number; lastUpdate: string },
  maxAge: number
): HealthCheckResult {
  const start = Date.now();

  try {
    const result = checkFn();

    if (result.fresh) {
      return {
        name: "feed_freshness",
        status: "healthy",
        latency: Date.now() - start,
        details: {
          age: result.age,
          lastUpdate: result.lastUpdate,
        },
      };
    }

    if (result.age > maxAge * 2) {
      return {
        name: "feed_freshness",
        status: "unhealthy",
        message: `Feed data is stale (${result.age}s old)`,
        latency: Date.now() - start,
        details: {
          age: result.age,
          lastUpdate: result.lastUpdate,
        },
      };
    }

    return {
      name: "feed_freshness",
      status: "degraded",
      message: `Feed data is aging (${result.age}s old)`,
      latency: Date.now() - start,
      details: {
        age: result.age,
        lastUpdate: result.lastUpdate,
      },
    };
  } catch (error) {
    logger.error("Feed freshness check failed", error instanceof Error ? error : undefined);

    return {
      name: "feed_freshness",
      status: "unhealthy",
      message: error instanceof Error ? error.message : String(error),
      latency: Date.now() - start,
    };
  }
}

/**
 * Perform a memory health check.
 */
function checkMemory(maxRatio: number): HealthCheckResult {
  const memory = process.memoryUsage();
  const heapUsedRatio = memory.heapUsed / memory.heapTotal;
  const rss = memory.rss / 1024 / 1024;
  const heapTotal = memory.heapTotal / 1024 / 1024;
  const heapUsed = memory.heapUsed / 1024 / 1024;

  if (heapUsedRatio > maxRatio) {
    return {
      name: "memory",
      status: "unhealthy",
      message: `Memory usage is high (${(heapUsedRatio * 100).toFixed(1)}%)`,
      details: {
        rssMb: rss.toFixed(2),
        heapTotalMb: heapTotal.toFixed(2),
        heapUsedMb: heapUsed.toFixed(2),
        heapUsedRatio: heapUsedRatio.toFixed(3),
      },
    };
  }

  if (heapUsedRatio > maxRatio * 0.8) {
    return {
      name: "memory",
      status: "degraded",
      message: `Memory usage is elevated (${(heapUsedRatio * 100).toFixed(1)}%)`,
      details: {
        rssMb: rss.toFixed(2),
        heapTotalMb: heapTotal.toFixed(2),
        heapUsedMb: heapUsed.toFixed(2),
        heapUsedRatio: heapUsedRatio.toFixed(3),
      },
    };
  }

  return {
    name: "memory",
    status: "healthy",
    details: {
      rssMb: rss.toFixed(2),
      heapTotalMb: heapTotal.toFixed(2),
      heapUsedMb: heapUsed.toFixed(2),
      heapUsedRatio: heapUsedRatio.toFixed(3),
    },
  };
}

/**
 * Aggregate health check results into an overall status.
 */
function aggregateStatus(checks: Record<string, HealthCheckResult>): HealthStatus {
  const statuses = Object.values(checks).map((c) => c.status);

  if (statuses.some((s) => s === "unhealthy")) {
    return "unhealthy";
  }

  if (statuses.some((s) => s === "degraded")) {
    return "degraded";
  }

  return "healthy";
}

/**
 * Create a health check endpoint middleware.
 */
export function createHealthCheck(config: HealthCheckConfig = {}): MiddlewareHandler {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  return async (c) => {
    const checks: Record<string, HealthCheckResult> = {};

    // Database check
    if (fullConfig.db) {
      checks.database = checkDatabase(fullConfig.db);
    }

    // Feed freshness check
    if (fullConfig.checkFeedFreshness) {
      checks.feed_freshness = checkFeedFreshness(
        fullConfig.checkFeedFreshness,
        fullConfig.maxFeedAge
      );
    }

    // Memory check
    checks.memory = checkMemory(fullConfig.maxMemoryRatio);

    // Custom checks
    if (fullConfig.customChecks) {
      for (const [name, checkFn] of Object.entries(fullConfig.customChecks)) {
        try {
          checks[name] = await checkFn();
        } catch (error) {
          checks[name] = {
            name,
            status: "unhealthy",
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }
    }

    const status = aggregateStatus(checks);
    const statusCode = status === "healthy" ? 200 : status === "degraded" ? 200 : 503;

    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: fullConfig.version,
      checks,
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version,
      },
    };

    return c.json(response, statusCode);
  };
}

/**
 * Simple liveness probe endpoint.
 *
 * Returns 200 if the server is running, regardless of other checks.
 * Useful for Kubernetes liveness probes.
 */
export const livenessProbe: MiddlewareHandler = async (c) => {
  return c.text("OK", 200, {
    "Content-Type": "text/plain",
  });
};

/**
 * Simple readiness probe endpoint.
 *
 * Returns 200 if the server is ready to handle requests.
 * Checks critical dependencies like database connectivity.
 */
export function createReadinessProbe(config: { db?: Database.Database }): MiddlewareHandler {
  return async (c) => {
    if (config.db) {
      try {
        config.db.prepare("SELECT 1").get();
      } catch {
        return c.text("Not Ready", 503, {
          "Content-Type": "text/plain",
        });
      }
    }

    return c.text("Ready", 200, {
      "Content-Type": "text/plain",
    });
  };
}

/**
 * Startup probe endpoint.
 *
 * Returns 200 if the server has completed startup initialization.
 * Useful for slow-starting applications.
 */
export interface StartupProbeState {
  ready: boolean;
  startedAt: number;
}

export function createStartupProbe(
  getState: () => StartupProbeState
): MiddlewareHandler {
  return async (c) => {
    const state = getState();

    if (state.ready) {
      return c.text("Started", 200, {
        "Content-Type": "text/plain",
      });
    }

    const startupTime = Date.now() - state.startedAt;
    return c.text("Starting", 503, {
      "Content-Type": "text/plain",
      "X-Startup-Time": startupTime.toString(),
    });
  };
}
