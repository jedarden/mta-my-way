/**
 * Migration: Add tables for security middleware store persistence
 *
 * Persists in-memory security stores to SQLite so they survive pod restarts:
 * - API key registry (api-key-management.ts)
 * - Password reset tokens, history, and rate limits (password-management.ts)
 * - Rate limit bans and trusted IPs (auth-rate-limit.ts)
 * - Notification preferences, events, history, and templates (suspicious-activity-notifications.ts)
 */

import type Database from "better-sqlite3";

export const description = "Add SQLite tables for persisting security middleware in-memory stores";

export function up(db: Database.Database): void {
  // ── API key registry ──────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_api_key_registry (
      key_id              TEXT PRIMARY KEY,
      key_hash            TEXT NOT NULL,
      key_salt            TEXT NOT NULL,
      scope               TEXT NOT NULL,
      role                TEXT,
      additional_permissions TEXT NOT NULL DEFAULT '[]',
      owner               TEXT,
      rate_limit_tier     INTEGER NOT NULL DEFAULT 10,
      active              INTEGER NOT NULL DEFAULT 1,
      created_at          INTEGER NOT NULL,
      expires_at          INTEGER NOT NULL,
      failed_attempts     INTEGER NOT NULL DEFAULT 0,
      last_failed_at      INTEGER,
      locked_until        INTEGER,
      description         TEXT,
      last_used_at        INTEGER
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sakr_active ON security_api_key_registry(active)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sakr_scope  ON security_api_key_registry(scope)`);

  // ── Password reset tokens ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_password_reset_tokens (
      token_id          TEXT PRIMARY KEY,
      key_id            TEXT NOT NULL,
      token_hash        TEXT NOT NULL,
      created_at        INTEGER NOT NULL,
      expires_at        INTEGER NOT NULL,
      used              INTEGER NOT NULL DEFAULT 0,
      client_ip         TEXT NOT NULL,
      user_agent        TEXT,
      device_fingerprint TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sprt_key_id  ON security_password_reset_tokens(key_id)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_sprt_expires ON security_password_reset_tokens(expires_at)`
  );

  // ── Password history ──────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_password_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id    TEXT NOT NULL,
      hash      TEXT NOT NULL,
      salt      TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sph_key_id ON security_password_history(key_id)`);

  // ── Password reset attempts & account lockouts ────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_password_reset_attempts (
      key         TEXT PRIMARY KEY,
      count       INTEGER NOT NULL,
      reset_at    INTEGER NOT NULL,
      locked_until INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS security_account_lockouts (
      key_id      TEXT PRIMARY KEY,
      locked_until INTEGER NOT NULL,
      reason      TEXT NOT NULL,
      attempts    INTEGER NOT NULL
    )
  `);

  // ── Rate limit bans (banned IPs/keys only) ────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_rate_limit_bans (
      identifier      TEXT PRIMARY KEY,
      banned_until    INTEGER NOT NULL,
      violation_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  // ── Trusted IPs ───────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_trusted_ips (
      ip       TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL
    )
  `);

  // ── Notification preferences ──────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_notification_preferences (
      key_id      TEXT PRIMARY KEY,
      preferences TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `);

  // ── Recent security events (deduplication window) ─────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_recent_events (
      event_id   TEXT PRIMARY KEY,
      key_id     TEXT NOT NULL,
      event_type TEXT NOT NULL,
      severity   TEXT NOT NULL,
      timestamp  INTEGER NOT NULL,
      event_data TEXT NOT NULL DEFAULT '{}'
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sre_key_id    ON security_recent_events(key_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sre_timestamp ON security_recent_events(timestamp)`);

  // ── Notification delivery history ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_notification_history (
      event_id    TEXT PRIMARY KEY,
      key_id      TEXT NOT NULL,
      results     TEXT NOT NULL,
      recorded_at INTEGER NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_snh_key_id ON security_notification_history(key_id)`);

  // ── Custom notification templates ─────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS security_notification_templates (
      event_type    TEXT PRIMARY KEY,
      template_data TEXT NOT NULL
    )
  `);
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS security_notification_templates`);
  db.exec(`DROP TABLE IF EXISTS security_notification_history`);
  db.exec(`DROP TABLE IF EXISTS security_recent_events`);
  db.exec(`DROP TABLE IF EXISTS security_notification_preferences`);
  db.exec(`DROP TABLE IF EXISTS security_trusted_ips`);
  db.exec(`DROP TABLE IF EXISTS security_rate_limit_bans`);
  db.exec(`DROP TABLE IF EXISTS security_account_lockouts`);
  db.exec(`DROP TABLE IF EXISTS security_password_reset_attempts`);
  db.exec(`DROP TABLE IF EXISTS security_password_history`);
  db.exec(`DROP TABLE IF EXISTS security_password_reset_tokens`);
  db.exec(`DROP TABLE IF EXISTS security_api_key_registry`);
}
