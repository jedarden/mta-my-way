/**
 * Security store persistence layer.
 *
 * Provides write-through SQLite persistence for the in-memory Maps used by:
 *   - api-key-management.ts  (API_KEY_REGISTRY, API_KEY_LAST_USED, API_KEY_DESCRIPTIONS)
 *   - password-management.ts (passwordResetTokens, passwordHistory, passwordResetAttempts, accountLockouts)
 *   - auth-rate-limit.ts     (rate limit bans, trusted IPs)
 *   - suspicious-activity-notifications.ts (preferences, events, history, templates)
 *
 * Usage:
 *   import { setSecurityDb } from './security/security-db.js';
 *   setSecurityDb(pushDb); // call once after runMigrations()
 *
 * All write functions are no-ops when the DB has not been initialised, so
 * existing unit-tests that never call setSecurityDb() continue to work.
 *
 * Types are defined inline (no imports from middleware modules) to avoid
 * circular-dependency issues — the middleware modules themselves import from
 * this file.
 */

import type Database from "better-sqlite3";

// ── DB singleton ─────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function setSecurityDb(db: Database.Database): void {
  _db = db;
}

export function isSecurityDbReady(): boolean {
  return _db !== null;
}

function db(): Database.Database {
  if (!_db) throw new Error("Security DB not initialised — call setSecurityDb() first");
  return _db;
}

// ── Inline type shapes (mirror the interfaces in middleware modules) ──────────

export interface StoredApiKey {
  keyId: string;
  keyHash: string;
  keySalt: string;
  scope: string;
  role?: string;
  additionalPermissions?: string[];
  owner?: string;
  rateLimitTier: number;
  active: boolean;
  createdAt: number;
  expiresAt: number;
  failedAttempts: number;
  lastFailedAt?: number;
  lockedUntil?: number;
}

export interface StoredApiKeyEntry {
  key: StoredApiKey;
  description?: string;
  lastUsedAt?: number;
}

export interface StoredPasswordResetToken {
  tokenId: string;
  keyId: string;
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  clientIp: string;
  userAgent?: string;
  deviceFingerprint?: string;
}

export interface StoredPasswordHistoryEntry {
  hash: string;
  salt: string;
  timestamp: number;
}

// ── API key registry ──────────────────────────────────────────────────────────

export function loadApiKeyRegistry(): StoredApiKeyEntry[] {
  if (!_db) return [];
  const rows = db().prepare("SELECT * FROM security_api_key_registry").all() as Array<{
    key_id: string;
    key_hash: string;
    key_salt: string;
    scope: string;
    role: string | null;
    additional_permissions: string;
    owner: string | null;
    rate_limit_tier: number;
    active: number;
    created_at: number;
    expires_at: number;
    failed_attempts: number;
    last_failed_at: number | null;
    locked_until: number | null;
    description: string | null;
    last_used_at: number | null;
  }>;

  return rows.map((r) => ({
    key: {
      keyId: r.key_id,
      keyHash: r.key_hash,
      keySalt: r.key_salt,
      scope: r.scope,
      role: r.role ?? undefined,
      additionalPermissions: JSON.parse(r.additional_permissions) as string[],
      owner: r.owner ?? undefined,
      rateLimitTier: r.rate_limit_tier,
      active: r.active === 1,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      failedAttempts: r.failed_attempts,
      lastFailedAt: r.last_failed_at ?? undefined,
      lockedUntil: r.locked_until ?? undefined,
    },
    description: r.description ?? undefined,
    lastUsedAt: r.last_used_at ?? undefined,
  }));
}

export function saveApiKey(key: StoredApiKey, description?: string, lastUsedAt?: number): void {
  if (!_db) return;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_api_key_registry
       (key_id, key_hash, key_salt, scope, role, additional_permissions, owner,
        rate_limit_tier, active, created_at, expires_at, failed_attempts,
        last_failed_at, locked_until, description, last_used_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      key.keyId,
      key.keyHash,
      key.keySalt,
      key.scope,
      key.role ?? null,
      JSON.stringify(key.additionalPermissions ?? []),
      key.owner ?? null,
      key.rateLimitTier,
      key.active ? 1 : 0,
      key.createdAt,
      key.expiresAt,
      key.failedAttempts,
      key.lastFailedAt ?? null,
      key.lockedUntil ?? null,
      description ?? null,
      lastUsedAt ?? null
    );
}

export function updateApiKeyLastUsed(keyId: string, lastUsedAt: number): void {
  if (!_db) return;
  db()
    .prepare("UPDATE security_api_key_registry SET last_used_at = ? WHERE key_id = ?")
    .run(lastUsedAt, keyId);
}

export function deleteApiKey(keyId: string): void {
  if (!_db) return;
  db().prepare("DELETE FROM security_api_key_registry WHERE key_id = ?").run(keyId);
}

// ── Password reset tokens ─────────────────────────────────────────────────────

export function loadPasswordResetTokens(): StoredPasswordResetToken[] {
  if (!_db) return [];
  const now = Date.now();
  const rows = db()
    .prepare("SELECT * FROM security_password_reset_tokens WHERE expires_at > ? AND used = 0")
    .all(now) as Array<{
    token_id: string;
    key_id: string;
    token_hash: string;
    created_at: number;
    expires_at: number;
    used: number;
    client_ip: string;
    user_agent: string | null;
    device_fingerprint: string | null;
  }>;

  return rows.map((r) => ({
    tokenId: r.token_id,
    keyId: r.key_id,
    tokenHash: r.token_hash,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    used: false,
    clientIp: r.client_ip,
    userAgent: r.user_agent ?? undefined,
    deviceFingerprint: r.device_fingerprint ?? undefined,
  }));
}

export function savePasswordResetToken(token: StoredPasswordResetToken): void {
  if (!_db) return;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_password_reset_tokens
       (token_id, key_id, token_hash, created_at, expires_at, used, client_ip, user_agent, device_fingerprint)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      token.tokenId,
      token.keyId,
      token.tokenHash,
      token.createdAt,
      token.expiresAt,
      token.used ? 1 : 0,
      token.clientIp,
      token.userAgent ?? null,
      token.deviceFingerprint ?? null
    );
}

export function markPasswordResetTokenUsed(tokenId: string): void {
  if (!_db) return;
  db()
    .prepare("UPDATE security_password_reset_tokens SET used = 1 WHERE token_id = ?")
    .run(tokenId);
}

export function deletePasswordResetToken(tokenId: string): void {
  if (!_db) return;
  db().prepare("DELETE FROM security_password_reset_tokens WHERE token_id = ?").run(tokenId);
}

export function deletePasswordResetTokensForKey(keyId: string): void {
  if (!_db) return;
  db()
    .prepare("DELETE FROM security_password_reset_tokens WHERE key_id = ? AND used = 0")
    .run(keyId);
}

export function deleteExpiredPasswordResetTokens(): void {
  if (!_db) return;
  db()
    .prepare("DELETE FROM security_password_reset_tokens WHERE expires_at <= ? OR used = 1")
    .run(Date.now());
}

// ── Password history ──────────────────────────────────────────────────────────

export function loadAllPasswordHistory(): Map<string, StoredPasswordHistoryEntry[]> {
  if (!_db) return new Map();
  const rows = db()
    .prepare(
      "SELECT key_id, hash, salt, timestamp FROM security_password_history ORDER BY key_id, timestamp ASC"
    )
    .all() as Array<{ key_id: string; hash: string; salt: string; timestamp: number }>;

  const result = new Map<string, StoredPasswordHistoryEntry[]>();
  for (const row of rows) {
    const entries = result.get(row.key_id) ?? [];
    entries.push({ hash: row.hash, salt: row.salt, timestamp: row.timestamp });
    result.set(row.key_id, entries);
  }
  return result;
}

export function appendPasswordHistory(keyId: string, entry: StoredPasswordHistoryEntry): void {
  if (!_db) return;
  db()
    .prepare(
      "INSERT INTO security_password_history (key_id, hash, salt, timestamp) VALUES (?,?,?,?)"
    )
    .run(keyId, entry.hash, entry.salt, entry.timestamp);
}

export function prunePasswordHistory(keyId: string, maxCount: number): void {
  if (!_db) return;
  const { cnt } = db()
    .prepare("SELECT COUNT(*) AS cnt FROM security_password_history WHERE key_id = ?")
    .get(keyId) as { cnt: number };

  if (cnt > maxCount) {
    const toDelete = cnt - maxCount;
    db()
      .prepare(
        `DELETE FROM security_password_history
         WHERE id IN (
           SELECT id FROM security_password_history
           WHERE key_id = ?
           ORDER BY timestamp ASC
           LIMIT ?
         )`
      )
      .run(keyId, toDelete);
  }
}

export function clearPasswordHistoryForKey(keyId: string): void {
  if (!_db) return;
  db().prepare("DELETE FROM security_password_history WHERE key_id = ?").run(keyId);
}

// ── Password reset attempts ───────────────────────────────────────────────────

export function loadPasswordResetAttempts(): Map<
  string,
  { count: number; resetAt: number; lockedUntil?: number }
> {
  if (!_db) return new Map();
  const now = Date.now();
  const rows = db()
    .prepare(
      `SELECT key, count, reset_at, locked_until
       FROM security_password_reset_attempts
       WHERE reset_at > ? OR (locked_until IS NOT NULL AND locked_until > ?)`
    )
    .all(now, now) as Array<{
    key: string;
    count: number;
    reset_at: number;
    locked_until: number | null;
  }>;

  const result = new Map<string, { count: number; resetAt: number; lockedUntil?: number }>();
  for (const row of rows) {
    result.set(row.key, {
      count: row.count,
      resetAt: row.reset_at,
      lockedUntil: row.locked_until ?? undefined,
    });
  }
  return result;
}

export function savePasswordResetAttempt(
  key: string,
  value: { count: number; resetAt: number; lockedUntil?: number }
): void {
  if (!_db) return;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_password_reset_attempts (key, count, reset_at, locked_until)
       VALUES (?,?,?,?)`
    )
    .run(key, value.count, value.resetAt, value.lockedUntil ?? null);
}

export function deletePasswordResetAttempt(key: string): void {
  if (!_db) return;
  db().prepare("DELETE FROM security_password_reset_attempts WHERE key = ?").run(key);
}

export function deletePasswordResetAttemptsForEmail(email: string): void {
  if (!_db) return;
  db()
    .prepare("DELETE FROM security_password_reset_attempts WHERE key = ? OR key LIKE ?")
    .run(email, `${email}:%`);
}

// ── Account lockouts ──────────────────────────────────────────────────────────

export function loadAccountLockouts(): Map<
  string,
  { lockedUntil: number; reason: string; attempts: number }
> {
  if (!_db) return new Map();
  const now = Date.now();
  const rows = db()
    .prepare(
      "SELECT key_id, locked_until, reason, attempts FROM security_account_lockouts WHERE locked_until > ?"
    )
    .all(now) as Array<{
    key_id: string;
    locked_until: number;
    reason: string;
    attempts: number;
  }>;

  const result = new Map<string, { lockedUntil: number; reason: string; attempts: number }>();
  for (const row of rows) {
    result.set(row.key_id, {
      lockedUntil: row.locked_until,
      reason: row.reason,
      attempts: row.attempts,
    });
  }
  return result;
}

export function saveAccountLockout(
  keyId: string,
  value: { lockedUntil: number; reason: string; attempts: number }
): void {
  if (!_db) return;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_account_lockouts (key_id, locked_until, reason, attempts)
       VALUES (?,?,?,?)`
    )
    .run(keyId, value.lockedUntil, value.reason, value.attempts);
}

export function deleteAccountLockout(keyId: string): void {
  if (!_db) return;
  db().prepare("DELETE FROM security_account_lockouts WHERE key_id = ?").run(keyId);
}

// ── Rate limit bans ───────────────────────────────────────────────────────────

export function loadRateLimitBans(): Map<string, { bannedUntil: number; violationCount: number }> {
  if (!_db) return new Map();
  const now = Date.now();
  const rows = db()
    .prepare(
      "SELECT identifier, banned_until, violation_count FROM security_rate_limit_bans WHERE banned_until > ?"
    )
    .all(now) as Array<{
    identifier: string;
    banned_until: number;
    violation_count: number;
  }>;

  const result = new Map<string, { bannedUntil: number; violationCount: number }>();
  for (const row of rows) {
    result.set(row.identifier, {
      bannedUntil: row.banned_until,
      violationCount: row.violation_count,
    });
  }
  return result;
}

export function saveRateLimitBan(
  identifier: string,
  bannedUntil: number,
  violationCount: number
): void {
  if (!_db) return;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_rate_limit_bans (identifier, banned_until, violation_count)
       VALUES (?,?,?)`
    )
    .run(identifier, bannedUntil, violationCount);
}

export function deleteRateLimitBan(identifier: string): void {
  if (!_db) return;
  db().prepare("DELETE FROM security_rate_limit_bans WHERE identifier = ?").run(identifier);
}

// ── Trusted IPs ───────────────────────────────────────────────────────────────

export function loadTrustedIps(): Set<string> {
  if (!_db) return new Set();
  const rows = db().prepare("SELECT ip FROM security_trusted_ips").all() as Array<{ ip: string }>;
  return new Set(rows.map((r) => r.ip));
}

export function saveTrustedIp(ip: string): void {
  if (!_db) return;
  db()
    .prepare("INSERT OR IGNORE INTO security_trusted_ips (ip, added_at) VALUES (?,?)")
    .run(ip, Date.now());
}

export function deleteTrustedIp(ip: string): void {
  if (!_db) return;
  db().prepare("DELETE FROM security_trusted_ips WHERE ip = ?").run(ip);
}

// ── Notification preferences ──────────────────────────────────────────────────

export function loadNotificationPreferences(): Map<string, Record<string, unknown>> {
  if (!_db) return new Map();
  const rows = db()
    .prepare("SELECT key_id, preferences FROM security_notification_preferences")
    .all() as Array<{ key_id: string; preferences: string }>;

  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    result.set(row.key_id, JSON.parse(row.preferences) as Record<string, unknown>);
  }
  return result;
}

export function saveNotificationPreferences(
  keyId: string,
  preferences: Record<string, unknown>
): void {
  if (!_db) return;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_notification_preferences (key_id, preferences, updated_at)
       VALUES (?,?,?)`
    )
    .run(keyId, JSON.stringify(preferences), Date.now());
}

// ── Recent security events ────────────────────────────────────────────────────

/** Load events from the last {@link maxAgeMs} milliseconds (default 24 h). */
export function loadRecentSecurityEvents(
  maxAgeMs = 24 * 60 * 60 * 1000
): Map<string, Record<string, unknown>[]> {
  if (!_db) return new Map();
  const cutoff = Date.now() - maxAgeMs;
  const rows = db()
    .prepare(
      `SELECT event_id, key_id, event_type, severity, timestamp, event_data
       FROM security_recent_events
       WHERE timestamp > ?
       ORDER BY key_id, timestamp DESC`
    )
    .all(cutoff) as Array<{
    event_id: string;
    key_id: string;
    event_type: string;
    severity: string;
    timestamp: number;
    event_data: string;
  }>;

  const result = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const events = result.get(row.key_id) ?? [];
    events.push({
      eventId: row.event_id,
      keyId: row.key_id,
      type: row.event_type,
      severity: row.severity,
      timestamp: row.timestamp,
      ...(JSON.parse(row.event_data) as Record<string, unknown>),
    });
    result.set(row.key_id, events);
  }
  return result;
}

export function saveSecurityEvent(event: Record<string, unknown>): void {
  if (!_db) return;
  const { eventId, keyId, type, severity, timestamp, ...rest } = event;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_recent_events
       (event_id, key_id, event_type, severity, timestamp, event_data)
       VALUES (?,?,?,?,?,?)`
    )
    .run(
      eventId as string,
      keyId as string,
      type as string,
      severity as string,
      timestamp as number,
      JSON.stringify(rest)
    );
}

export function saveSecurityEventBatch(keyId: string, events: Record<string, unknown>[]): void {
  if (!_db) return;
  const stmt = db().prepare(
    `INSERT OR REPLACE INTO security_recent_events
     (event_id, key_id, event_type, severity, timestamp, event_data)
     VALUES (?,?,?,?,?,?)`
  );
  for (const event of events) {
    const { eventId, keyId: _k, type, severity, timestamp, ...rest } = event;
    stmt.run(
      eventId as string,
      keyId,
      type as string,
      severity as string,
      timestamp as number,
      JSON.stringify(rest)
    );
  }
}

// ── Notification history ──────────────────────────────────────────────────────

export function loadNotificationHistory(): Map<string, Record<string, unknown>[]> {
  if (!_db) return new Map();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = db()
    .prepare("SELECT event_id, results FROM security_notification_history WHERE recorded_at > ?")
    .all(cutoff) as Array<{ event_id: string; results: string }>;

  const result = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    result.set(row.event_id, JSON.parse(row.results) as Record<string, unknown>[]);
  }
  return result;
}

export function saveNotificationHistoryEntry(
  eventId: string,
  keyId: string,
  results: Record<string, unknown>[]
): void {
  if (!_db) return;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_notification_history (event_id, key_id, results, recorded_at)
       VALUES (?,?,?,?)`
    )
    .run(eventId, keyId, JSON.stringify(results), Date.now());
}

// ── Notification templates ────────────────────────────────────────────────────

export function loadNotificationTemplates(): Map<string, Record<string, unknown>> {
  if (!_db) return new Map();
  const rows = db()
    .prepare("SELECT event_type, template_data FROM security_notification_templates")
    .all() as Array<{ event_type: string; template_data: string }>;

  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    result.set(row.event_type, JSON.parse(row.template_data) as Record<string, unknown>);
  }
  return result;
}

export function saveNotificationTemplate(
  eventType: string,
  template: Record<string, unknown>
): void {
  if (!_db) return;
  db()
    .prepare(
      `INSERT OR REPLACE INTO security_notification_templates (event_type, template_data)
       VALUES (?,?)`
    )
    .run(eventType, JSON.stringify(template));
}
