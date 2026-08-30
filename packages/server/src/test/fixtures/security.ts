/**
 * Test fixtures for security/middleware database tables.
 *
 * Provides seed data for testing:
 * - API key registry (api-key-management.ts)
 * - Password reset tokens, history, and rate limits (password-management.ts)
 * - Rate limit bans and trusted IPs (auth-rate-limit.ts)
 * - Notification preferences, events, history, and templates (suspicious-activity-notifications.ts)
 * - Account lockouts
 * - Sessions and OAuth data
 */

import type { Database } from "better-sqlite3";

// ── Type Definitions ─────────────────────────────────────────────────────────────

export interface ApiKeyFixture {
  key_id: string;
  key_hash: string;
  key_salt: string;
  scope: string;
  role?: string;
  additional_permissions: string;
  owner?: string;
  rate_limit_tier: number;
  active: number;
  created_at: number;
  expires_at: number;
  failed_attempts: number;
  last_failed_at?: number;
  locked_until?: number;
  description?: string;
  last_used_at?: number;
}

export interface PasswordResetTokenFixture {
  token_id: string;
  key_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  used: number;
  client_ip: string;
  user_agent?: string;
  device_fingerprint?: string;
}

export interface PasswordHistoryFixture {
  id: number;
  key_id: string;
  hash: string;
  salt: string;
  timestamp: number;
}

export interface PasswordResetAttemptFixture {
  key: string;
  count: number;
  reset_at: number;
  locked_until?: number;
}

export interface AccountLockoutFixture {
  key_id: string;
  locked_until: number;
  reason: string;
  attempts: number;
}

export interface RateLimitBanFixture {
  identifier: string;
  banned_until: number;
  violation_count: number;
}

export interface TrustedIpFixture {
  ip: string;
  added_at: number;
}

export interface NotificationPreferenceFixture {
  key_id: string;
  preferences: string; // JSON string
  updated_at: number;
}

export interface SecurityEventFixture {
  event_id: string;
  key_id: string;
  event_type: string;
  severity: string;
  timestamp: number;
  event_data: string; // JSON string
}

export interface NotificationHistoryFixture {
  event_id: string;
  key_id: string;
  results: string; // JSON string
  recorded_at: number;
}

export interface NotificationTemplateFixture {
  event_type: string;
  template_data: string; // JSON string
}

// ── Seed Data for Common Test Scenarios ───────────────────────────────────────────

const NOW = Date.now();

/**
 * Standard API keys for testing authentication and authorization.
 */
export const standardApiKeys: ApiKeyFixture[] = [
  {
    key_id: "test_read_key_123",
    key_hash: "hash_read_123",
    key_salt: "salt_read_123",
    scope: "read",
    role: null,
    additional_permissions: "[]",
    owner: "test_user",
    rate_limit_tier: 100,
    active: 1,
    created_at: NOW - 86400000, // 1 day ago
    expires_at: NOW + 86400000 * 30, // 30 days from now
    failed_attempts: 0,
    description: "Standard read-only test key",
    last_used_at: NOW - 3600000, // 1 hour ago
  },
  {
    key_id: "test_write_key_456",
    key_hash: "hash_write_456",
    key_salt: "salt_write_456",
    scope: "write",
    role: null,
    additional_permissions: '["admin:impersonate"]',
    owner: "test_user",
    rate_limit_tier: 200,
    active: 1,
    created_at: NOW - 86400000,
    expires_at: NOW + 86400000 * 30,
    failed_attempts: 0,
    description: "Standard write key with admin impersonation permission",
  },
  {
    key_id: "test_admin_key_789",
    key_hash: "hash_admin_789",
    key_salt: "salt_admin_789",
    scope: "admin",
    role: "administrator",
    additional_permissions: '["admin:all", "security:manage"]',
    owner: "admin",
    rate_limit_tier: 1000,
    active: 1,
    created_at: NOW - 86400000 * 7, // 7 days ago
    expires_at: 0, // Never expires
    failed_attempts: 0,
    description: "Admin key with full permissions",
  },
  {
    key_id: "test_expired_key",
    key_hash: "hash_expired",
    key_salt: "salt_expired",
    scope: "read",
    role: null,
    additional_permissions: "[]",
    owner: "test_user",
    rate_limit_tier: 100,
    active: 1,
    created_at: NOW - 86400000 * 60, // 60 days ago
    expires_at: NOW - 86400000, // Expired yesterday
    failed_attempts: 0,
    description: "Expired key for testing expiration logic",
  },
  {
    key_id: "test_locked_key",
    key_hash: "hash_locked",
    key_salt: "salt_locked",
    scope: "write",
    role: null,
    additional_permissions: "[]",
    owner: "test_user",
    rate_limit_tier: 200,
    active: 0, // Inactive/locked
    created_at: NOW - 86400000 * 30,
    expires_at: NOW + 86400000 * 30,
    failed_attempts: 5,
    last_failed_at: NOW - 1800000, // 30 minutes ago
    locked_until: NOW + 3600000, // Locked for 1 more hour
    description: "Locked key due to too many failed attempts",
  },
];

/**
 * Password reset tokens for various scenarios.
 */
export const standardPasswordResetTokens: PasswordResetTokenFixture[] = [
  {
    token_id: "reset_token_valid_123",
    key_id: "test_read_key_123",
    token_hash: "hash_reset_123",
    created_at: NOW - 1800000, // 30 minutes ago
    expires_at: NOW + 1800000, // Expires in 30 minutes
    used: 0,
    client_ip: "192.168.1.100",
    user_agent: "Mozilla/5.0 Test Browser",
    device_fingerprint: "fp_abc123",
  },
  {
    token_id: "reset_token_expired_456",
    key_id: "test_write_key_456",
    token_hash: "hash_reset_456",
    created_at: NOW - 86400000, // 1 day ago
    expires_at: NOW - 3600000, // Expired 1 hour ago
    used: 0,
    client_ip: "192.168.1.101",
    user_agent: "Mozilla/5.0 Test Browser",
  },
  {
    token_id: "reset_token_used_789",
    key_id: "test_admin_key_789",
    token_hash: "hash_reset_789",
    created_at: NOW - 7200000, // 2 hours ago
    expires_at: NOW + 7200000, // Would expire in 2 hours
    used: 1, // Already used
    client_ip: "192.168.1.102",
    device_fingerprint: "fp_def456",
  },
];

/**
 * Password history for testing password reuse prevention.
 */
export const standardPasswordHistory: PasswordHistoryFixture[] = [
  {
    id: 1,
    key_id: "test_read_key_123",
    hash: "old_hash_1",
    salt: "old_salt_1",
    timestamp: NOW - 86400000 * 90, // 90 days ago
  },
  {
    id: 2,
    key_id: "test_read_key_123",
    hash: "old_hash_2",
    salt: "old_salt_2",
    timestamp: NOW - 86400000 * 60, // 60 days ago
  },
  {
    id: 3,
    key_id: "test_read_key_123",
    hash: "old_hash_3",
    salt: "old_salt_3",
    timestamp: NOW - 86400000 * 30, // 30 days ago
  },
  {
    id: 4,
    key_id: "test_write_key_456",
    hash: "old_hash_4",
    salt: "old_salt_4",
    timestamp: NOW - 86400000 * 15, // 15 days ago
  },
];

/**
 * Password reset attempt tracking for rate limiting.
 */
export const standardPasswordResetAttempts: PasswordResetAttemptFixture[] = [
  {
    key: "user@example.com",
    count: 3,
    reset_at: NOW + 3600000, // Resets in 1 hour
  },
  {
    key: "user@example.com:192.168.1.100",
    count: 5,
    reset_at: NOW + 7200000, // Resets in 2 hours
    locked_until: NOW + 3600000, // Locked for 1 more hour
  },
];

/**
 * Account lockouts for testing locked account scenarios.
 */
export const standardAccountLockouts: AccountLockoutFixture[] = [
  {
    key_id: "test_locked_key",
    locked_until: NOW + 3600000, // Locked for 1 more hour
    reason: "Too many failed authentication attempts",
    attempts: 5,
  },
  {
    key_id: "some_other_locked_key",
    locked_until: NOW - 1800000, // Locked until 30 minutes ago (now unlocked)
    reason: "Suspicious activity detected",
    attempts: 10,
  },
];

/**
 * Rate limit bans for testing banned IP/key scenarios.
 */
export const standardRateLimitBans: RateLimitBanFixture[] = [
  {
    identifier: "192.168.1.200",
    banned_until: NOW + 1800000, // Banned for 30 more minutes
    violation_count: 15,
  },
  {
    identifier: "banned_key_abc",
    banned_until: NOW - 3600000, // Ban expired 1 hour ago
    violation_count: 8,
  },
  {
    identifier: "10.0.0.50",
    banned_until: NOW + 86400000, // Banned for 24 hours
    violation_count: 25,
  },
];

/**
 * Trusted IPs that bypass rate limiting.
 */
export const standardTrustedIps: TrustedIpFixture[] = [
  { ip: "127.0.0.1", added_at: NOW - 86400000 * 30 },
  { ip: "::1", added_at: NOW - 86400000 * 30 },
  { ip: "10.0.0.1", added_at: NOW - 86400000 * 7 },
];

/**
 * Notification preferences for testing alert delivery.
 */
export const standardNotificationPreferences: NotificationPreferenceFixture[] = [
  {
    key_id: "test_read_key_123",
    preferences: JSON.stringify({
      emailEnabled: true,
      email: "user@example.com",
      severityThreshold: "warning",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:00",
    }),
    updated_at: NOW - 86400000 * 7,
  },
  {
    key_id: "test_admin_key_789",
    preferences: JSON.stringify({
      emailEnabled: true,
      email: "admin@example.com",
      severityThreshold: "info",
      quietHoursStart: "23:00",
      quietHoursEnd: "07:00",
      allEvents: true,
    }),
    updated_at: NOW - 86400000 * 3,
  },
];

/**
 * Recent security events for testing event correlation and deduplication.
 */
export const standardSecurityEvents: SecurityEventFixture[] = [
  {
    event_id: "event_001",
    key_id: "test_read_key_123",
    event_type: "auth_failure",
    severity: "warning",
    timestamp: NOW - 1800000, // 30 minutes ago
    event_data: JSON.stringify({
      ip: "192.168.1.100",
      reason: "Invalid API key",
      userAgent: "Test Agent/1.0",
    }),
  },
  {
    event_id: "event_002",
    key_id: "test_read_key_123",
    event_type: "auth_failure",
    severity: "warning",
    timestamp: NOW - 900000, // 15 minutes ago
    event_data: JSON.stringify({
      ip: "192.168.1.100",
      reason: "Invalid API key",
      userAgent: "Test Agent/1.0",
    }),
  },
  {
    event_id: "event_003",
    key_id: "test_locked_key",
    event_type: "account_locked",
    severity: "severe",
    timestamp: NOW - 3600000, // 1 hour ago
    event_data: JSON.stringify({
      reason: "Too many failed authentication attempts",
      attempts: 5,
      lockoutDuration: 3600000,
    }),
  },
  {
    event_id: "event_004",
    key_id: "test_admin_key_789",
    event_type: "suspicious_activity",
    severity: "info",
    timestamp: NOW - 7200000, // 2 hours ago
    event_data: JSON.stringify({
      activity: "Unusual access pattern",
      locations: ["10.0.0.1", "10.0.0.2"],
      timeWindow: 300000, // 5 minutes
    }),
  },
];

/**
 * Notification history for testing notification delivery tracking.
 */
export const standardNotificationHistory: NotificationHistoryFixture[] = [
  {
    event_id: "event_001",
    key_id: "test_read_key_123",
    results: JSON.stringify([
      {
        channel: "email",
        status: "delivered",
        timestamp: NOW - 1750000, // 29 minutes 10 seconds ago
        destination: "user@example.com",
      },
    ]),
    recorded_at: NOW - 1750000,
  },
  {
    event_id: "event_003",
    key_id: "test_locked_key",
    results: JSON.stringify([
      {
        channel: "email",
        status: "delivered",
        timestamp: NOW - 3590000,
        destination: "admin@example.com",
      },
      {
        channel: "webhook",
        status: "failed",
        timestamp: NOW - 3580000,
        destination: "https://example.com/webhook",
        error: "Connection timeout",
      },
    ]),
    recorded_at: NOW - 3580000,
  },
];

/**
 * Custom notification templates for testing template customization.
 */
export const standardNotificationTemplates: NotificationTemplateFixture[] = [
  {
    event_type: "auth_failure",
    template_data: JSON.stringify({
      subject: "Authentication Failure Alert",
      body: "Multiple authentication failures detected for your account. If this wasn't you, please secure your account immediately.",
      severity: "warning",
    }),
  },
  {
    event_type: "account_locked",
    template_data: JSON.stringify({
      subject: "Account Locked Notification",
      body: "Your account has been locked due to suspicious activity. Please contact support to regain access.",
      severity: "severe",
    }),
  },
];

// ── Helper Functions ─────────────────────────────────────────────────────────────

/**
 * Seed all standard security fixtures into a test database.
 *
 * This is useful for integration tests that need a realistic starting state.
 *
 * @param db - Database instance
 */
export function seedStandardSecurityFixtures(db: Database): void {
  // Clear existing data
  clearSecurityFixtures(db);

  // Insert seed data
  insertApiKeys(db, standardApiKeys);
  insertPasswordResetTokens(db, standardPasswordResetTokens);
  insertPasswordHistory(db, standardPasswordHistory);
  insertPasswordResetAttempts(db, standardPasswordResetAttempts);
  insertAccountLockouts(db, standardAccountLockouts);
  insertRateLimitBans(db, standardRateLimitBans);
  insertTrustedIps(db, standardTrustedIps);
  insertNotificationPreferences(db, standardNotificationPreferences);
  insertSecurityEvents(db, standardSecurityEvents);
  insertNotificationHistory(db, standardNotificationHistory);
  insertNotificationTemplates(db, standardNotificationTemplates);
}

/**
 * Clear all security fixture data from a test database.
 *
 * @param db - Database instance
 */
export function clearSecurityFixtures(db: Database): void {
  db.exec("DELETE FROM security_api_key_registry");
  db.exec("DELETE FROM security_password_reset_tokens");
  db.exec("DELETE FROM security_password_history");
  db.exec("DELETE FROM security_password_reset_attempts");
  db.exec("DELETE FROM security_account_lockouts");
  db.exec("DELETE FROM security_rate_limit_bans");
  db.exec("DELETE FROM security_trusted_ips");
  db.exec("DELETE FROM security_notification_preferences");
  db.exec("DELETE FROM security_recent_events");
  db.exec("DELETE FROM security_notification_history");
  db.exec("DELETE FROM security_notification_templates");
}

// ── Individual Table Inserters ───────────────────────────────────────────────────

export function insertApiKeys(db: Database, apiKeys: ApiKeyFixture[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_api_key_registry (
      key_id, key_hash, key_salt, scope, role, additional_permissions, owner,
      rate_limit_tier, active, created_at, expires_at, failed_attempts,
      last_failed_at, locked_until, description, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((keys: ApiKeyFixture[]) => {
    for (const key of keys) {
      insert.run(
        key.key_id,
        key.key_hash,
        key.key_salt,
        key.scope,
        key.role ?? null,
        key.additional_permissions,
        key.owner ?? null,
        key.rate_limit_tier,
        key.active,
        key.created_at,
        key.expires_at,
        key.failed_attempts,
        key.last_failed_at ?? null,
        key.locked_until ?? null,
        key.description ?? null,
        key.last_used_at ?? null
      );
    }
  });

  insertMany(apiKeys);
}

export function insertPasswordResetTokens(db: Database, tokens: PasswordResetTokenFixture[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_password_reset_tokens (
      token_id, key_id, token_hash, created_at, expires_at, used,
      client_ip, user_agent, device_fingerprint
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((tokenList: PasswordResetTokenFixture[]) => {
    for (const token of tokenList) {
      insert.run(
        token.token_id,
        token.key_id,
        token.token_hash,
        token.created_at,
        token.expires_at,
        token.used,
        token.client_ip,
        token.user_agent ?? null,
        token.device_fingerprint ?? null
      );
    }
  });

  insertMany(tokens);
}

export function insertPasswordHistory(db: Database, history: PasswordHistoryFixture[]): void {
  const insert = db.prepare(`
    INSERT INTO security_password_history (id, key_id, hash, salt, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((historyList: PasswordHistoryFixture[]) => {
    for (const entry of historyList) {
      insert.run(entry.id, entry.key_id, entry.hash, entry.salt, entry.timestamp);
    }
  });

  insertMany(history);
}

export function insertPasswordResetAttempts(
  db: Database,
  attempts: PasswordResetAttemptFixture[]
): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_password_reset_attempts (key, count, reset_at, locked_until)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction((attemptList: PasswordResetAttemptFixture[]) => {
    for (const attempt of attemptList) {
      insert.run(attempt.key, attempt.count, attempt.reset_at, attempt.locked_until ?? null);
    }
  });

  insertMany(attempts);
}

export function insertAccountLockouts(db: Database, lockouts: AccountLockoutFixture[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_account_lockouts (key_id, locked_until, reason, attempts)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction((lockoutList: AccountLockoutFixture[]) => {
    for (const lockout of lockoutList) {
      insert.run(lockout.key_id, lockout.locked_until, lockout.reason, lockout.attempts);
    }
  });

  insertMany(lockouts);
}

export function insertRateLimitBans(db: Database, bans: RateLimitBanFixture[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_rate_limit_bans (identifier, banned_until, violation_count)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((banList: RateLimitBanFixture[]) => {
    for (const ban of banList) {
      insert.run(ban.identifier, ban.banned_until, ban.violation_count);
    }
  });

  insertMany(bans);
}

export function insertTrustedIps(db: Database, ips: TrustedIpFixture[]): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO security_trusted_ips (ip, added_at)
    VALUES (?, ?)
  `);

  const insertMany = db.transaction((ipList: TrustedIpFixture[]) => {
    for (const ip of ipList) {
      insert.run(ip.ip, ip.added_at);
    }
  });

  insertMany(ips);
}

export function insertNotificationPreferences(
  db: Database,
  prefs: NotificationPreferenceFixture[]
): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_notification_preferences (key_id, preferences, updated_at)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((prefList: NotificationPreferenceFixture[]) => {
    for (const pref of prefList) {
      insert.run(pref.key_id, pref.preferences, pref.updated_at);
    }
  });

  insertMany(prefs);
}

export function insertSecurityEvents(db: Database, events: SecurityEventFixture[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_recent_events (
      event_id, key_id, event_type, severity, timestamp, event_data
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((eventList: SecurityEventFixture[]) => {
    for (const event of eventList) {
      insert.run(
        event.event_id,
        event.key_id,
        event.event_type,
        event.severity,
        event.timestamp,
        event.event_data
      );
    }
  });

  insertMany(events);
}

export function insertNotificationHistory(
  db: Database,
  history: NotificationHistoryFixture[]
): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_notification_history (event_id, key_id, results, recorded_at)
    VALUES (?, ?, ?, ?)
  `);

  const insertMany = db.transaction((historyList: NotificationHistoryFixture[]) => {
    for (const entry of historyList) {
      insert.run(entry.event_id, entry.key_id, entry.results, entry.recorded_at);
    }
  });

  insertMany(history);
}

export function insertNotificationTemplates(
  db: Database,
  templates: NotificationTemplateFixture[]
): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO security_notification_templates (event_type, template_data)
    VALUES (?, ?)
  `);

  const insertMany = db.transaction((templateList: NotificationTemplateFixture[]) => {
    for (const template of templateList) {
      insert.run(template.event_type, template.template_data);
    }
  });

  insertMany(templates);
}

// ── Preset Fixture Scenarios ──────────────────────────────────────────────────────

/**
 * Minimal fixture set for basic authentication tests.
 * Only includes a single valid read API key.
 */
export function seedMinimalAuthFixtures(db: Database): void {
  clearSecurityFixtures(db);
  insertApiKeys(db, [standardApiKeys[0]!]); // test_read_key_123
}

/**
 * Fixture set for testing authorization and RBAC.
 * Includes API keys with different scopes and roles.
 */
export function seedAuthorizationFixtures(db: Database): void {
  clearSecurityFixtures(db);
  insertApiKeys(db, [standardApiKeys[0]!, standardApiKeys[1]!, standardApiKeys[2]!]); // read, write, admin
}

/**
 * Fixture set for testing password reset flow.
 * Includes valid, expired, and used tokens plus rate limiting data.
 */
export function seedPasswordResetFixtures(db: Database): void {
  clearSecurityFixtures(db);
  insertApiKeys(db, [standardApiKeys[0]!, standardApiKeys[1]!, standardApiKeys[2]!]);
  insertPasswordResetTokens(db, standardPasswordResetTokens);
  insertPasswordResetAttempts(db, standardPasswordResetAttempts);
}

/**
 * Fixture set for testing rate limiting and bans.
 * Includes banned IPs, trusted IPs, and rate limit violation history.
 */
export function seedRateLimitFixtures(db: Database): void {
  clearSecurityFixtures(db);
  insertApiKeys(db, [standardApiKeys[0]!]);
  insertRateLimitBans(db, standardRateLimitBans);
  insertTrustedIps(db, standardTrustedIps);
}

/**
 * Fixture set for testing security event correlation and notifications.
 * Includes security events, notification history, preferences, and templates.
 */
export function seedSecurityEventFixtures(db: Database): void {
  clearSecurityFixtures(db);
  insertApiKeys(db, standardApiKeys);
  insertSecurityEvents(db, standardSecurityEvents);
  insertNotificationHistory(db, standardNotificationHistory);
  insertNotificationPreferences(db, standardNotificationPreferences);
  insertNotificationTemplates(db, standardNotificationTemplates);
}

/**
 * Fixture set for testing account lockout scenarios.
 * Includes locked accounts, password history, and lockout reasons.
 */
export function seedAccountLockoutFixtures(db: Database): void {
  clearSecurityFixtures(db);
  insertApiKeys(db, [standardApiKeys[0]!, standardApiKeys[3]!, standardApiKeys[4]!]); // read, expired, locked
  insertAccountLockouts(db, standardAccountLockouts);
  insertPasswordHistory(db, standardPasswordHistory);
}
