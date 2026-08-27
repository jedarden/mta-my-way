/**
 * Environment configuration for MTA My Way server.
 *
 * This module centralizes environment variable parsing and provides
 * type-safe accessors for configuration values.
 */

/**
 * Parse a boolean environment variable.
 *
 * Accepts case-insensitive string values and numeric representations:
 * - Truthy: "true", "TRUE", "True", "1"
 * - Falsy: "false", "FALSE", "False", "0", "" (unset)
 *
 * @param value - The environment variable value (may be undefined)
 * @param defaultValue - Default value if the environment variable is unset
 * @returns Parsed boolean value
 */
export function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined || value === "") {
    return defaultValue;
  }

  const normalized = value.toLowerCase().trim();

  // Truthy values
  if (normalized === "true" || normalized === "1") {
    return true;
  }

  // Falsy values
  if (normalized === "false" || normalized === "0") {
    return false;
  }

  // Unknown values default to false for security
  return defaultValue;
}

/**
 * CORE_ONLY mode: When set to true, the server runs in stateless mode.
 *
 * In CORE_ONLY mode:
 * - No database initialization (push subscriptions, trip tracking, context service)
 * - No push notification pipeline
 * - No session cleanup
 * - DB-dependent endpoints return 503 Service Unavailable
 *
 * This mode is used for the stateless core deployment that can run replicas 2+
 * with zero dependency on PVC-backed storage. The stateful subsystem runs as
 * a separate deployment with replicas=1 and PVC mount.
 *
 * Per ADR-001 (2026-07-20): "Decouple the Core Read Path from Persistent-Volume-Backed State"
 *
 * @returns true if server is in CORE_ONLY mode, false otherwise
 */
export function isCoreOnlyMode(): boolean {
  return parseBooleanEnv(process.env["CORE_ONLY"], false);
}

/**
 * Export the parsed CORE_ONLY value for direct import.
 *
 * This is evaluated once at module load time for performance.
 * Use isCoreOnlyMode() if you need the latest value (e.g., in tests).
 */
export const CORE_ONLY = isCoreOnlyMode();
