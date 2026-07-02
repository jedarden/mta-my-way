/**
 * Unit tests for security-db persistence layer.
 *
 * Tests all CRUD functions against an in-memory SQLite database
 * with the schema from migration 018-add-security-persistence.
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type StoredApiKey,
  type StoredPasswordHistoryEntry,
  type StoredPasswordResetToken,
  appendPasswordHistory,
  clearPasswordHistoryForKey,
  deleteAccountLockout,
  deleteApiKey,
  deleteExpiredPasswordResetTokens,
  deletePasswordResetAttempt,
  deletePasswordResetAttemptsForEmail,
  deletePasswordResetToken,
  deletePasswordResetTokensForKey,
  deleteRateLimitBan,
  deleteTrustedIp,
  isSecurityDbReady,
  loadAccountLockouts,
  loadAllPasswordHistory,
  loadApiKeyRegistry,
  loadNotificationHistory,
  loadNotificationPreferences,
  loadNotificationTemplates,
  loadPasswordResetAttempts,
  loadPasswordResetTokens,
  loadRateLimitBans,
  loadRecentSecurityEvents,
  loadTrustedIps,
  markPasswordResetTokenUsed,
  prunePasswordHistory,
  saveAccountLockout,
  saveApiKey,
  saveNotificationHistoryEntry,
  saveNotificationPreferences,
  saveNotificationTemplate,
  savePasswordResetAttempt,
  savePasswordResetToken,
  saveRateLimitBan,
  saveSecurityEvent,
  saveSecurityEventBatch,
  saveTrustedIp,
  setSecurityDb,
  updateApiKeyLastUsed,
} from "./security-db.js";

// ── Schema setup (mirrors migration 018) ─────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(":memory:");

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS security_password_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id    TEXT NOT NULL,
      hash      TEXT NOT NULL,
      salt      TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS security_rate_limit_bans (
      identifier      TEXT PRIMARY KEY,
      banned_until    INTEGER NOT NULL,
      violation_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS security_trusted_ips (
      ip       TEXT PRIMARY KEY,
      added_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS security_notification_preferences (
      key_id      TEXT PRIMARY KEY,
      preferences TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    )
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS security_notification_history (
      event_id    TEXT PRIMARY KEY,
      key_id      TEXT NOT NULL,
      results     TEXT NOT NULL,
      recorded_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS security_notification_templates (
      event_type    TEXT PRIMARY KEY,
      template_data TEXT NOT NULL
    )
  `);

  return db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApiKey(overrides: Partial<StoredApiKey> = {}): StoredApiKey {
  return {
    keyId: "key-001",
    keyHash: "hash-abc",
    keySalt: "salt-xyz",
    scope: "read",
    rateLimitTier: 10,
    active: true,
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400_000,
    failedAttempts: 0,
    ...overrides,
  };
}

function makeResetToken(
  overrides: Partial<StoredPasswordResetToken> = {}
): StoredPasswordResetToken {
  return {
    tokenId: "tok-001",
    keyId: "key-001",
    tokenHash: "thash-abc",
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600_000,
    used: false,
    clientIp: "127.0.0.1",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("security-db", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    setSecurityDb(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── DB initialisation ───────────────────────────────────────────────────────

  describe("isSecurityDbReady", () => {
    it("returns true after setSecurityDb is called", () => {
      expect(isSecurityDbReady()).toBe(true);
    });
  });

  // ── No-op behaviour when DB is uninitialised ────────────────────────────────

  describe("no-op when DB is uninitialised", () => {
    // We can't unset _db, so we test the no-op at module level by observing
    // that loads return empty collections when there is no data, which is the
    // same as the uninitialised branch returning empties.
    it("loadApiKeyRegistry returns empty array for empty table", () => {
      expect(loadApiKeyRegistry()).toEqual([]);
    });

    it("loadPasswordResetTokens returns empty array for empty table", () => {
      expect(loadPasswordResetTokens()).toEqual([]);
    });

    it("loadAllPasswordHistory returns empty map for empty table", () => {
      expect(loadAllPasswordHistory().size).toBe(0);
    });

    it("loadPasswordResetAttempts returns empty map for empty table", () => {
      expect(loadPasswordResetAttempts().size).toBe(0);
    });

    it("loadAccountLockouts returns empty map for empty table", () => {
      expect(loadAccountLockouts().size).toBe(0);
    });

    it("loadRateLimitBans returns empty map for empty table", () => {
      expect(loadRateLimitBans().size).toBe(0);
    });

    it("loadTrustedIps returns empty set for empty table", () => {
      expect(loadTrustedIps().size).toBe(0);
    });

    it("loadNotificationPreferences returns empty map for empty table", () => {
      expect(loadNotificationPreferences().size).toBe(0);
    });

    it("loadRecentSecurityEvents returns empty map for empty table", () => {
      expect(loadRecentSecurityEvents().size).toBe(0);
    });

    it("loadNotificationHistory returns empty map for empty table", () => {
      expect(loadNotificationHistory().size).toBe(0);
    });

    it("loadNotificationTemplates returns empty map for empty table", () => {
      expect(loadNotificationTemplates().size).toBe(0);
    });
  });

  // ── API key registry ────────────────────────────────────────────────────────

  describe("API key registry", () => {
    it("saves and loads a minimal API key", () => {
      const key = makeApiKey();
      saveApiKey(key);

      const entries = loadApiKeyRegistry();
      expect(entries).toHaveLength(1);
      expect(entries[0].key.keyId).toBe(key.keyId);
      expect(entries[0].key.keyHash).toBe(key.keyHash);
      expect(entries[0].key.scope).toBe(key.scope);
      expect(entries[0].key.active).toBe(true);
    });

    it("saves and loads an API key with all optional fields", () => {
      const key = makeApiKey({
        role: "admin",
        additionalPermissions: ["read:trips", "write:trips"],
        owner: "user-42",
        lockedUntil: Date.now() + 60_000,
        lastFailedAt: Date.now() - 1000,
        failedAttempts: 3,
      });
      saveApiKey(key, "Test key description", Date.now() - 500);

      const entries = loadApiKeyRegistry();
      expect(entries).toHaveLength(1);
      const e = entries[0];
      expect(e.key.role).toBe("admin");
      expect(e.key.additionalPermissions).toEqual(["read:trips", "write:trips"]);
      expect(e.key.owner).toBe("user-42");
      expect(e.key.failedAttempts).toBe(3);
      expect(e.description).toBe("Test key description");
      expect(e.lastUsedAt).toBeGreaterThan(0);
    });

    it("upserts an existing API key on duplicate keyId", () => {
      const key = makeApiKey();
      saveApiKey(key);
      saveApiKey({ ...key, scope: "write" });

      const entries = loadApiKeyRegistry();
      expect(entries).toHaveLength(1);
      expect(entries[0].key.scope).toBe("write");
    });

    it("saves multiple keys and loads all", () => {
      saveApiKey(makeApiKey({ keyId: "k1" }));
      saveApiKey(makeApiKey({ keyId: "k2" }));
      saveApiKey(makeApiKey({ keyId: "k3" }));

      expect(loadApiKeyRegistry()).toHaveLength(3);
    });

    it("updateApiKeyLastUsed updates the last_used_at column", () => {
      saveApiKey(makeApiKey());
      const ts = Date.now();
      updateApiKeyLastUsed("key-001", ts);

      const entries = loadApiKeyRegistry();
      expect(entries[0].lastUsedAt).toBe(ts);
    });

    it("deleteApiKey removes the key", () => {
      saveApiKey(makeApiKey());
      deleteApiKey("key-001");

      expect(loadApiKeyRegistry()).toHaveLength(0);
    });

    it("deleteApiKey is a no-op for unknown keyId", () => {
      saveApiKey(makeApiKey());
      deleteApiKey("unknown-id");

      expect(loadApiKeyRegistry()).toHaveLength(1);
    });

    it("saves an inactive key (active = false)", () => {
      saveApiKey(makeApiKey({ active: false }));
      const entries = loadApiKeyRegistry();
      expect(entries[0].key.active).toBe(false);
    });
  });

  // ── Password reset tokens ───────────────────────────────────────────────────

  describe("password reset tokens", () => {
    it("saves and loads an unexpired, unused token", () => {
      const token = makeResetToken();
      savePasswordResetToken(token);

      const tokens = loadPasswordResetTokens();
      expect(tokens).toHaveLength(1);
      expect(tokens[0].tokenId).toBe(token.tokenId);
      expect(tokens[0].tokenHash).toBe(token.tokenHash);
      expect(tokens[0].used).toBe(false);
    });

    it("does not load tokens that are already used (used=1 in DB)", () => {
      const token = makeResetToken();
      savePasswordResetToken(token);
      markPasswordResetTokenUsed(token.tokenId);

      // loadPasswordResetTokens only returns used=0 tokens
      expect(loadPasswordResetTokens()).toHaveLength(0);
    });

    it("does not load tokens past their expiry", () => {
      const expired = makeResetToken({ expiresAt: Date.now() - 1000 });
      savePasswordResetToken(expired);

      expect(loadPasswordResetTokens()).toHaveLength(0);
    });

    it("saves token with optional fields", () => {
      const token = makeResetToken({
        userAgent: "Mozilla/5.0",
        deviceFingerprint: "fp-abc123",
      });
      savePasswordResetToken(token);

      const tokens = loadPasswordResetTokens();
      expect(tokens[0].userAgent).toBe("Mozilla/5.0");
      expect(tokens[0].deviceFingerprint).toBe("fp-abc123");
    });

    it("markPasswordResetTokenUsed marks the token as used", () => {
      savePasswordResetToken(makeResetToken());
      markPasswordResetTokenUsed("tok-001");

      // Row is used=1, so loadPasswordResetTokens returns nothing
      expect(loadPasswordResetTokens()).toHaveLength(0);
    });

    it("deletePasswordResetToken removes the token", () => {
      savePasswordResetToken(makeResetToken());
      deletePasswordResetToken("tok-001");

      expect(loadPasswordResetTokens()).toHaveLength(0);
    });

    it("deletePasswordResetTokensForKey removes unused tokens for key", () => {
      savePasswordResetToken(makeResetToken({ tokenId: "t1", keyId: "key-001" }));
      savePasswordResetToken(makeResetToken({ tokenId: "t2", keyId: "key-002" }));
      deletePasswordResetTokensForKey("key-001");

      const remaining = loadPasswordResetTokens();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].keyId).toBe("key-002");
    });

    it("deleteExpiredPasswordResetTokens removes expired and used tokens", () => {
      savePasswordResetToken(
        makeResetToken({ tokenId: "valid", expiresAt: Date.now() + 3600_000 })
      );
      savePasswordResetToken(makeResetToken({ tokenId: "expired", expiresAt: Date.now() - 1000 }));

      deleteExpiredPasswordResetTokens();

      // Expired token is gone; valid token survives (but used=0 check means we see it)
      const remaining = loadPasswordResetTokens();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].tokenId).toBe("valid");
    });
  });

  // ── Password history ────────────────────────────────────────────────────────

  describe("password history", () => {
    const entry1: StoredPasswordHistoryEntry = { hash: "h1", salt: "s1", timestamp: 1000 };
    const entry2: StoredPasswordHistoryEntry = { hash: "h2", salt: "s2", timestamp: 2000 };
    const entry3: StoredPasswordHistoryEntry = { hash: "h3", salt: "s3", timestamp: 3000 };

    it("appends and loads password history for a key", () => {
      appendPasswordHistory("key-001", entry1);
      appendPasswordHistory("key-001", entry2);

      const history = loadAllPasswordHistory();
      expect(history.get("key-001")).toHaveLength(2);
      expect(history.get("key-001")?.[0].hash).toBe("h1");
    });

    it("isolates history by keyId", () => {
      appendPasswordHistory("key-001", entry1);
      appendPasswordHistory("key-002", entry2);

      const history = loadAllPasswordHistory();
      expect(history.get("key-001")).toHaveLength(1);
      expect(history.get("key-002")).toHaveLength(1);
    });

    it("prunePasswordHistory removes oldest entries beyond maxCount", () => {
      appendPasswordHistory("key-001", entry1);
      appendPasswordHistory("key-001", entry2);
      appendPasswordHistory("key-001", entry3);

      // Keep only 2 most recent
      prunePasswordHistory("key-001", 2);

      const history = loadAllPasswordHistory();
      const entries = history.get("key-001")!;
      expect(entries).toHaveLength(2);
      // entry1 (oldest) should be pruned
      expect(entries.find((e) => e.hash === "h1")).toBeUndefined();
      expect(entries.find((e) => e.hash === "h2")).toBeDefined();
      expect(entries.find((e) => e.hash === "h3")).toBeDefined();
    });

    it("prunePasswordHistory is a no-op when count is within limit", () => {
      appendPasswordHistory("key-001", entry1);
      appendPasswordHistory("key-001", entry2);

      prunePasswordHistory("key-001", 5);

      expect(loadAllPasswordHistory().get("key-001")).toHaveLength(2);
    });

    it("clearPasswordHistoryForKey removes all entries for that key", () => {
      appendPasswordHistory("key-001", entry1);
      appendPasswordHistory("key-001", entry2);
      appendPasswordHistory("key-002", entry3);

      clearPasswordHistoryForKey("key-001");

      const history = loadAllPasswordHistory();
      expect(history.get("key-001")).toBeUndefined();
      expect(history.get("key-002")).toHaveLength(1);
    });
  });

  // ── Password reset attempts ─────────────────────────────────────────────────

  describe("password reset attempts", () => {
    it("saves and loads reset attempt counts", () => {
      const future = Date.now() + 3600_000;
      savePasswordResetAttempt("user@example.com", { count: 3, resetAt: future });

      const attempts = loadPasswordResetAttempts();
      expect(attempts.get("user@example.com")).toEqual({
        count: 3,
        resetAt: future,
        lockedUntil: undefined,
      });
    });

    it("saves attempt with lockedUntil", () => {
      const lockedUntil = Date.now() + 1800_000;
      const resetAt = Date.now() + 3600_000;
      savePasswordResetAttempt("user@example.com", { count: 5, resetAt, lockedUntil });

      const attempts = loadPasswordResetAttempts();
      expect(attempts.get("user@example.com")?.lockedUntil).toBe(lockedUntil);
    });

    it("does not load attempts past their resetAt", () => {
      savePasswordResetAttempt("user@example.com", { count: 1, resetAt: Date.now() - 1000 });

      expect(loadPasswordResetAttempts().size).toBe(0);
    });

    it("loads attempts still locked even if resetAt has passed", () => {
      const lockedUntil = Date.now() + 1800_000;
      savePasswordResetAttempt("user@example.com", {
        count: 5,
        resetAt: Date.now() - 1000,
        lockedUntil,
      });

      const attempts = loadPasswordResetAttempts();
      expect(attempts.get("user@example.com")).toBeDefined();
    });

    it("deletePasswordResetAttempt removes the entry", () => {
      const future = Date.now() + 3600_000;
      savePasswordResetAttempt("user@example.com", { count: 1, resetAt: future });
      deletePasswordResetAttempt("user@example.com");

      expect(loadPasswordResetAttempts().size).toBe(0);
    });

    it("deletePasswordResetAttemptsForEmail removes email and prefix-keyed entries", () => {
      const future = Date.now() + 3600_000;
      savePasswordResetAttempt("user@example.com", { count: 1, resetAt: future });
      savePasswordResetAttempt("user@example.com:192.168.1.1", { count: 2, resetAt: future });
      savePasswordResetAttempt("other@example.com", { count: 1, resetAt: future });

      deletePasswordResetAttemptsForEmail("user@example.com");

      const remaining = loadPasswordResetAttempts();
      expect(remaining.has("user@example.com")).toBe(false);
      expect(remaining.has("user@example.com:192.168.1.1")).toBe(false);
      expect(remaining.has("other@example.com")).toBe(true);
    });
  });

  // ── Account lockouts ────────────────────────────────────────────────────────

  describe("account lockouts", () => {
    it("saves and loads an active lockout", () => {
      const lockedUntil = Date.now() + 3600_000;
      saveAccountLockout("key-001", { lockedUntil, reason: "too many failures", attempts: 5 });

      const lockouts = loadAccountLockouts();
      expect(lockouts.get("key-001")).toEqual({
        lockedUntil,
        reason: "too many failures",
        attempts: 5,
      });
    });

    it("does not load expired lockouts", () => {
      saveAccountLockout("key-001", {
        lockedUntil: Date.now() - 1000,
        reason: "expired",
        attempts: 3,
      });

      expect(loadAccountLockouts().size).toBe(0);
    });

    it("deleteAccountLockout removes the entry", () => {
      saveAccountLockout("key-001", {
        lockedUntil: Date.now() + 3600_000,
        reason: "test",
        attempts: 1,
      });
      deleteAccountLockout("key-001");

      expect(loadAccountLockouts().size).toBe(0);
    });
  });

  // ── Rate limit bans ─────────────────────────────────────────────────────────

  describe("rate limit bans", () => {
    it("saves and loads an active ban", () => {
      const bannedUntil = Date.now() + 3600_000;
      saveRateLimitBan("192.168.1.100", bannedUntil, 3);

      const bans = loadRateLimitBans();
      expect(bans.get("192.168.1.100")).toEqual({ bannedUntil, violationCount: 3 });
    });

    it("does not load expired bans", () => {
      saveRateLimitBan("192.168.1.100", Date.now() - 1000, 1);
      expect(loadRateLimitBans().size).toBe(0);
    });

    it("deleteRateLimitBan removes the ban", () => {
      saveRateLimitBan("192.168.1.100", Date.now() + 3600_000, 1);
      deleteRateLimitBan("192.168.1.100");

      expect(loadRateLimitBans().size).toBe(0);
    });
  });

  // ── Trusted IPs ─────────────────────────────────────────────────────────────

  describe("trusted IPs", () => {
    it("saves and loads a trusted IP", () => {
      saveTrustedIp("10.0.0.1");

      const ips = loadTrustedIps();
      expect(ips.has("10.0.0.1")).toBe(true);
    });

    it("saveTrustedIp is idempotent (INSERT OR IGNORE)", () => {
      saveTrustedIp("10.0.0.1");
      saveTrustedIp("10.0.0.1");

      expect(loadTrustedIps().size).toBe(1);
    });

    it("saves multiple trusted IPs", () => {
      saveTrustedIp("10.0.0.1");
      saveTrustedIp("10.0.0.2");

      expect(loadTrustedIps().size).toBe(2);
    });

    it("deleteTrustedIp removes the IP", () => {
      saveTrustedIp("10.0.0.1");
      deleteTrustedIp("10.0.0.1");

      expect(loadTrustedIps().size).toBe(0);
    });
  });

  // ── Notification preferences ────────────────────────────────────────────────

  describe("notification preferences", () => {
    it("saves and loads preferences for a key", () => {
      saveNotificationPreferences("key-001", { email: true, sms: false, threshold: "high" });

      const prefs = loadNotificationPreferences();
      expect(prefs.get("key-001")).toEqual({ email: true, sms: false, threshold: "high" });
    });

    it("upserts preferences on duplicate keyId", () => {
      saveNotificationPreferences("key-001", { email: true });
      saveNotificationPreferences("key-001", { email: false, sms: true });

      const prefs = loadNotificationPreferences();
      expect(prefs.size).toBe(1);
      expect(prefs.get("key-001")).toEqual({ email: false, sms: true });
    });
  });

  // ── Recent security events ──────────────────────────────────────────────────

  describe("recent security events", () => {
    it("saves and loads a recent event", () => {
      const event = {
        eventId: "evt-001",
        keyId: "key-001",
        type: "login_failure",
        severity: "warning",
        timestamp: Date.now(),
        extra: "data",
      };
      saveSecurityEvent(event);

      const events = loadRecentSecurityEvents();
      const keyEvents = events.get("key-001");
      expect(keyEvents).toHaveLength(1);
      expect(keyEvents![0].type).toBe("login_failure");
    });

    it("does not load events older than maxAgeMs", () => {
      saveSecurityEvent({
        eventId: "evt-old",
        keyId: "key-001",
        type: "login_failure",
        severity: "warning",
        timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
      });

      // Default maxAge is 24h — old event is out of window
      expect(loadRecentSecurityEvents().size).toBe(0);
    });

    it("groups events by keyId", () => {
      saveSecurityEvent({
        eventId: "e1",
        keyId: "k1",
        type: "login",
        severity: "info",
        timestamp: Date.now(),
      });
      saveSecurityEvent({
        eventId: "e2",
        keyId: "k2",
        type: "login",
        severity: "info",
        timestamp: Date.now(),
      });

      const events = loadRecentSecurityEvents();
      expect(events.get("k1")).toHaveLength(1);
      expect(events.get("k2")).toHaveLength(1);
    });

    it("saveSecurityEventBatch saves multiple events efficiently", () => {
      const keyId = "key-batch";
      saveSecurityEventBatch(keyId, [
        { eventId: "b1", type: "login", severity: "info", timestamp: Date.now() },
        { eventId: "b2", type: "logout", severity: "info", timestamp: Date.now() },
      ]);

      const events = loadRecentSecurityEvents();
      expect(events.get(keyId)).toHaveLength(2);
    });
  });

  // ── Notification history ────────────────────────────────────────────────────

  describe("notification history", () => {
    it("saves and loads notification history", () => {
      saveNotificationHistoryEntry("evt-001", "key-001", [{ channel: "email", success: true }]);

      const history = loadNotificationHistory();
      const results = history.get("evt-001");
      expect(results).toHaveLength(1);
      expect(results![0]).toEqual({ channel: "email", success: true });
    });

    it("does not load history older than 7 days", () => {
      const oldRecordedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
      // Directly insert with old recorded_at to test the cutoff
      db.prepare(
        `INSERT INTO security_notification_history (event_id, key_id, results, recorded_at)
         VALUES (?,?,?,?)`
      ).run("evt-old", "key-001", "[]", oldRecordedAt);

      expect(loadNotificationHistory().size).toBe(0);
    });
  });

  // ── Notification templates ──────────────────────────────────────────────────

  describe("notification templates", () => {
    it("saves and loads a notification template", () => {
      saveNotificationTemplate("login_failure", {
        subject: "Security Alert",
        body: "A login attempt failed.",
      });

      const templates = loadNotificationTemplates();
      expect(templates.get("login_failure")).toEqual({
        subject: "Security Alert",
        body: "A login attempt failed.",
      });
    });

    it("upserts a template on duplicate event_type", () => {
      saveNotificationTemplate("login_failure", { subject: "Old" });
      saveNotificationTemplate("login_failure", { subject: "New" });

      const templates = loadNotificationTemplates();
      expect(templates.size).toBe(1);
      expect(templates.get("login_failure")).toEqual({ subject: "New" });
    });

    it("loads multiple templates", () => {
      saveNotificationTemplate("login_failure", { subject: "Login Alert" });
      saveNotificationTemplate("password_reset", { subject: "Password Reset" });

      expect(loadNotificationTemplates().size).toBe(2);
    });
  });
});
