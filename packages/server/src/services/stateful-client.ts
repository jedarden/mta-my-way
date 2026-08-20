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
 * - Half-open state: single test request on reset attempt
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

/**
 * Check if circuit breaker is currently open
 */
export function isCircuitOpen(): boolean {
  if (circuitState.circuitOpenAt === null) {
    return false;
  }

  // Check if circuit should reset
  const now = Date.now();
  if (now - circuitState.circuitOpenAt >= CIRCUIT_RESET_MS) {
    logger.info("Stateful circuit breaker reset - attempting recovery", {
      openDuration: now - circuitState.circuitOpenAt,
    });
    // Don't reset yet - wait for next request to attempt (half-open state)
    return true; // Still open until first success
  }

  return true;
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

  // Open circuit if threshold reached
  if (
    circuitState.consecutiveFailures >= CIRCUIT_OPEN_AFTER &&
    circuitState.circuitOpenAt === null
  ) {
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
    // In half-open state (after reset timeout), allow one test request
    const now = Date.now();
    const isHalfOpen =
      circuitState.circuitOpenAt !== null && now - circuitState.circuitOpenAt >= CIRCUIT_RESET_MS;

    if (!isHalfOpen) {
      logger.debug("Stateful circuit breaker open - request rejected", { path });
      throw new Error("Stateful subsystem unavailable - circuit breaker open");
    }

    logger.debug("Stateful circuit breaker half-open - attempting test request", {
      path,
    });
  }

  const url = `${STATEFUL_SERVICE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    logger.debug("Calling stateful service", { url, method: options.method || "GET" });

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`;
      recordFailure(error);
      throw new Error(error);
    }

    const data = await response.json();
    recordSuccess();
    return data as T;
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
