/**
 * Integration test helpers for database setup and shared fixtures.
 *
 * Provides:
 * - In-memory database initialization
 * - Schema setup for trip tracking and push subscriptions
 * - Common test data factories
 * - Authentication helpers for API tests
 */

import type { StationIndex } from "@mta-my-way/shared";
import Database from "better-sqlite3";
import { registerApiKeyWithMetadata } from "../middleware/api-key-management.js";
import { generateApiKey, hashApiKey, registerApiKey } from "../middleware/authentication.js";
import { initTripTracking } from "../trip-tracking.js";

// ---------------------------------------------------------------------------
// Test data fixtures
// ---------------------------------------------------------------------------

/** Minimal station index for testing */
export const TEST_STATIONS: StationIndex = {
  "101": {
    id: "101",
    name: "South Ferry",
    lat: 40.702,
    lon: -74.013,
    lines: ["1"],
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  "102": {
    id: "102",
    name: "Rector St",
    lat: 40.709,
    lon: -74.014,
    lines: ["1"],
    northStopId: "102N",
    southStopId: "102S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  "725": {
    id: "725",
    name: "Times Sq-42 St",
    lat: 40.758,
    lon: -73.985,
    lines: ["1", "2", "3", "7", "N", "Q", "R", "W", "S"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [
      { toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true },
    ],
    ada: true,
    borough: "manhattan",
    complex: "725-726",
  },
  "726": {
    id: "726",
    name: "42 St-Port Authority",
    lat: 40.756,
    lon: -73.988,
    lines: ["A", "C", "E"],
    northStopId: "726N",
    southStopId: "726S",
    transfers: [],
    ada: true,
    borough: "manhattan",
    complex: "725-726",
  },
  "727": {
    id: "727",
    name: "50 St",
    lat: 40.763,
    lon: -73.989,
    lines: ["A", "C", "E"],
    northStopId: "727N",
    southStopId: "727S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
};

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Create an in-memory database with trip tracking schema.
 */
export function createTripTrackingDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");

  // Create trips table with owner_id for authorization
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      origin_station_id TEXT NOT NULL,
      origin_station_name TEXT NOT NULL,
      destination_station_id TEXT NOT NULL,
      destination_station_name TEXT NOT NULL,
      line TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'N',
      departure_time INTEGER NOT NULL,
      arrival_time INTEGER NOT NULL,
      actual_duration_minutes INTEGER NOT NULL,
      scheduled_duration_minutes INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      owner_id TEXT NOT NULL DEFAULT 'anonymous'
    );

    CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date);
    CREATE INDEX IF NOT EXISTS idx_trips_origin ON trips(origin_station_id);
    CREATE INDEX IF NOT EXISTS idx_trips_destination ON trips(destination_station_id);
    CREATE INDEX IF NOT EXISTS idx_trips_line ON trips(line);
    CREATE INDEX IF NOT EXISTS idx_trips_departure_time ON trips(departure_time);
    CREATE INDEX IF NOT EXISTS idx_trips_owner_id ON trips(owner_id);
  `);

  // Create commute stats table
  db.exec(`
    CREATE TABLE IF NOT EXISTS commute_stats (
      commute_id TEXT PRIMARY KEY,
      average_duration_minutes REAL NOT NULL DEFAULT 0,
      median_duration_minutes REAL NOT NULL DEFAULT 0,
      std_dev_minutes REAL NOT NULL DEFAULT 0,
      total_trips INTEGER NOT NULL DEFAULT 0,
      trips_this_week INTEGER NOT NULL DEFAULT 0,
      trend REAL NOT NULL DEFAULT 0,
      average_delay_minutes REAL NOT NULL DEFAULT 0,
      max_delay_minutes REAL NOT NULL DEFAULT 0,
      on_time_percentage REAL NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL
    );
  `);

  return db;
}

/**
 * Create an in-memory database with push subscriptions schema.
 */
export function createPushDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint_hash TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      favorites TEXT NOT NULL DEFAULT '[]',
      quiet_hours TEXT NOT NULL DEFAULT '{"enabled":false,"startHour":22,"endHour":7}',
      morning_scores TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      owner_id TEXT NOT NULL DEFAULT 'anonymous'
    );

    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated
      ON push_subscriptions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner_id
      ON push_subscriptions(owner_id);
  `);

  return db;
}

/**
 * Create a combined database with all schemas.
 */
export function createIntegrationTestDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");

  // Trip tracking schema with owner_id for authorization
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      origin_station_id TEXT NOT NULL,
      origin_station_name TEXT NOT NULL,
      destination_station_id TEXT NOT NULL,
      destination_station_name TEXT NOT NULL,
      line TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'N',
      departure_time INTEGER NOT NULL,
      arrival_time INTEGER NOT NULL,
      actual_duration_minutes INTEGER NOT NULL,
      scheduled_duration_minutes INTEGER,
      source TEXT NOT NULL DEFAULT 'manual',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      owner_id TEXT NOT NULL DEFAULT 'anonymous'
    );

    CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date);
    CREATE INDEX IF NOT EXISTS idx_trips_origin ON trips(origin_station_id);
    CREATE INDEX IF NOT EXISTS idx_trips_destination ON trips(destination_station_id);
    CREATE INDEX IF NOT EXISTS idx_trips_line ON trips(line);
    CREATE INDEX IF NOT EXISTS idx_trips_departure_time ON trips(departure_time);
    CREATE INDEX IF NOT EXISTS idx_trips_owner_id ON trips(owner_id);

    CREATE TABLE IF NOT EXISTS commute_stats (
      commute_id TEXT PRIMARY KEY,
      average_duration_minutes REAL NOT NULL DEFAULT 0,
      median_duration_minutes REAL NOT NULL DEFAULT 0,
      std_dev_minutes REAL NOT NULL DEFAULT 0,
      total_trips INTEGER NOT NULL DEFAULT 0,
      trips_this_week INTEGER NOT NULL DEFAULT 0,
      trend REAL NOT NULL DEFAULT 0,
      average_delay_minutes REAL NOT NULL DEFAULT 0,
      max_delay_minutes REAL NOT NULL DEFAULT 0,
      on_time_percentage REAL NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL
    );
  `);

  // Push subscriptions schema with owner_id for authorization
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint_hash TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      favorites TEXT NOT NULL DEFAULT '[]',
      quiet_hours TEXT NOT NULL DEFAULT '{"enabled":false,"startHour":22,"endHour":7}',
      morning_scores TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      owner_id TEXT NOT NULL DEFAULT 'anonymous'
    );

    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated
      ON push_subscriptions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner_id
      ON push_subscriptions(owner_id);
  `);

  return db;
}

/**
 * Clean up database connection.
 */
export function closeDatabase(db: Database.Database): void {
  db.close();
}

// ---------------------------------------------------------------------------
// Data factory functions
// ---------------------------------------------------------------------------

/**
 * Create a test trip record with default values.
 */
export function createTestTrip(
  overrides: Partial<{
    id: string;
    date: string;
    originId: string;
    originName: string;
    destinationId: string;
    destinationName: string;
    line: string;
    departureTime: number;
    arrivalTime: number;
    actualDurationMinutes: number;
    scheduledDurationMinutes: number;
    source: "manual" | "inferred" | "tracked";
    notes: string;
  }> = {}
) {
  const now = Date.now();
  const oneHourAgo = now - 3600000;

  return {
    id: overrides.id ?? crypto.randomUUID(),
    date: overrides.date ?? new Date(now).toISOString().split("T")[0]!,
    origin: {
      stationId: overrides.originId ?? "101",
      stationName: overrides.originName ?? "South Ferry",
    },
    destination: {
      stationId: overrides.destinationId ?? "725",
      stationName: overrides.destinationName ?? "Times Sq-42 St",
    },
    line: overrides.line ?? "1",
    departureTime: overrides.departureTime ?? oneHourAgo,
    arrivalTime: overrides.arrivalTime ?? now,
    actualDurationMinutes: overrides.actualDurationMinutes ?? 60,
    scheduledDurationMinutes: overrides.scheduledDurationMinutes ?? 55,
    source: (overrides.source ?? "manual") as "manual" | "inferred" | "tracked",
    notes: overrides.notes,
  };
}

/**
 * Create a test push subscription.
 */
export function createTestSubscription(
  overrides: Partial<{
    endpoint: string;
    p256dh: string;
    auth: string;
    favorites: Array<{ id: string; stationId: string; lines: string[]; direction: string }>;
    quietHours?: { enabled: boolean; startHour: number; endHour: number };
    morningScores?: Record<string, { line: string; scores: number[] }>;
  }> = {}
) {
  return {
    subscription: {
      endpoint: overrides.endpoint ?? "https://fcm.googleapis.com/fcm/send/test-endpoint",
      keys: {
        p256dh: overrides.p256dh ?? "test-p256dh-key",
        auth: overrides.auth ?? "test-auth-key",
      },
    },
    favorites: overrides.favorites ?? [
      { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
    ],
    quietHours: overrides.quietHours ?? { enabled: false, startHour: 22, endHour: 7 },
    morningScores: overrides.morningScores ?? {},
  };
}

// ---------------------------------------------------------------------------
// Authentication helpers for API tests
// ---------------------------------------------------------------------------

export interface TestAuthCredentials {
  keyId: string;
  apiKey: string;
  authorizationHeader: string;
}

/**
 * Create a test API key with the specified scope and role.
 * Returns the credentials needed to make authenticated requests.
 */
export async function createTestApiKey(
  scope: "read" | "write" | "admin" = "write",
  role: "guest" | "user" | "admin" = "user"
): Promise<TestAuthCredentials> {
  const keyId = `test_key_${Math.random().toString(36).substring(7)}`;
  const apiKey = await generateApiKey();
  const hashed = await hashApiKey(apiKey);

  const keyData = {
    keyId,
    keyHash: hashed.hash,
    keySalt: hashed.salt,
    scope,
    rateLimitTier: 10,
    active: true,
    createdAt: Date.now(),
    expiresAt: 0,
    role,
  };

  await registerApiKey(keyData);
  registerApiKeyWithMetadata(keyData, `Test ${role} key with ${scope} scope`);

  return {
    keyId,
    apiKey,
    authorizationHeader: `Bearer ${keyId}:${apiKey}`,
  };
}

/**
 * Create test credentials for an admin user.
 */
export async function createTestAdminCredentials(): Promise<TestAuthCredentials> {
  return createTestApiKey("admin", "admin");
}

/**
 * Create test credentials for a regular user with write access.
 */
export async function createTestUserCredentials(): Promise<TestAuthCredentials> {
  return createTestApiKey("write", "user");
}

/**
 * Create test credentials for a read-only user.
 */
export async function createTestReadCredentials(): Promise<TestAuthCredentials> {
  return createTestApiKey("read", "user");
}

/**
 * Clear all commute stats cache (for test isolation).
 */
export function clearCommuteStatsCache(db: Database.Database): void {
  db.prepare("DELETE FROM commute_stats").run();
}

/**
 * Clear all trips (for test isolation).
 */
export function clearAllTrips(db: Database.Database): void {
  db.prepare("DELETE FROM trips").run();
}

// ---------------------------------------------------------------------------
// Module state reset helpers (for test isolation)
// ---------------------------------------------------------------------------

/**
 * Reset all module-level state between tests.
 * This function resets cache, trip tracking, and alerts state
 * to prevent test pollution from module-level singletons.
 *
 * @deprecated Use {@link cleanupAllState} instead — it covers every known
 * module-level singleton.
 */
export async function resetAllModuleState(): Promise<void> {
  await cleanupAllState();
}

/**
 * Comprehensive cleanup of ALL shared mutable state across the server package.
 *
 * Call this in a `beforeEach` hook (or at the start of any test that needs
 * isolation) so that no module-level Map / Set / array leaks from a
 * previous test into the current one.
 *
 * Each step is guarded so that individual test files which `vi.mock()` a
 * module (replacing its exports with stubs) will not cause the entire
 * cleanup to blow up — the missing reset function is simply skipped.
 */
export async function cleanupAllState(): Promise<void> {
  // Helper: call `fn` only if it exists on the imported module.
  const tryReset = async (spec: string, ...fns: string[]): Promise<void> => {
    try {
      const mod = await import(spec);
      for (const fn of fns) {
        if (typeof mod[fn] === "function") {
          await mod[fn]();
        }
      }
    } catch {
      // Module may be mocked or not reachable — skip silently.
    }
  };

  // ---- cache.ts ----------------------------------------------------------
  await tryReset("../cache.js", "resetAllCacheStateForTesting");

  // ---- alerts-poller.ts ---------------------------------------------------
  await tryReset("../alerts-poller.js", "resetAlertsCacheForTesting");

  // ---- authentication.ts -------------------------------------------------
  await tryReset("../middleware/authentication.js", "resetAuthenticationState");

  // ---- api-key-management.ts ---------------------------------------------
  await tryReset("../middleware/api-key-management.js", "clearAllApiKeys");

  // ---- rate-limiter.ts ---------------------------------------------------
  await tryReset("../middleware/rate-limiter.js", "resetRateLimiter");

  // ---- auth-rate-limit.ts ------------------------------------------------
  await tryReset("../middleware/auth-rate-limit.js", "_clearAllRateLimits");

  // ---- authorization-security.ts ------------------------------------------
  await tryReset("../middleware/authorization-security.js", "clearAccessPatterns");

  // ---- audit-log.ts -------------------------------------------------------
  await tryReset("../middleware/audit-log.js", "resetAuditLog");

  // ---- token-encryption.ts ------------------------------------------------
  await tryReset("../middleware/token-encryption.js", "resetEncryptionState");

  // ---- trip-tracking.ts ---------------------------------------------------
  await tryReset("../trip-tracking.js", "resetTripTrackingForTesting");

  // ---- shuttle-matcher.ts -------------------------------------------------
  await tryReset("../shuttle-matcher.js", "resetShuttleCache");

  // ---- delay-detector.ts -------------------------------------------------
  await tryReset("../delay-detector.js", "resetDelayDetector");

  // ---- transformer.ts ------------------------------------------------------
  await tryReset("../transformer.js", "resetTransformerState");

  // ---- context-service.ts -------------------------------------------------
  await tryReset("../context-service.js", "resetContextService");
}

// ---------------------------------------------------------------------------
// CSRF helpers for API tests
// ---------------------------------------------------------------------------

/**
 * Helper to get a CSRF token from the test app.
 * Makes a GET request to /api/csrf-token and extracts the token.
 */
export async function getCsrfToken(app: {
  request(path: string, init?: RequestInit): Promise<Response>;
}): Promise<string> {
  const res = await app.request("/api/csrf-token");
  if (res.status !== 200) {
    throw new Error(`Failed to get CSRF token: ${res.status}`);
  }
  const body = (await res.json()) as { token: string };
  return body.token;
}

/**
 * Helper to make a state-changing request with CSRF token.
 * Gets a fresh token and includes it in the X-CSRF-Token header.
 * Also merges in any provided authentication headers.
 */
export async function requestWithCsrf(
  app: { request(path: string, init?: RequestInit): Promise<Response> },
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getCsrfToken(app);
  return app.request(path, {
    ...options,
    headers: {
      ...options.headers,
      "X-CSRF-Token": token,
    },
  });
}

/**
 * Helper to make an authenticated state-changing request with CSRF token.
 * Combines API key authentication with CSRF protection.
 */
export async function requestWithAuthAndCsrf(
  app: { request(path: string, init?: RequestInit): Promise<Response> },
  path: string,
  authHeaders: { Authorization: string },
  options: RequestInit = {}
): Promise<Response> {
  const token = await getCsrfToken(app);
  return app.request(path, {
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
      "X-CSRF-Token": token,
    },
  });
}
