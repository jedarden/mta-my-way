/**
 * Stateful subsystem client with circuit breaker.
 *
 * Implements service-to-service communication from the stateless core to the
 * stateful subsystem over its internal ClusterIP Service. Includes timeout,
 * circuit breaker, and graceful degradation per ADR-001 (2026-07-20).
 *
 * Circuit breaker behavior:
 * - Opens after 3 consecutive failures
 * - Resets after 60 seconds
 * - Returns 503 immediately when circuit is open
 * - Half-open state: exactly one probe in flight per reset window — concurrent
 *   and sequential callers fail fast until it settles, and a failed probe
 *   re-arms the full open window so the next probe waits another
 *   CIRCUIT_RESET_MS instead of hammering the dead service
 *
 * Environment variables:
 * - STATEFUL_SERVICE_URL: Base URL of stateful subsystem (default: http://mta-my-way-stateful:3001)
 * - STATEFUL_TIMEOUT_MS: Request timeout in milliseconds (default: 2000)
 */

import { logger } from "../observability/index.js";

/** Number of consecutive failures before opening circuit */
const CIRCUIT_OPEN_AFTER = 3;

/** How long (ms) to keep circuit open before attempting reset */
const CIRCUIT_RESET_MS = 60_000;

/** Default timeout for stateful subsystem requests */
const DEFAULT_TIMEOUT_MS = 2000;

/** Stateful subsystem service URL from env or default */
const STATEFUL_SERVICE_URL =
  process.env["STATEFUL_SERVICE_URL"] || "http://mta-my-way-stateful:3001";

/** Request timeout from env or default */
const TIMEOUT_MS = parseInt(process.env["STATEFUL_TIMEOUT_MS"] || `${DEFAULT_TIMEOUT_MS}`, 10);

export interface CircuitState {
  /** Timestamp (ms) when circuit was opened, or null if closed */
  circuitOpenAt: number | null;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Last error message */
  lastError: string | null;
  /** Timestamp (ms) of last success */
  lastSuccessAt: number | null;
}

/** Circuit state for stateful subsystem calls */
let circuitState: CircuitState = {
  circuitOpenAt: null,
  consecutiveFailures: 0,
  lastError: null,
  lastSuccessAt: null,
};

/** Whether the single half-open probe is currently in flight */
let halfOpenProbeInFlight = false;

/**
 * Check if circuit breaker is currently open
 *
 * True across the whole open window, including once CIRCUIT_RESET_MS has
 * elapsed — the circuit is reported as open until a probe succeeds, but
 * callStatefulService will admit a single probe in that half-open state.
 */
export function isCircuitOpen(): boolean {
  return circuitState.circuitOpenAt !== null;
}

/**
 * Record a successful call to stateful subsystem
 */
function recordSuccess(): void {
  const now = Date.now();
  if (circuitState.circuitOpenAt !== null) {
    logger.info("Stateful circuit breaker closed - service recovered", {
      wasOpenFor: now - circuitState.circuitOpenAt,
    });
  }
  circuitState = {
    circuitOpenAt: null,
    consecutiveFailures: 0,
    lastError: null,
    lastSuccessAt: now,
  };
}

/**
 * Record a failed call to stateful subsystem
 */
function recordFailure(error: string): void {
  circuitState.consecutiveFailures++;
  circuitState.lastError = error;

  if (circuitState.circuitOpenAt !== null) {
    // The circuit was already open, so this failure is a half-open probe (or
    // a call admitted just before the circuit opened). Re-arm the open window
    // so the breaker fails fast for another CIRCUIT_RESET_MS instead of
    // treating every subsequent call as a fresh probe.
    circuitState.circuitOpenAt = Date.now();
    logger.warn("Stateful circuit breaker re-armed - half-open probe failed", {
      consecutiveFailures: circuitState.consecutiveFailures,
      lastError: error,
    });
    return;
  }

  // Open circuit if threshold reached
  if (circuitState.consecutiveFailures >= CIRCUIT_OPEN_AFTER) {
    const now = Date.now();
    circuitState.circuitOpenAt = now;
    logger.warn("Stateful circuit breaker opened - service unavailable", {
      consecutiveFailures: circuitState.consecutiveFailures,
      lastError: error,
    });
  }
}

/**
 * Get current circuit state (for health endpoint reporting)
 */
export function getCircuitState(): CircuitState {
  return { ...circuitState };
}

/**
 * Make HTTP request to stateful subsystem with circuit breaker protection
 *
 * @param path - API path (e.g., /api/push/subscribe)
 * @param options - Request options (method, headers, body)
 * @returns Response object or null if circuit is open
 * @throws Error if request fails (timeout, connection refused, HTTP error)
 */
export async function callStatefulService<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  // Check circuit state first
  if (isCircuitOpen()) {
    // In half-open state (after reset timeout), allow exactly one test request
    const now = Date.now();
    const openAt = circuitState.circuitOpenAt;
    const isHalfOpen = openAt !== null && now - openAt >= CIRCUIT_RESET_MS;

    if (!isHalfOpen) {
      logger.debug("Stateful circuit breaker open - request rejected", { path });
      throw new Error("Stateful subsystem unavailable - circuit breaker open");
    }

    if (halfOpenProbeInFlight) {
      logger.debug("Stateful circuit breaker half-open - probe in flight, request rejected", {
        path,
      });
      throw new Error("Stateful subsystem unavailable - circuit breaker open");
    }

    logger.info("Stateful circuit breaker reset - attempting recovery", {
      openDuration: now - openAt,
      path,
    });
    logger.debug("Stateful circuit breaker half-open - attempting test request", {
      path,
    });
    halfOpenProbeInFlight = true;
  }

  try {
    return await performCall<T>(path, options);
  } finally {
    // The probe has settled — recordSuccess/recordFailure runs on every path
    // through performCall — so release the single half-open slot.
    halfOpenProbeInFlight = false;
  }
}

/** Issue the request itself; all outcomes funnel through recordSuccess/recordFailure. */
async function performCall<T = unknown>(path: string, options: RequestInit): Promise<T> {
  const url = `${STATEFUL_SERVICE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    logger.debug("Calling stateful service", { url, method: options.method || "GET" });

    response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const error = err instanceof Error ? err.message : String(err);

    // Don't record circuit failure for client aborts or expected errors
    if (error.includes("abort") || error.includes("timeout")) {
      recordFailure(`Request timeout after ${TIMEOUT_MS}ms`);
      throw new Error(`Stateful subsystem timeout (${TIMEOUT_MS}ms)`);
    }

    recordFailure(error);
    throw err;
  }
  clearTimeout(timeoutId);

  // HTTP status failures are recorded exactly once — throwing them inside the
  // try above would re-enter the catch and double-count toward the breaker.
  if (!response.ok) {
    const error = `HTTP ${response.status}: ${response.statusText}`;
    recordFailure(error);
    throw new Error(error);
  }

  try {
    const data = await response.json();
    recordSuccess();
    return data as T;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    recordFailure(error);
    throw err;
  }
}

/**
 * Health check for stateful subsystem
 *
 * @returns true if stateful subsystem is reachable, false otherwise
 */
export async function checkStatefulHealth(): Promise<boolean> {
  try {
    const response = await callStatefulService<{ status: string }>("/health", {
      method: "GET",
    });
    return response.status === "ok";
  } catch {
    return false;
  }
}

/**
 * Get detailed status of stateful subsystem connectivity
 *
 * @returns Status object for health endpoint reporting
 */
export function getStatefulStatus(): {
  reachable: boolean | null;
  circuitOpen: boolean;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  serviceUrl: string;
} {
  return {
    reachable: circuitState.lastSuccessAt
      ? Date.now() - circuitState.lastSuccessAt < 30_000 // Last success within 30s
      : null,
    circuitOpen: isCircuitOpen(),
    consecutiveFailures: circuitState.consecutiveFailures,
    lastSuccessAt: circuitState.lastSuccessAt
      ? new Date(circuitState.lastSuccessAt).toISOString()
      : null,
    lastError: circuitState.lastError,
    serviceUrl: STATEFUL_SERVICE_URL,
  };
}
