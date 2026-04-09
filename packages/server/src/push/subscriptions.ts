/**
 * Push subscription storage using SQLite (better-sqlite3).
 *
 * Subscriptions are keyed by SHA-256 hash of the endpoint URL.
 * No PII is stored — just the push subscription keys and the user's
 * favorite station/line/direction tuples.
 */

import { createHash } from "node:crypto";
import type {
  MorningScoreMap,
  PushFavoriteTuple,
  PushSubscribeRequest,
  PushSubscriptionRecord,
} from "@mta-my-way/shared";
import Database from "better-sqlite3";
import { logger } from "../observability/logger.js";

// ---------------------------------------------------------------------------
// Database singleton
// ---------------------------------------------------------------------------

let db: Database.Database | null = null;

/**
 * Initialize the push subscriptions database.
 * Must be called before any other function in this module.
 *
 * @param dbPath  Path to the SQLite database file (or ":memory:" for tests)
 */
export function initPushDatabase(dbPath: string): void {
  db = new Database(dbPath);

  // WAL mode for better concurrent read performance
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated
      ON push_subscriptions(updated_at);
  `);

  logger.info("Push database initialized", { path: dbPath });
}

/**
 * Close the database connection.
 */
export function closePushDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the push database instance.
 * Used by other services that need to share this database.
 */
export function getPushDatabase(): Database.Database {
  return getDb();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash of a subscription endpoint.
 */
function hashEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function getDb(): Database.Database {
  if (!db) {
    throw new Error("Push database not initialized. Call initPushDatabase() first.");
  }
  return db;
}

// ---------------------------------------------------------------------------
// CRUD operations
// ---------------------------------------------------------------------------

/**
 * Upsert a push subscription. If a subscription with the same endpoint hash
 * exists, it is updated (favorites and keys may change).
 */
export function upsertSubscription(request: PushSubscribeRequest): {
  success: boolean;
  endpointHash: string;
} {
  const database = getDb();
  const { subscription, favorites, quietHours, morningScores } = request;
  const endpointHash = hashEndpoint(subscription.endpoint);
  const now = new Date().toISOString();

  const stmt = database.prepare(`
    INSERT INTO push_subscriptions (endpoint_hash, endpoint, p256dh, auth, favorites, quiet_hours, morning_scores, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint_hash) DO UPDATE SET
      endpoint = excluded.endpoint,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      favorites = excluded.favorites,
      quiet_hours = excluded.quiet_hours,
      morning_scores = excluded.morning_scores,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    endpointHash,
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth,
    JSON.stringify(favorites),
    JSON.stringify(quietHours ?? { enabled: false, startHour: 22, endHour: 7 }),
    JSON.stringify(morningScores ?? {}),
    now
  );

  return { success: true, endpointHash };
}

/**
 * Remove a push subscription by endpoint.
 */
export function removeSubscription(endpoint: string): boolean {
  const database = getDb();
  const endpointHash = hashEndpoint(endpoint);

  const stmt = database.prepare("DELETE FROM push_subscriptions WHERE endpoint_hash = ?");
  const result = stmt.run(endpointHash);

  return result.changes > 0;
}

/**
 * Get all subscriptions. Used by the matcher and sender.
 */
export function getAllSubscriptions(): PushSubscriptionRecord[] {
  const database = getDb();

  const stmt = database.prepare(
    "SELECT endpoint_hash as endpointHash, endpoint, p256dh, auth, favorites, quiet_hours as quietHours, morning_scores as morningScores, created_at as createdAt, updated_at as updatedAt FROM push_subscriptions"
  );

  return stmt.all() as PushSubscriptionRecord[];
}

/**
 * Get the total number of active subscriptions (for health endpoint).
 */
export function getSubscriptionCount(): number {
  if (!db) return 0;
  const stmt = db.prepare("SELECT COUNT(*) as count FROM push_subscriptions");
  const row = stmt.get() as { count: number };
  return row.count;
}

/**
 * Update the favorites tuples for an existing subscription.
 * Called when the user's favorites change.
 */
export function updateSubscriptionFavorites(
  endpoint: string,
  favorites: PushFavoriteTuple[]
): boolean {
  const database = getDb();
  const endpointHash = hashEndpoint(endpoint);
  const now = new Date().toISOString();

  const stmt = database.prepare(
    "UPDATE push_subscriptions SET favorites = ?, updated_at = ? WHERE endpoint_hash = ?"
  );
  const result = stmt.run(JSON.stringify(favorites), now, endpointHash);

  return result.changes > 0;
}

/**
 * Update quiet hours for an existing subscription.
 */
export function updateSubscriptionQuietHours(
  endpoint: string,
  quietHours: { enabled: boolean; startHour: number; endHour: number }
): boolean {
  const database = getDb();
  const endpointHash = hashEndpoint(endpoint);
  const now = new Date().toISOString();

  const stmt = database.prepare(
    "UPDATE push_subscriptions SET quiet_hours = ?, updated_at = ? WHERE endpoint_hash = ?"
  );
  const result = stmt.run(JSON.stringify(quietHours), now, endpointHash);

  return result.changes > 0;
}

/**
 * Update morning scores for an existing subscription.
 */
export function updateSubscriptionMorningScores(
  endpoint: string,
  morningScores: MorningScoreMap
): boolean {
  const database = getDb();
  const endpointHash = hashEndpoint(endpoint);
  const now = new Date().toISOString();

  const stmt = database.prepare(
    "UPDATE push_subscriptions SET morning_scores = ?, updated_at = ? WHERE endpoint_hash = ?"
  );
  const result = stmt.run(JSON.stringify(morningScores), now, endpointHash);

  return result.changes > 0;
}

/**
 * Remove subscriptions that haven't been updated in the given number of days.
 * Push subscriptions expire; this cleans up stale entries.
 */
export function purgeStaleSubscriptions(maxAgeDays: number = 60): number {
  const database = getDb();

  const stmt = database.prepare(`
    DELETE FROM push_subscriptions
    WHERE date(updated_at) < date('now', '-' || ? || ' days')
  `);

  const result = stmt.run(maxAgeDays);
  return result.changes;
}
