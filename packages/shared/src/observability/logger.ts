/**
 * Structured JSON logger for MTA My Way.
 *
 * Emits structured JSON in production for log aggregation (e.g. Datadog, CloudWatch).
 * In development, logs are pretty-printed to stdout for readability.
 *
 * Usage:
 *   import { createLogger } from "@mta-my-way/shared";
 *   const log = createLogger({ service: "api", component: "arrivals" });
 *   log.info("feed refreshed", { line: "A", stationCount: 42 });
 *   log.error("fetch failed", err, { url: feedUrl });
 */

// ============================================================================
// Types
// ============================================================================

/** Log levels ordered from most to least verbose. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** A single structured log entry emitted by the logger. */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  component?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/** Configuration for creating a logger instance. */
export interface LoggerConfig {
  /** Minimum log level to emit. Defaults to "info" in production, "debug" otherwise. */
  minLevel?: LogLevel;
  /** Service name included in every log entry (e.g. "api", "worker"). */
  service?: string;
  /** Component name for sub-system identification (e.g. "arrivals", "auth"). */
  component?: string;
  /** Static context merged into every log entry. */
  context?: Record<string, unknown>;
  /**
   * Override environment detection. Set explicitly for testing or forced output.
   * When omitted, inferred from NODE_ENV.
   */
  env?: "development" | "production";
  /** Custom output sink. Defaults to console (console.error for warn/error, console.log otherwise). */
  sink?: (entry: LogEntry, formatted: string) => void;
}

/** Logger interface — mirrors the mock in testing/observability-helpers for seamless test swapping. */
export interface Logger {
  /** Log a debug-level message (suppressed in production unless minLevel is "debug"). */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Log an info-level message. */
  info(message: string, context?: Record<string, unknown>): void;
  /** Log a warning. */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Log an error, optionally attaching an Error object. */
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  /** Create a child logger with additional merged context. */
  child(additionalContext: Record<string, unknown>): Logger;
}

// ============================================================================
// Environment helpers
// ============================================================================

function detectEnvironment(override?: string): "development" | "production" {
  if (override === "development" || override === "production") return override;
  return process.env["NODE_ENV"] === "production" ? "production" : "development";
}

function resolveMinLevel(config: LoggerConfig, env: string): LogLevel {
  if (config.minLevel) return config.minLevel;
  return env === "production" ? "info" : "debug";
}

// ============================================================================
// Formatting
// ============================================================================

function serializeError(err: Error): LogEntry["error"] {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
  };
}

function getTimestamp(): string {
  return new Date().toISOString();
}

function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function formatPretty(entry: LogEntry): string {
  const ts = entry.timestamp;
  const lvl = entry.level.toUpperCase().padEnd(5);
  const prefix =
    entry.service || entry.component
      ? `[${entry.service ?? ""}${entry.service && entry.component ? "/" : ""}${entry.component ?? ""}]`
      : "";
  const parts = [`${ts} ${lvl} ${prefix} ${entry.message}`];
  if (entry.error) {
    parts.push(`  → ${entry.error.name}: ${entry.error.message}`);
    if (entry.error.stack) {
      parts.push(`  ${entry.error.stack}`);
    }
  }
  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(`  ${JSON.stringify(entry.context, null, 2)}`);
  }
  return parts.join("\n");
}

// ============================================================================
// Logger factory
// ============================================================================

/**
 * Create a structured logger instance.
 *
 * @example
 * ```ts
 * const log = createLogger({ service: "api", component: "feeds" });
 * log.info("subway feed refreshed", { line: "A", stationCount: 351 });
 * ```
 */
export function createLogger(config: LoggerConfig = {}): Logger {
  const env = detectEnvironment(config.env);
  const minLevel = resolveMinLevel(config, env);
  const isProduction = env === "production";

  const format = isProduction ? formatJson : formatPretty;

  const baseContext: Record<string, unknown> = { ...config.context };

  const emit = (
    level: LogLevel,
    message: string,
    error?: Error,
    context?: Record<string, unknown>
  ) => {
    if (LEVEL_VALUES[level] < LEVEL_VALUES[minLevel]) return;

    const entry: LogEntry = {
      timestamp: getTimestamp(),
      level,
      message,
      ...(config.service && { service: config.service }),
      ...(config.component && { component: config.component }),
      ...(Object.keys(baseContext).length > 0 && { context: baseContext }),
      ...(error && { error: serializeError(error) }),
    };

    // Merge per-call context into entry context
    if (context && Object.keys(context).length > 0) {
      entry.context = { ...entry.context, ...context };
    }

    // Remove empty context field
    if (entry.context && Object.keys(entry.context).length === 0) {
      delete entry.context;
    }

    const formatted = format(entry);

    if (config.sink) {
      config.sink(entry, formatted);
    } else {
      // Use console.error for warn/error so it goes to stderr, console.log for the rest
      if (level === "warn" || level === "error") {
        console.error(formatted);
      } else {
        console.log(formatted);
      }
    }
  };

  return {
    debug(message: string, context?: Record<string, unknown>) {
      emit("debug", message, undefined, context);
    },
    info(message: string, context?: Record<string, unknown>) {
      emit("info", message, undefined, context);
    },
    warn(message: string, context?: Record<string, unknown>) {
      emit("warn", message, undefined, context);
    },
    error(message: string, error?: Error, context?: Record<string, unknown>) {
      emit("error", message, error, context);
    },
    child(additionalContext: Record<string, unknown>): Logger {
      return createLogger({
        ...config,
        context: { ...baseContext, ...additionalContext },
      });
    },
  };
}

// ============================================================================
// Convenience default instance
// ============================================================================

/** Default logger instance with no service/component context. */
export const log = createLogger();
