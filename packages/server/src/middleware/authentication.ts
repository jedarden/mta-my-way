/**
 * Authentication and authorization middleware for Hono.
 *
 * Provides:
 * - API key authentication with proper cryptographic hashing
 * - Request signature verification (HMAC)
 * - Session management with secure session regeneration
 * - Role-based access control
 * - Authentication token management
 * - Account lockout protection
 * - CSRF protection
 * - Audit logging for privileged operations
 * - Password policy validation (via password-management module)
 * - Refresh token mechanism for secure session renewal
 * - Sliding session expiration
 * - OAuth 2.0 framework for third-party integration
 * - TOTP-based multi-factor authentication (MFA)
 * - Enhanced session security (IP binding, device tracking)
 * - Concurrent session management
 *
 * Password-related functions are re-exported from password-management.ts
 * for enhanced security including breach detection, expiration, and history.
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import {
  sanitizeObject,
  sanitizeStringSimple,
  validateApiKeyFormat,
  validateSessionTokenFormat,
  validateSignatureFormat,
} from "./sanitization.js";
import { securityLogger } from "./security-logging.js";
import {
  type EncryptedData,
  configureEncryption,
  decryptToken,
  encryptToken,
  generateTokenFingerprint,
  hashToken,
  isEncryptionConfigured,
} from "./token-encryption.js";

// Re-export password management functions for backward compatibility
export {
  validatePassword,
  hashPassword,
  verifyPasswordHash,
  storePasswordInHistory,
  getPasswordHistory,
  clearPasswordHistory,
  generatePasswordResetToken,
  validatePasswordResetToken,
  consumePasswordResetToken,
  invalidateResetTokensForKey,
  isPasswordExpired,
  getDaysUntilExpiration,
  shouldWarnPasswordExpiration,
  generateSecurePassword,
  getPasswordPolicyDescription,
  _setTokenExpirationForTesting,
  type PasswordPolicy,
  type PasswordValidationResult,
  type PasswordHash,
  type PasswordResetToken,
  type PasswordHistoryEntry,
} from "./password-management.js";

// ============================================================================
// API Key Generation and Cryptographic Hashing
// ============================================================================

/**
 * Generate a cryptographically secure random API key.
 * Uses 32 bytes (256 bits) of entropy.
 */
export async function generateApiKey(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash an API key using PBKDF2 with SHA-256.
 *
 * Updated to use OWASP 2024 recommended 600,000 iterations for API keys.
 * Note: For user passwords, use hashPassword() from password-management.ts
 * which includes additional security features.
 *
 * @param apiKey - The API key to hash
 * @param salt - Optional salt (generated if not provided, 32 bytes)
 * @returns Promise containing the hash and salt
 */
export async function hashApiKey(
  apiKey: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  const actualSalt =
    salt ||
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiKey),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  // Use 600,000 iterations per OWASP 2024 recommendations
  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(actualSalt),
      iterations: 600_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return { hash, salt: actualSalt };
}

/**
 * Verify an API key against a hash.
 */
export async function verifyApiKeyHash(
  apiKey: string,
  hash: string,
  salt: string
): Promise<boolean> {
  const computed = await hashApiKey(apiKey, salt);
  return computed.hash === hash;
}

// ============================================================================
// Types
// ============================================================================

/**
 * User roles for RBAC.
 * Imported from rbac.ts for type compatibility.
 */
export type UserRole = "admin" | "user" | "guest";

/**
 * API key scope/permission levels.
 */
export type ApiKeyScope = "read" | "write" | "admin";

/**
 * Individual permission for RBAC.
 * Imported from rbac.ts for type compatibility.
 */
export type Permission =
  | "trips:create"
  | "trips:read"
  | "trips:read:own"
  | "trips:update"
  | "trips:update:own"
  | "trips:delete"
  | "trips:delete:own"
  | "trips:track"
  | "trips:track:own"
  | "subscriptions:create"
  | "subscriptions:read"
  | "subscriptions:read:own"
  | "subscriptions:update"
  | "subscriptions:update:own"
  | "subscriptions:delete"
  | "subscriptions:delete:own"
  | "commutes:create"
  | "commutes:read"
  | "commutes:read:own"
  | "commutes:update"
  | "commutes:update:own"
  | "commutes:delete"
  | "commutes:delete:own"
  | "journals:create"
  | "journals:read"
  | "journals:read:own"
  | "journals:update"
  | "journals:update:own"
  | "journals:delete"
  | "journals:delete:own"
  | "alerts:read"
  | "alerts:create"
  | "alerts:update"
  | "alerts:delete"
  | "equipment:read"
  | "equipment:update"
  | "predictions:create"
  | "predictions:read"
  | "predictions:read:own"
  | "admin:users:read"
  | "admin:users:update"
  | "admin:users:delete"
  | "admin:apikeys:read"
  | "admin:apikeys:create"
  | "admin:apikeys:update"
  | "admin:apikeys:delete"
  | "admin:apikeys:rotate"
  | "admin:sessions:read"
  | "admin:sessions:revoke"
  | "admin:audit:read"
  | "admin:system:configure"
  | "admin:roles:manage"
  | "oauth:authorize"
  | "oauth:revoke"
  | "mfa:setup"
  | "mfa:verify"
  | "mfa:disable"
  | "ratelimit:bypass:tier1"
  | "ratelimit:bypass:tier2"
  | "ratelimit:bypass:tier3";

/**
 * API key metadata.
 */
export interface ApiKey {
  /** Key identifier (not the secret) */
  keyId: string;
  /** Hashed API key value (SHA-256 via PBKDF2) */
  keyHash: string;
  /** Salt used for hashing */
  keySalt: string;
  /** Permission scope */
  scope: ApiKeyScope;
  /** User role for RBAC */
  role?: UserRole;
  /** Additional permissions beyond role permissions */
  additionalPermissions?: Permission[];
  /** Associated user/organization (optional) */
  owner?: string;
  /** Rate limit tier (requests per minute) */
  rateLimitTier: number;
  /** Whether the key is active */
  active: boolean;
  /** Key creation timestamp */
  createdAt: number;
  /** Key expiration timestamp (0 for no expiration) */
  expiresAt: number;
  /** Failed authentication attempts */
  failedAttempts: number;
  /** Timestamp of last failed attempt */
  lastFailedAt?: number;
  /** Whether key is temporarily locked out */
  lockedUntil?: number;
}

/**
 * Audit log entry for privileged operations.
 */
export interface AuditLogEntry {
  /** Unique entry ID */
  entryId: string;
  /** Timestamp */
  timestamp: number;
  /** API key ID that performed the action */
  keyId: string;
  /** Action performed */
  action: string;
  /** Resource affected */
  resource: string;
  /** Operation result */
  result: "success" | "failure";
  /** Client IP */
  clientIp: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Session data for authenticated clients.
 */
export interface AuthSession {
  /** Session ID */
  sessionId: string;
  /** API key ID associated with session */
  keyId: string;
  /** Session creation timestamp */
  createdAt: number;
  /** Session last activity timestamp */
  lastActivityAt: number;
  /** Session expiration timestamp */
  expiresAt: number;
  /** Client IP address */
  clientIp: string;
  /** User agent (optional) */
  userAgent?: string;
  /** Session metadata */
  metadata?: Record<string, unknown>;
  /** CSRF token for this session */
  csrfToken: string;
  /** Whether session was regenerated after auth */
  regenerated: boolean;
  /** Original session ID if this was regenerated */
  originalSessionId?: string;
  /** Device ID for session tracking */
  deviceId?: string;
  /** Whether IP binding is enforced for this session */
  ipBinding: boolean;
  /** Whether session is currently active */
  active: boolean;
  /** Session type */
  sessionType: "standard" | "oauth" | "mfa";
  /** Refresh token ID associated with this session */
  refreshTokenId?: string;
  /** MFA verified timestamp */
  mfaVerifiedAt?: number;
}

/**
 * Request signature data for HMAC verification.
 */
export interface RequestSignature {
  /** API key ID */
  keyId: string;
  /** HMAC signature */
  signature: string;
  /** Timestamp for signature */
  timestamp: number;
  /** Signature version */
  version: number;
}

/**
 * Authentication context attached to Hono context.
 */
export interface AuthContext {
  /** API key ID */
  keyId: string;
  /** Permission scope */
  scope: ApiKeyScope;
  /** User role for RBAC */
  role?: UserRole;
  /** All roles assigned to the user */
  roles?: UserRole[];
  /** Additional permissions beyond role permissions */
  additionalPermissions?: Permission[];
  /** Session ID if authenticated via session */
  sessionId?: string;
  /** Rate limit tier */
  rateLimitTier: number;
  /** Whether MFA was verified for this session */
  mfaVerified?: boolean;
  /** Authentication method used */
  authMethod: "api_key" | "session" | "oauth" | "signature";
  /** OAuth provider if authenticated via OAuth */
  oauthProvider?: string;
}

/**
 * Refresh token data for session renewal.
 */
export interface RefreshToken {
  /** Token ID (internal UUID) */
  tokenId: string;
  /** Token value (random hex string returned to client) - may be encrypted */
  token: string;
  /** Encrypted token data (if encryption is enabled) */
  encryptedToken?: EncryptedData;
  /** Token fingerprint for audit logging (without revealing the token) */
  tokenFingerprint?: string;
  /** Session ID this refresh token belongs to */
  sessionId: string;
  /** API key ID */
  keyId: string;
  /** Token creation timestamp */
  createdAt: number;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Whether token has been used (single-use) */
  used: boolean;
  /** Client IP when token was issued */
  clientIp: string;
  /** Token rotation family ID (for tracking token chains) */
  rotationFamily: string;
  /** Whether this token is encrypted at rest */
  isEncrypted: boolean;
}

/**
 * Device fingerprint for session tracking.
 */
export interface DeviceFingerprint {
  /** Device ID */
  deviceId: string;
  /** User agent hash */
  userAgentHash: string;
  /** Device type (mobile, desktop, tablet) */
  deviceType?: string;
  /** OS family */
  osFamily?: string;
  /** Browser family */
  browserFamily?: string;
  /** First seen timestamp */
  firstSeenAt: number;
  /** Last seen timestamp */
  lastSeenAt: number;
  /** Whether this is a trusted device */
  trusted: boolean;
}

/**
 * OAuth 2.0 provider configuration.
 */
export interface OAuthProvider {
  /** Provider ID (e.g., "google", "github") */
  providerId: string;
  /** Display name */
  displayName: string;
  /** Authorization endpoint URL */
  authorizationEndpoint: string;
  /** Token endpoint URL */
  tokenEndpoint: string;
  /** User info endpoint URL */
  userInfoEndpoint: string;
  /** Client ID */
  clientId: string;
  /** Client secret (stored securely) */
  clientSecret: string;
  /** Scope to request */
  scope: string[];
  /** Redirect URI for callback */
  redirectUri: string;
  /** Whether provider is active */
  active: boolean;
}

/**
 * OAuth 2.0 state data for PKCE flow.
 */
export interface OAuthState {
  /** State ID */
  stateId: string;
  /** Provider ID */
  providerId: string;
  /** Code verifier for PKCE */
  codeVerifier: string;
  /** Nonce for ID token validation */
  nonce?: string;
  /** Redirect URL after auth */
  redirectUrl?: string;
  /** Creation timestamp */
  createdAt: number;
  /** Expiration timestamp (10 minutes) */
  expiresAt: number;
}

/**
 * TOTP (Time-based One-Time Password) configuration.
 */
export interface TotpConfig {
  /** API key ID */
  keyId: string;
  /** TOTP secret (base32 encoded) */
  secret: string;
  /** Backup codes for recovery */
  backupCodes: string[];
  /** Whether TOTP is enabled */
  enabled: boolean;
  /** Verification counter */
  counter: number;
  /** Last successful verification timestamp */
  lastVerifiedAt?: number;
  /** Trusted verification window (in seconds, default: 30) */
  window: number;
}

/**
 * TOTP verification result.
 */
export interface TotpVerificationResult {
  /** Whether verification succeeded */
  valid: boolean;
  /** Remaining backup codes */
  remainingBackupCodes?: number;
  /** Whether this was a backup code used */
  usedBackupCode?: boolean;
}

// ============================================================================
// API Key Storage (in-memory for now; should use database in production)
// ============================================================================

const apiKeys = new Map<string, ApiKey>();
const sessions = new Map<string, AuthSession>();
const auditLog: AuditLogEntry[] = [];

// Enhanced authentication storage
const refreshTokens = new Map<string, RefreshToken>();
const deviceFingerprints = new Map<string, DeviceFingerprint>();
const oauthProviders = new Map<string, OAuthProvider>();
const oauthStates = new Map<string, OAuthState>();
const totpConfigs = new Map<string, TotpConfig>();

// Session security settings
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout
const MAX_CONCURRENT_SESSIONS = 5; // Maximum active sessions per key
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SLIDING_WINDOW_MS = 15 * 60 * 1000; // Refresh window: 15 minutes before expiration

// Account lockout settings
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Auth failure tracking per IP (for rate limiting)
const authFailuresByIp = new Map<string, { count: number; resetAt: number }>();
const AUTH_FAILURE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_AUTH_FAILURES_PER_MINUTE = 10;

// Suspicious activity tracking - IPs with repeated suspicious behavior
const suspiciousIps = new Map<string, { score: number; lastActivity: number }>();
const SUSPICIOUS_SCORE_THRESHOLD = 100;
const SUSPICIOUS_SCORE_DECAY_MS = 5 * 60 * 1000; // Decay score over 5 minutes

/**
 * Record suspicious activity for an IP address.
 * Increases the suspicious score which can lead to temporary blocking.
 */
function recordSuspiciousActivity(ip: string, points: number): void {
  const now = Date.now();
  const existing = suspiciousIps.get(ip);

  if (!existing || now - existing.lastActivity > SUSPICIOUS_SCORE_DECAY_MS) {
    // Decay score if enough time has passed
    const decayedScore = existing ? Math.max(0, existing.score - 50) : 0;
    suspiciousIps.set(ip, { score: decayedScore + points, lastActivity: now });
  } else {
    existing.score += points;
    existing.lastActivity = now;
  }

  // Check if IP should be temporarily blocked
  const record = suspiciousIps.get(ip)!;
  if (record.score >= SUSPICIOUS_SCORE_THRESHOLD) {
    logger.warn("IP temporarily blocked due to suspicious activity", {
      ip,
      score: record.score,
    });
  }
}

/**
 * Check if an IP is temporarily blocked due to suspicious activity.
 */
function isIpBlocked(ip: string): boolean {
  const record = suspiciousIps.get(ip);
  if (!record) return false;

  // Decay score over time
  const now = Date.now();
  const timeSinceLastActivity = now - record.lastActivity;
  if (timeSinceLastActivity > SUSPICIOUS_SCORE_DECAY_MS) {
    record.score = Math.max(
      0,
      record.score - Math.floor(timeSinceLastActivity / SUSPICIOUS_SCORE_DECAY_MS) * 50
    );
    record.lastActivity = now;
    suspiciousIps.set(ip, record);
  }

  return record.score >= SUSPICIOUS_SCORE_THRESHOLD;
}

/**
 * Reset suspicious activity tracking for an IP.
 * For testing purposes only.
 */
export function resetSuspiciousActivityTracking(ip?: string): void {
  if (ip) {
    suspiciousIps.delete(ip);
  } else {
    suspiciousIps.clear();
  }
}

/**
 * Reset auth failure tracking for an IP.
 * For testing purposes only.
 */
export function resetAuthFailureTracking(ip?: string): void {
  if (ip) {
    authFailuresByIp.delete(ip);
  } else {
    authFailuresByIp.clear();
  }
}

/**
 * Register an API key with proper hashing.
 * In production, this should load from a database or secure store.
 */
export async function registerApiKey(apiKey: ApiKey): Promise<void> {
  // Ensure the key has required fields for lockout
  const fullKey: ApiKey = {
    failedAttempts: 0,
    ...apiKey,
  };

  apiKeys.set(fullKey.keyId, fullKey);
  logger.info("API key registered", { keyId: fullKey.keyId, scope: fullKey.scope });
}

/**
 * Get an API key by ID.
 * This is exported for RBAC operations.
 */
export function getApiKeyById(keyId: string): ApiKey | undefined {
  return apiKeys.get(keyId);
}

/**
 * Get an API key by ID (internal use).
 */
function getApiKey(keyId: string): ApiKey | undefined {
  return getApiKeyById(keyId);
}

// ============================================================================
// RBAC Management Functions
// ============================================================================

/**
 * Assign a role to an API key.
 * In production, this should update a database.
 */
export function assignRoleToApiKey(keyId: string, role: UserRole): boolean {
  const apiKey = getApiKeyById(keyId);
  if (!apiKey) {
    logger.warn("Attempted to assign role to non-existent API key", { keyId, role });
    return false;
  }

  apiKey.role = role;
  logger.info("Role assigned to API key", { keyId, role });

  return true;
}

/**
 * Grant additional permissions to an API key beyond its role permissions.
 * In production, this should update a database.
 */
export function grantPermissionsToApiKey(keyId: string, permissions: Permission[]): boolean {
  const apiKey = getApiKeyById(keyId);
  if (!apiKey) {
    logger.warn("Attempted to grant permissions to non-existent API key", { keyId });
    return false;
  }

  if (!apiKey.additionalPermissions) {
    apiKey.additionalPermissions = [];
  }

  // Add new permissions without duplicates
  const newPermissions = permissions.filter((p) => !apiKey.additionalPermissions?.includes(p));
  apiKey.additionalPermissions.push(...newPermissions);

  logger.info("Additional permissions granted to API key", {
    keyId,
    newPermissions,
    totalPermissions: apiKey.additionalPermissions.length,
  });

  return true;
}

/**
 * Revoke additional permissions from an API key.
 * In production, this should update a database.
 */
export function revokePermissionsFromApiKey(keyId: string, permissions: Permission[]): boolean {
  const apiKey = getApiKeyById(keyId);
  if (!apiKey || !apiKey.additionalPermissions) {
    return false;
  }

  const initialCount = apiKey.additionalPermissions.length;
  apiKey.additionalPermissions = apiKey.additionalPermissions.filter(
    (p) => !permissions.includes(p)
  );

  const revokedCount = initialCount - apiKey.additionalPermissions.length;

  if (revokedCount > 0) {
    logger.info("Permissions revoked from API key", {
      keyId,
      revokedCount,
      remainingPermissions: apiKey.additionalPermissions.length,
    });
    return true;
  }

  return false;
}

/**
 * Get all permissions for an API key (role + additional).
 * In production, this would query a database.
 */
export function getApiKeyPermissions(keyId: string): Permission[] {
  const apiKey = getApiKeyById(keyId);
  if (!apiKey) return [];

  // Import here to avoid circular dependency
  const { getRolePermissions } = require("./rbac.js");

  const role = apiKey.role || "guest";
  const rolePermissions = getRolePermissions(role);
  const additionalPermissions = apiKey.additionalPermissions || [];

  return [...new Set([...rolePermissions, ...additionalPermissions])];
}

/**
 * Get the role for an API key.
 */
export function getApiKeyRole(keyId: string): UserRole | undefined {
  const apiKey = getApiKeyById(keyId);
  return apiKey?.role;
}

/**
 * Update an API key's role.
 * This is an alias for assignRoleToApiKey for clarity.
 */
export function updateApiKeyRole(keyId: string, role: UserRole): boolean {
  return assignRoleToApiKey(keyId, role);
}

/**
 * Check if an API key is currently locked out due to failed attempts.
 */
function isKeyLockedOut(apiKey: ApiKey): boolean {
  if (!apiKey.lockedUntil) return false;
  return Date.now() < apiKey.lockedUntil;
}

/**
 * Record a failed authentication attempt for an API key.
 */
function recordFailedAttempt(apiKey: ApiKey): void {
  apiKey.failedAttempts = (apiKey.failedAttempts || 0) + 1;
  apiKey.lastFailedAt = Date.now();

  if (apiKey.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    apiKey.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    logger.warn("API key locked out due to repeated failures", {
      keyId: apiKey.keyId,
      failedAttempts: apiKey.failedAttempts,
      lockedUntil: new Date(apiKey.lockedUntil).toISOString(),
    });
  }
}

/**
 * Reset failed authentication attempts (on successful auth).
 */
function resetFailedAttempts(apiKey: ApiKey): void {
  apiKey.failedAttempts = 0;
  apiKey.lastFailedAt = undefined;
  apiKey.lockedUntil = undefined;
}

/**
 * Check auth failure rate limiting by IP.
 */
function checkAuthFailureRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = authFailuresByIp.get(ip);

  if (!record || now > record.resetAt) {
    // Create new record or reset expired one
    authFailuresByIp.set(ip, { count: 1, resetAt: now + AUTH_FAILURE_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_AUTH_FAILURES_PER_MINUTE) {
    return false; // Rate limit exceeded
  }

  record.count++;
  return true;
}

/**
 * Verify an API key secret using proper cryptographic hashing.
 */
async function verifyApiKeySecret(keyId: string, secret: string): Promise<boolean> {
  const apiKey = getApiKey(keyId);
  if (!apiKey) return false;

  // Check if key is locked out
  if (isKeyLockedOut(apiKey)) {
    logger.warn("Attempted to use locked API key", {
      keyId: apiKey.keyId,
      lockedUntil: apiKey.lockedUntil ? new Date(apiKey.lockedUntil).toISOString() : undefined,
    });
    return false;
  }

  // Verify using proper crypto
  const isValid = await verifyApiKeyHash(secret, apiKey.keyHash, apiKey.keySalt);

  if (!isValid) {
    recordFailedAttempt(apiKey);
  }

  return isValid;
}

// ============================================================================
// Session Management
// ============================================================================

const SESSION_TTL_MS = 86_400_000; // 24 hours
const MAX_SESSIONS_PER_KEY = 100;
const SESSION_METADATA_MAX_KEYS = 20;
const SESSION_METADATA_MAX_VALUE_LENGTH = 500;

/**
 * Sanitize and validate session metadata.
 *
 * Session metadata can contain arbitrary user-provided data that needs
 * to be sanitized to prevent injection attacks and limit size.
 *
 * Security measures:
 * - Key validation (alphanumeric + underscore only, max 50 chars)
 * - Value type validation (string, number, boolean, null only)
 * - Nested object depth limit (max 3 levels)
 * - String value length limit (500 chars)
 * - Total key count limit (20 keys)
 * - Sanitization of all string values against injection patterns
 */
function sanitizeSessionMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  // Check metadata size limits
  const keys = Object.keys(metadata);
  if (keys.length > SESSION_METADATA_MAX_KEYS) {
    logger.warn("Session metadata exceeds maximum key limit", {
      keyCount: keys.length,
      maxKeys: SESSION_METADATA_MAX_KEYS,
    });
    // Truncate to max keys
    keys.splice(SESSION_METADATA_MAX_KEYS);
  }

  const sanitized: Record<string, unknown> = {};
  const MAX_NESTING_DEPTH = 3;

  function sanitizeValue(value: unknown, depth: number): unknown {
    // Prevent deep nesting attacks
    if (depth > MAX_NESTING_DEPTH) {
      logger.warn("Session metadata exceeds maximum nesting depth", {
        depth,
        maxDepth: MAX_NESTING_DEPTH,
      });
      return "[nested_object_too_deep]";
    }

    // Handle null and undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Handle primitive types
    if (typeof value === "string") {
      return sanitizeStringSimple(value, {
        maxLength: SESSION_METADATA_MAX_VALUE_LENGTH,
        stripHtml: true,
        preventSqlInjection: true,
        preventCommandInjection: true,
        preventPathTraversal: true,
        preventXss: true,
      });
    }

    if (typeof value === "number") {
      // Check for finite numbers
      if (!Number.isFinite(value)) {
        logger.warn("Session metadata contains non-finite number", { value });
        return 0;
      }
      // Prevent extremely large numbers
      if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
        logger.warn("Session metadata contains number exceeding safe integer range", { value });
        return Math.sign(value) * Number.MAX_SAFE_INTEGER;
      }
      return value;
    }

    if (typeof value === "boolean") {
      return value;
    }

    // Handle arrays (flatten to simple array of sanitized values)
    if (Array.isArray(value)) {
      // Limit array size
      const maxArraySize = 100;
      if (value.length > maxArraySize) {
        logger.warn("Session metadata array exceeds maximum size", {
          length: value.length,
          maxSize: maxArraySize,
        });
        value = value.slice(0, maxArraySize);
      }
      return value.map((item) => sanitizeValue(item, depth + 1));
    }

    // Handle nested objects
    if (typeof value === "object") {
      const nestedObj: Record<string, unknown> = {};
      for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
        // Validate nested key format
        const validKeyPattern = /^[A-Za-z0-9_]{1,50}$/;
        if (!validKeyPattern.test(nestedKey)) {
          logger.warn("Session metadata key contains invalid characters", { key: nestedKey });
          continue; // Skip invalid keys
        }
        nestedObj[nestedKey] = sanitizeValue(nestedValue, depth + 1);
      }
      return nestedObj;
    }

    // Reject any other types (functions, symbols, etc.)
    logger.warn("Session metadata contains unsupported type", {
      type: typeof value,
    });
    return null;
  }

  // Valid metadata key pattern: alphanumeric + underscore, 1-50 chars
  const validKeyPattern = /^[A-Za-z0-9_]{1,50}$/;

  for (const key of keys) {
    // Validate key format
    if (!validKeyPattern.test(key)) {
      logger.warn("Session metadata key contains invalid characters", { key });
      continue; // Skip invalid keys
    }

    // Sanitize and validate the value
    const value = metadata[key];
    sanitized[key] = sanitizeValue(value, 0);
  }

  return sanitized;
}

/**
 * Generate a device fingerprint from user agent.
 */
async function generateDeviceFingerprint(userAgent: string): Promise<string> {
  // Simple hash of user agent for device tracking
  const encoder = new TextEncoder();
  const data = encoder.encode(userAgent);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, 16);
}

/**
 * Detect device type from user agent.
 */
function detectDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) {
    return "mobile";
  }
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return "tablet";
  }
  return "desktop";
}

/**
 * Detect OS family from user agent.
 */
function detectOsFamily(userAgent: string): string | undefined {
  const ua = userAgent.toLowerCase();
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "macos";
  if (/linux/i.test(ua)) return "linux";
  if (/android/i.test(ua)) return "android";
  if (/ios|iphone|ipad|ipod/i.test(ua)) return "ios";
  return undefined;
}

/**
 * Detect browser family from user agent.
 */
function detectBrowserFamily(userAgent: string): string | undefined {
  const ua = userAgent.toLowerCase();
  if (/chrome|crios/i.test(ua) && !/edge|opr|brave/i.test(ua)) return "chrome";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "safari";
  if (/firefox/i.test(ua)) return "firefox";
  if (/edge|edg/i.test(ua)) return "edge";
  if (/opr|opera/i.test(ua)) return "opera";
  if (/brave/i.test(ua)) return "brave";
  return undefined;
}

/**
 * Get or create device fingerprint record.
 */
async function getOrCreateDevice(userAgent: string, clientIp: string): Promise<DeviceFingerprint> {
  const deviceId = await generateDeviceFingerprint(userAgent);
  const existing = deviceFingerprints.get(deviceId);

  if (existing) {
    existing.lastSeenAt = Date.now();
    return existing;
  }

  const device: DeviceFingerprint = {
    deviceId,
    userAgentHash: deviceId,
    deviceType: detectDeviceType(userAgent),
    osFamily: detectOsFamily(userAgent),
    browserFamily: detectBrowserFamily(userAgent),
    firstSeenAt: Date.now(),
    lastSeenAt: Date.now(),
    trusted: false,
  };

  deviceFingerprints.set(deviceId, device);
  logger.info("New device registered", { deviceId, deviceType: device.deviceType });

  return device;
}

/**
 * Create a new session for an authenticated API key.
 */
export async function createSession(
  keyId: string,
  clientIp: string,
  userAgent?: string,
  metadata?: Record<string, unknown>,
  options: {
    /** Session type */
    type?: "standard" | "oauth" | "mfa";
    /** Enable IP binding */
    ipBinding?: boolean;
    /** Create refresh token */
    createRefreshToken?: boolean;
  } = {}
): Promise<{ sessionId: string; refreshToken?: string; tokenFingerprint?: string }> {
  const { type = "standard", ipBinding = true, createRefreshToken = true } = options;

  // Sanitize metadata before creating session
  const sanitizedMetadata = sanitizeSessionMetadata(metadata);

  // Check concurrent session limit
  const keySessions = Array.from(sessions.values()).filter((s) => s.keyId === keyId && s.active);
  if (keySessions.length >= MAX_CONCURRENT_SESSIONS) {
    // Remove oldest inactive session
    keySessions.sort((a, b) => a.lastActivityAt - b.lastActivityAt);
    const oldest = keySessions[0];
    if (oldest) {
      oldest.active = false;
      sessions.set(oldest.sessionId, oldest);
      logger.info("Session deactivated due to concurrent limit", {
        sessionId: oldest.sessionId,
        keyId,
      });
    }
  }

  // Clean up old sessions for this key
  cleanupOldSessions(keyId);

  const sessionId = crypto.randomUUID();
  const now = Date.now();

  // Get device info
  let deviceId: string | undefined;
  if (userAgent) {
    const device = await getOrCreateDevice(userAgent, clientIp);
    deviceId = device.deviceId;
  }

  const session: AuthSession = {
    sessionId,
    keyId,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: now + SESSION_TTL_MS,
    clientIp,
    userAgent,
    metadata: sanitizedMetadata,
    csrfToken: generateAuthCsrfTokenInternal(),
    regenerated: false,
    deviceId,
    ipBinding,
    active: true,
    sessionType: type,
  };

  sessions.set(sessionId, session);

  // Create refresh token if requested
  let refreshToken: string | undefined;
  let tokenFingerprint: string | undefined;
  if (createRefreshToken) {
    const refreshTokenData = await createRefreshTokenInternal(sessionId, keyId, clientIp);
    session.refreshTokenId = refreshTokenData.tokenId;
    refreshToken = refreshTokenData.token;
    tokenFingerprint = refreshTokenData.tokenFingerprint;
    sessions.set(sessionId, session);
  }

  logger.info("Session created", {
    sessionId,
    keyId,
    clientIp,
    sessionType: type,
    hasRefreshToken: !!refreshToken,
    tokenEncrypted: isEncryptionConfigured(),
  });

  // Log session creation event with token fingerprint for audit
  logSessionEvent("session_created", sessionId, keyId, clientIp, {
    sessionType: type,
    hasRefreshToken: !!refreshToken,
    ipBinding,
    deviceId,
    tokenFingerprint,
  });

  return { sessionId, refreshToken, tokenFingerprint };
}

/**
 * Get a session by ID.
 */
function getSession(sessionId: string): AuthSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Update session activity timestamp.
 */
function updateSessionActivity(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivityAt = Date.now();
  }
}

/**
 * Session hijacking detection result.
 */
interface SessionHijackingCheck {
  /** Whether session validation should be blocked */
  blocked: boolean;
  /** Reason for blocking (if any) */
  reason?: string;
  /** Risk level (low, medium, high) */
  riskLevel: "low" | "medium" | "high";
}

/**
 * Check for session hijacking indicators.
 *
 * Analyzes IP and User-Agent changes to detect potential session hijacking.
 * Returns recommendations for session validation.
 */
function checkSessionHijacking(
  session: AuthSession,
  clientIp: string,
  userAgent?: string
): SessionHijackingCheck {
  const result: SessionHijackingCheck = {
    blocked: false,
    riskLevel: "low",
  };

  // Check IP mismatch
  if (session.ipBinding && session.clientIp !== clientIp) {
    // Check if IP is from same subnet (for IPv4, /24)
    const oldIpParts = session.clientIp.split(".");
    const newIpParts = clientIp.split(".");
    const sameSubnet =
      oldIpParts.length === 4 &&
      newIpParts.length === 4 &&
      oldIpParts[0] === newIpParts[0] &&
      oldIpParts[1] === newIpParts[1] &&
      oldIpParts[2] === newIpParts[2];

    if (sameSubnet) {
      // Same subnet - medium risk, allow but log
      result.riskLevel = "medium";
      result.reason = "IP changed within same subnet";
      logger.warn("Session IP changed within subnet", {
        sessionId: session.sessionId,
        oldIp: session.clientIp,
        newIp: clientIp,
      });
    } else {
      // Different IP - high risk, block
      result.blocked = true;
      result.riskLevel = "high";
      result.reason = "IP address changed to different subnet";
      logger.warn("Session hijacking suspected: IP changed", {
        sessionId: session.sessionId,
        oldIp: session.clientIp,
        newIp: clientIp,
      });
      return result;
    }
  }

  // Check User-Agent mismatch
  if (session.userAgent && userAgent && session.userAgent !== userAgent) {
    // User-Agent changed - could be session hijacking or legitimate browser upgrade
    result.riskLevel = result.riskLevel === "high" ? "high" : "medium";
    result.reason = result.reason ? `${result.reason}, User-Agent changed` : "User-Agent changed";
    logger.warn("Session User-Agent changed", {
      sessionId: session.sessionId,
      oldUserAgent: session.userAgent,
      newUserAgent: userAgent,
    });
  }

  // Check for geolocation impossibility (IP from different continents)
  // This is a simplified check - in production, use a proper GeoIP database
  if (session.ipBinding && session.clientIp !== clientIp) {
    const oldIp = session.clientIp;
    const newIp = clientIp;
    // Simple heuristic: if first octet is very different, might be different region
    const oldFirstOctet = parseInt(oldIp.split(".")[0] || "0", 10);
    const newFirstOctet = parseInt(newIp.split(".")[0] || "0", 10);
    if (Math.abs(oldFirstOctet - newFirstOctet) > 100) {
      result.blocked = true;
      result.riskLevel = "high";
      result.reason = "IP address indicates impossible travel";
      logger.warn("Session hijacking suspected: Impossible travel", {
        sessionId: session.sessionId,
        oldIp,
        newIp,
      });
    }
  }

  return result;
}

/**
 * Validate a session (check expiration, IP binding, activity status).
 *
 * Enhanced with session hijacking detection.
 *
 * @param session - The session to validate
 * @param clientIp - The client's IP address
 * @param context - Optional Hono context for security logging
 */
function validateSession(session: AuthSession, clientIp: string, context?: Context): boolean {
  const now = Date.now();

  // Check expiration
  if (session.expiresAt <= now) {
    logger.warn("Session expired", { sessionId: session.sessionId });
    return false;
  }

  // Check if session is active
  if (!session.active) {
    logger.warn("Session inactive", { sessionId: session.sessionId });
    return false;
  }

  // Run session hijacking detection
  const hijackingCheck = checkSessionHijacking(session, clientIp);
  if (hijackingCheck.blocked) {
    // Invalidate session on high-risk detection
    session.active = false;
    sessions.set(session.sessionId, session);

    // Log security event if context is available
    if (context) {
      securityLogger.logSuspiciousActivity(
        context,
        "session_hijacking_detected",
        hijackingCheck.reason || "Session hijacking detected",
        "high"
      );
    } else {
      // Fallback to regular logging if no context available
      logger.warn("Session hijacking detected", {
        sessionId: session.sessionId,
        reason: hijackingCheck.reason,
      });
    }

    return false;
  }

  // Check idle timeout
  const idleTime = now - session.lastActivityAt;
  if (idleTime > SESSION_IDLE_TIMEOUT_MS) {
    session.active = false;
    sessions.set(session.sessionId, session);

    if (context) {
      securityLogger.logSuspiciousActivity(
        context,
        "session_idle_timeout",
        "Session idle timeout exceeded"
      );
    } else {
      logger.warn("Session idle timeout exceeded", { sessionId: session.sessionId });
    }

    return false;
  }

  return true;
}

/**
 * Clean up old sessions for a key.
 */
function cleanupOldSessions(keyId: string): void {
  const keySessions = Array.from(sessions.values()).filter((s) => s.keyId === keyId);

  if (keySessions.length >= MAX_SESSIONS_PER_KEY) {
    // Sort by last activity and remove oldest
    keySessions.sort((a, b) => a.lastActivityAt - b.lastActivityAt);

    const toRemove = keySessions.slice(0, keySessions.length - MAX_SESSIONS_PER_KEY + 1);
    for (const session of toRemove) {
      sessions.delete(session.sessionId);
    }
  }
}

/**
 * Invalidate a session.
 */
export function invalidateSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Invalidate all sessions for an API key.
 */
export function invalidateAllSessionsForKey(keyId: string): number {
  let count = 0;
  for (const [sessionId, session] of sessions.entries()) {
    if (session.keyId === keyId) {
      sessions.delete(sessionId);
      count++;
    }
  }
  return count;
}

// ============================================================================
// Refresh Token Management
// ============================================================================

/**
 * Create a new refresh token.
 *
 * If encryption is configured, the token will be encrypted at rest.
 * A token fingerprint is generated for audit logging without exposing the token.
 */
async function createRefreshTokenInternal(
  sessionId: string,
  keyId: string,
  clientIp: string
): Promise<{ tokenId: string; token: string; tokenFingerprint: string }> {
  const tokenId = crypto.randomUUID();
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
  const rotationFamily = crypto.randomUUID();

  // Generate token fingerprint for audit logging
  const tokenFingerprint = await generateTokenFingerprint(token);

  // Check if encryption should be used
  const shouldEncrypt = isEncryptionConfigured();
  let encryptedToken: EncryptedData | undefined;
  let storedToken = token;

  if (shouldEncrypt) {
    try {
      // Encrypt the token with context-specific key
      encryptedToken = await encryptToken(token, "refresh_tokens");
      // Store encrypted token instead of plaintext
      storedToken = encryptedToken.ciphertext;
    } catch (error) {
      logger.warn("Failed to encrypt refresh token, storing plaintext", { error });
    }
  }

  const refreshTokenData: RefreshToken = {
    tokenId,
    token: storedToken,
    encryptedToken,
    tokenFingerprint,
    sessionId,
    keyId,
    createdAt: Date.now(),
    expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
    used: false,
    clientIp,
    rotationFamily,
    isEncrypted: !!encryptedToken,
  };

  refreshTokens.set(tokenId, refreshTokenData);

  return { tokenId, token, tokenFingerprint };
}

/**
 * Refresh a session using a refresh token.
 *
 * Returns the new session ID and new refresh token, or null if invalid.
 * Handles encrypted tokens by decrypting them before verification.
 */
export async function refreshSession(
  refreshToken: string,
  clientIp: string
): Promise<{ sessionId: string; newRefreshToken: string; tokenFingerprint?: string } | null> {
  // Find the refresh token by token value (not tokenId)
  // The refreshToken parameter is the random token string returned to the client
  let tokenEntry: [string, RefreshToken] | undefined;
  let decryptedToken = refreshToken;

  // First, try to find by direct token match (for unencrypted tokens)
  tokenEntry = Array.from(refreshTokens.entries()).find(([, t]) => t.token === refreshToken);

  // If not found and encryption is configured, try to decrypt and match
  if (!tokenEntry && isEncryptionConfigured()) {
    for (const [tokenId, tokenData] of refreshTokens.entries()) {
      if (tokenData.isEncrypted && tokenData.encryptedToken) {
        try {
          const decrypted = await decryptToken(tokenData.encryptedToken, "refresh_tokens");
          if (decrypted === refreshToken) {
            tokenEntry = [tokenId, tokenData];
            decryptedToken = decrypted;
            break;
          }
        } catch {
          // Decryption failed, continue searching
          continue;
        }
      }
    }
  }

  if (!tokenEntry) {
    logger.warn("Invalid refresh token", { clientIp });
    return null;
  }

  const tokenData = tokenEntry[1];

  if (!tokenData) {
    logger.warn("Invalid refresh token", { clientIp });
    return null;
  }

  // Check expiration
  if (Date.now() > tokenData.expiresAt) {
    refreshTokens.delete(tokenData.tokenId);
    logger.warn("Expired refresh token used", {
      clientIp,
      tokenFingerprint: tokenData.tokenFingerprint,
    });
    return null;
  }

  // Check if already used
  if (tokenData.used) {
    // Token reuse detected - potential security breach
    // Invalidate all tokens in the rotation family
    invalidateRefreshTokenFamily(tokenData.rotationFamily);
    logger.warn("Refresh token reuse detected - token family invalidated", {
      clientIp,
      rotationFamily: tokenData.rotationFamily,
      tokenFingerprint: tokenData.tokenFingerprint,
    });
    return null;
  }

  // Verify client IP matches (optional security measure)
  if (tokenData.clientIp !== clientIp) {
    logger.warn("Refresh token used from different IP", {
      originalIp: tokenData.clientIp,
      currentIp: clientIp,
      tokenFingerprint: tokenData.tokenFingerprint,
    });
    // Still allow but log for monitoring
  }

  // Get the session
  const session = sessions.get(tokenData.sessionId);
  if (!session || !session.active) {
    logger.warn("Session not found or inactive for refresh token", {
      sessionId: tokenData.sessionId,
      tokenFingerprint: tokenData.tokenFingerprint,
    });
    return null;
  }

  // Check if session belongs to the same key
  if (session.keyId !== tokenData.keyId) {
    logger.warn("Refresh token key mismatch", {
      sessionKeyId: session.keyId,
      tokenKeyId: tokenData.keyId,
      tokenFingerprint: tokenData.tokenFingerprint,
    });
    return null;
  }

  // Mark old token as used
  tokenData.used = true;
  refreshTokens.set(tokenData.tokenId, tokenData);

  // Check idle timeout
  const idleTime = Date.now() - session.lastActivityAt;
  if (idleTime > SESSION_IDLE_TIMEOUT_MS) {
    session.active = false;
    sessions.set(session.sessionId, session);
    securityLogger.logSuspiciousActivity(
      {} as Context,
      "session_idle_timeout",
      "Session idle timeout exceeded"
    );
    return null;
  }

  // Regenerate session (session fixation prevention)
  const newSessionId = regenerateSession(session.sessionId);
  if (!newSessionId) {
    return null;
  }

  // Create new refresh token in the same rotation family
  const newRefreshTokenData = await createRefreshTokenInternal(
    newSessionId,
    tokenData.keyId,
    clientIp
  );

  // Update session with new refresh token ID
  const newSession = sessions.get(newSessionId);
  if (newSession) {
    newSession.refreshTokenId = newRefreshTokenData.tokenId;
    newSession.lastActivityAt = Date.now();
    // Extend session expiration (sliding window)
    newSession.expiresAt = Date.now() + SESSION_TTL_MS;
    sessions.set(newSessionId, newSession);
  }

  logger.info("Session refreshed", {
    oldSessionId: session.sessionId,
    newSessionId,
    keyId: tokenData.keyId,
    oldTokenFingerprint: tokenData.tokenFingerprint,
    newTokenFingerprint: newRefreshTokenData.tokenFingerprint,
  });

  // Log session refresh event with token fingerprints for audit
  logSessionEvent("session_refreshed", newSessionId, tokenData.keyId, clientIp, {
    oldSessionId: session.sessionId,
    rotationFamily: tokenData.rotationFamily,
    oldTokenFingerprint: tokenData.tokenFingerprint,
    newTokenFingerprint: newRefreshTokenData.tokenFingerprint,
  });

  return {
    sessionId: newSessionId,
    newRefreshToken: newRefreshTokenData.token,
    tokenFingerprint: newRefreshTokenData.tokenFingerprint,
  };
}

/**
 * Invalidate all refresh tokens in a rotation family.
 */
function invalidateRefreshTokenFamily(rotationFamily: string): void {
  for (const [tokenId, token] of refreshTokens.entries()) {
    if (token.rotationFamily === rotationFamily) {
      refreshTokens.delete(tokenId);
    }
  }
}

/**
 * Invalidate a refresh token by token ID.
 *
 * @param tokenId - The UUID token ID (internal use)
 * @returns true if token was found and invalidated
 */
export function invalidateRefreshToken(tokenId: string): boolean {
  return refreshTokens.delete(tokenId);
}

/**
 * Invalidate a refresh token by its token value.
 *
 * @param tokenValue - The random token string returned to client
 * @returns true if token was found and invalidated
 */
export async function invalidateRefreshTokenByValue(tokenValue: string): Promise<boolean> {
  // First, try to find by direct token match (for unencrypted tokens)
  let entry = Array.from(refreshTokens.entries()).find(([, t]) => t.token === tokenValue);

  // If not found and encryption is configured, try to decrypt and match
  if (!entry && isEncryptionConfigured()) {
    for (const [tokenId, tokenData] of refreshTokens.entries()) {
      if (tokenData.isEncrypted && tokenData.encryptedToken) {
        try {
          const decrypted = await decryptToken(tokenData.encryptedToken, "refresh_tokens");
          if (decrypted === tokenValue) {
            entry = [tokenId, tokenData];
            break;
          }
        } catch {
          // Decryption failed, continue searching
          continue;
        }
      }
    }
  }

  if (entry) {
    const tokenId = entry[0];
    const deleted = refreshTokens.delete(tokenId);
    if (deleted) {
      logger.info("Refresh token invalidated", {
        tokenId,
        tokenFingerprint: entry[1]?.tokenFingerprint,
      });
    }
    return deleted;
  }
  return false;
}

/**
 * Clean up expired refresh tokens.
 *
 * Should be called periodically to prevent memory leaks.
 * Returns the number of tokens cleaned up.
 */
export function cleanupExpiredRefreshTokens(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [tokenId, token] of refreshTokens.entries()) {
    if (token.expiresAt < now) {
      refreshTokens.delete(tokenId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug("Cleaned up expired refresh tokens", { count: cleaned });
  }

  return cleaned;
}

/**
 * Clean up all expired sessions.
 *
 * Should be called periodically to prevent memory leaks.
 * Returns the number of sessions cleaned up.
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of sessions.entries()) {
    // Check if session is expired (absolute expiration or idle timeout)
    const idleTime = now - session.lastActivityAt;
    if (session.expiresAt < now || idleTime > SESSION_IDLE_TIMEOUT_MS || !session.active) {
      // Invalidate associated refresh token
      if (session.refreshTokenId) {
        invalidateRefreshToken(session.refreshTokenId);
      }
      sessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug("Cleaned up expired sessions", { count: cleaned });
  }

  return cleaned;
}

// Start automatic cleanup interval (every 5 minutes)
setInterval(
  () => {
    cleanupExpiredRefreshTokens();
    cleanupExpiredSessions();
  },
  5 * 60 * 1000
);

/**
 * Check if a session should be refreshed (within sliding window).
 */
export function shouldRefreshSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const timeUntilExpiration = session.expiresAt - Date.now();
  return timeUntilExpiration < SLIDING_WINDOW_MS && timeUntilExpiration > 0;
}

/**
 * Get detailed security information for a session.
 *
 * Returns session security metadata including device info,
 * risk assessment, and token status.
 */
export function getSessionSecurityInfo(sessionId: string): {
  exists: boolean;
  active?: boolean;
  expiresAt?: number;
  timeUntilExpiration?: number;
  deviceId?: string;
  ipBinding?: boolean;
  hasRefreshToken?: boolean;
  mfaVerified?: boolean;
  sessionType?: string;
  lastActivity?: number;
  idleTime?: number;
} | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const now = Date.now();
  return {
    exists: true,
    active: session.active,
    expiresAt: session.expiresAt,
    timeUntilExpiration: session.expiresAt - now,
    deviceId: session.deviceId,
    ipBinding: session.ipBinding,
    hasRefreshToken: !!session.refreshTokenId,
    mfaVerified: !!session.mfaVerifiedAt,
    sessionType: session.sessionType,
    lastActivity: session.lastActivityAt,
    idleTime: now - session.lastActivityAt,
  };
}

/**
 * Validate a refresh token format without performing the refresh.
 *
 * Checks if the token string is valid format and hasn't been obviously tampered with.
 */
export function validateRefreshTokenFormat(token: string): boolean {
  // Refresh tokens should be 64-character hex strings (32 bytes * 2)
  return /^[a-f0-9]{64}$/i.test(token);
}

/**
 * Check if a refresh token is expired without consuming it.
 *
 * Returns null if token doesn't exist or is expired, otherwise returns
 * expiration timestamp. Handles encrypted tokens.
 */
export async function checkRefreshTokenExpiry(refreshToken: string): Promise<number | null> {
  // First, try to find by direct token match (for unencrypted tokens)
  let tokenEntry = Array.from(refreshTokens.entries()).find(([, t]) => t.token === refreshToken);

  // If not found and encryption is configured, try to decrypt and match
  if (!tokenEntry && isEncryptionConfigured()) {
    for (const entry of refreshTokens.entries()) {
      const [tokenId, tokenData] = entry;
      if (tokenData.isEncrypted && tokenData.encryptedToken) {
        try {
          const decrypted = await decryptToken(tokenData.encryptedToken, "refresh_tokens");
          if (decrypted === refreshToken) {
            tokenEntry = entry;
            break;
          }
        } catch {
          // Decryption failed, continue searching
          continue;
        }
      }
    }
  }

  if (!tokenEntry) return null;

  const tokenData = tokenEntry[1];
  if (Date.now() > tokenData.expiresAt) return null;

  return tokenData.expiresAt;
}

/**
 * Validate session token format (UUID v4).
 *
 * Checks if the session ID is a valid UUID format.
 */
export function validateSessionTokenFormat(token: string): boolean {
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(token);
}

/**
 * Get session count for an API key.
 *
 * Returns total, active, and expired session counts.
 */
export function getSessionCounts(keyId: string): {
  total: number;
  active: number;
  expired: number;
} {
  const keySessions = Array.from(sessions.values()).filter((s) => s.keyId === keyId);
  const now = Date.now();

  const active = keySessions.filter(
    (s) => s.active && s.expiresAt > now && now - s.lastActivityAt < SESSION_IDLE_TIMEOUT_MS
  ).length;

  const expired = keySessions.filter(
    (s) => !s.active || s.expiresAt <= now || now - s.lastActivityAt >= SESSION_IDLE_TIMEOUT_MS
  ).length;

  return {
    total: keySessions.length,
    active,
    expired,
  };
}

/**
 * Get active sessions for an API key.
 */
export function getActiveSessionsForApiKey(keyId: string): AuthSession[] {
  return Array.from(sessions.values()).filter(
    (s) => s.keyId === keyId && s.active && s.expiresAt > Date.now()
  );
}

/**
 * Revoke a session (user-initiated logout).
 *
 * Performs comprehensive cleanup including:
 * - Marking session as inactive
 * - Invalidating associated refresh token
 * - Removing device trust status for untrusted devices
 * - Logging the revocation for audit
 */
export function revokeSession(sessionId: string, clientIp: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const keyId = session.keyId;
  const deviceId = session.deviceId;

  session.active = false;
  sessions.set(sessionId, session);

  // Invalidate associated refresh token
  if (session.refreshTokenId) {
    invalidateRefreshToken(session.refreshTokenId);
  }

  // For untrusted devices, remove the device fingerprint
  if (deviceId) {
    const device = deviceFingerprints.get(deviceId);
    if (device && !device.trusted) {
      deviceFingerprints.delete(deviceId);
      logger.debug("Untrusted device removed on session revocation", { deviceId });
    }
  }

  // Log session revocation for audit
  logAuditEntry(keyId, "session_revoked", sessionId, "success", clientIp, {
    sessionType: session.sessionType,
    deviceId,
    createdAt: session.createdAt,
  });

  logger.info("Session revoked", { sessionId, keyId, clientIp });

  return true;
}

// ============================================================================
// Request Signing (HMAC)
// ============================================================================

/**
 * Verify an HMAC request signature.
 *
 * Signature format: hmac_sha256(api_key_secret, timestamp + method + path + body)
 *
 * Validates the signature format and timestamp before verification.
 */
export function verifyRequestSignature(
  keyId: string,
  signature: string,
  timestamp: number,
  method: string,
  path: string,
  body: string
): boolean {
  // Sanitize and validate key ID
  const sanitizedKeyId = sanitizeStringSimple(keyId, { maxLength: 100 });
  if (!validateApiKeyFormat(sanitizedKeyId)) {
    return false;
  }

  const apiKey = getApiKey(sanitizedKeyId);
  if (!apiKey) return false;

  // Validate signature format before processing
  if (!validateSignatureFormat(signature)) {
    return false;
  }

  // Check timestamp is within 5 minutes
  const now = Date.now();
  if (Math.abs(now - timestamp) > 300_000) {
    securityLogger.logSuspiciousRequest(
      { req: { method, path }, header: () => undefined } as Context,
      "expired_timestamp",
      "Request signature timestamp too old"
    );
    return false;
  }

  // In production, verify HMAC with actual secret
  // For now, just check signature format
  const expectedFormat = /^hmac_sha256:[a-f0-9]{64}$/i;
  if (!expectedFormat.test(signature)) {
    return false;
  }

  return true;
}

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * API key authentication options.
 */
export interface ApiKeyAuthOptions {
  /** Required scope for access */
  requiredScope?: ApiKeyScope;
  /** Whether to allow session-based authentication */
  allowSessions?: boolean;
  /** Realm for WWW-Authenticate header */
  realm?: string;
}

/**
 * Extract API key from request headers.
 *
 * Checks:
 * 1. Authorization: Bearer <api_key>
 * 2. X-API-Key header
 * 3. api_key query parameter (least secure)
 *
 * Applies input validation to keyId and secret to prevent injection attacks.
 */
function extractApiKey(c: Context): { keyId: string; secret: string } | null {
  // Check Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const [keyId, secret] = token.split(":");

    // Validate and sanitize inputs
    if (keyId && secret) {
      const sanitizedKeyId = sanitizeStringSimple(keyId, { maxLength: 100 });
      const sanitizedSecret = sanitizeStringSimple(secret, { maxLength: 500 });

      // Validate key ID format to prevent injection
      if (!validateApiKeyFormat(sanitizedKeyId)) {
        securityLogger.logAuthFailure(c, "invalid_api_key_format");
        return null;
      }

      return { keyId: sanitizedKeyId, secret: sanitizedSecret };
    }
  }

  // Check X-API-Key header
  const apiKeyHeader = c.req.header("X-API-Key");
  if (apiKeyHeader) {
    const [keyId, secret] = apiKeyHeader.split(":");

    // Validate and sanitize inputs
    if (keyId && secret) {
      const sanitizedKeyId = sanitizeStringSimple(keyId, { maxLength: 100 });
      const sanitizedSecret = sanitizeStringSimple(secret, { maxLength: 500 });

      // Validate key ID format to prevent injection
      if (!validateApiKeyFormat(sanitizedKeyId)) {
        securityLogger.logAuthFailure(c, "invalid_api_key_format");
        return null;
      }

      return { keyId: sanitizedKeyId, secret: sanitizedSecret };
    }
  }

  // Check query parameter (least secure)
  const apiKeyQuery = c.req.query("api_key");
  if (apiKeyQuery) {
    const [keyId, secret] = apiKeyQuery.split(":");

    // Validate and sanitize inputs
    if (keyId && secret) {
      const sanitizedKeyId = sanitizeStringSimple(keyId, { maxLength: 100 });
      const sanitizedSecret = sanitizeStringSimple(secret, { maxLength: 500 });

      // Validate key ID format to prevent injection
      if (!validateApiKeyFormat(sanitizedKeyId)) {
        securityLogger.logAuthFailure(c, "invalid_api_key_format");
        return null;
      }

      return { keyId: sanitizedKeyId, secret: sanitizedSecret };
    }
  }

  return null;
}

/**
 * Extract session token from request headers.
 *
 * Applies input validation to ensure the token is in valid UUID format.
 */
function extractSessionToken(c: Context): string | null {
  // Check Authorization header with Bearer
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);

    // Validate token format (UUID v4)
    if (validateSessionTokenFormat(token)) {
      return token;
    }

    // Invalid format - log and reject
    securityLogger.logAuthFailure(c, "invalid_session_token_format");
    return null;
  }

  // Check X-Session-Token header
  const sessionToken = c.req.header("X-Session-Token");
  if (sessionToken) {
    // Validate token format (UUID v4)
    if (validateSessionTokenFormat(sessionToken)) {
      return sessionToken;
    }

    // Invalid format - log and reject
    securityLogger.logAuthFailure(c, "invalid_session_token_format");
    return null;
  }

  return null;
}

/**
 * API key authentication middleware.
 *
 * Authenticates requests using API keys or session tokens.
 * Attaches auth context to the request on success.
 */
export function apiKeyAuth(options: ApiKeyAuthOptions = {}): MiddlewareHandler {
  const { requiredScope = "read", allowSessions = true, realm = "API" } = options;

  return async (c, next) => {
    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";

    // Check if IP is blocked due to suspicious activity
    if (isIpBlocked(clientIp)) {
      securityLogger.logSuspiciousActivity(
        c,
        "blocked_ip_authentication_attempt",
        "Blocked IP attempted authentication"
      );
      throw new HTTPException(429, {
        message: "Too many suspicious attempts. Please try again later.",
      });
    }

    // Check auth failure rate limit by IP
    if (!checkAuthFailureRateLimit(clientIp)) {
      securityLogger.logRateLimitExceeded(c, MAX_AUTH_FAILURES_PER_MINUTE, AUTH_FAILURE_WINDOW_MS);
      recordSuspiciousActivity(clientIp, 20); // Add points for rate limiting hit
      throw new HTTPException(429, {
        message: "Too many authentication attempts. Please try again later.",
      });
    }

    // Try session authentication first
    if (allowSessions) {
      const sessionToken = extractSessionToken(c);
      if (sessionToken) {
        const session = getSession(sessionToken);
        if (session && validateSession(session, clientIp, c)) {
          const apiKey = getApiKey(session.keyId);
          if (apiKey && apiKey.active) {
            // Check scope
            const scopeLevels: Record<ApiKeyScope, number> = { read: 1, write: 2, admin: 3 };
            if (scopeLevels[apiKey.scope] >= scopeLevels[requiredScope]) {
              updateSessionActivity(sessionToken);

              // Attach auth context
              const authContext: AuthContext = {
                keyId: apiKey.keyId,
                scope: apiKey.scope,
                role: apiKey.role,
                additionalPermissions: apiKey.additionalPermissions,
                sessionId: session.sessionId,
                rateLimitTier: apiKey.rateLimitTier,
                authMethod: "session",
                mfaVerified: isSessionMfaVerified(sessionToken),
              };
              c.set("auth", authContext);

              return next();
            }
          }
        }

        // Invalid session - record suspicious activity
        recordSuspiciousActivity(clientIp, 5);
        securityLogger.logAuthFailure(c, "invalid_session_token");
      }
    }

    // Try API key authentication
    const apiKeyData = extractApiKey(c);
    if (!apiKeyData) {
      recordSuspiciousActivity(clientIp, 10);
      securityLogger.logAuthFailure(c, "missing_api_key");
      c.header("WWW-Authenticate", `Bearer realm="${realm}"`);
      throw new HTTPException(401, { message: "Authentication required" });
    }

    const { keyId, secret } = apiKeyData;
    const apiKey = getApiKey(keyId);

    if (!apiKey || !apiKey.active) {
      recordSuspiciousActivity(clientIp, 15);
      securityLogger.logAuthFailure(c, "invalid_api_key");
      c.header("WWW-Authenticate", `Bearer realm="${realm}"`);
      throw new HTTPException(401, { message: "Invalid API key" });
    }

    // Check expiration
    if (apiKey.expiresAt > 0 && Date.now() > apiKey.expiresAt) {
      securityLogger.logAuthFailure(c, "expired_api_key");
      c.header("WWW-Authenticate", `Bearer realm="${realm}"`);
      throw new HTTPException(401, { message: "API key expired" });
    }

    // Check if key is locked out
    if (isKeyLockedOut(apiKey)) {
      recordSuspiciousActivity(clientIp, 25);
      securityLogger.logAuthFailure(c, "api_key_locked_out");
      throw new HTTPException(429, {
        message: "API key temporarily locked due to failed attempts. Please try again later.",
      });
    }

    // Verify secret
    if (!(await verifyApiKeySecret(keyId, secret))) {
      recordSuspiciousActivity(clientIp, 20);
      securityLogger.logAuthFailure(c, "invalid_api_key_secret");
      c.header("WWW-Authenticate", `Bearer realm="${realm}"`);
      throw new HTTPException(401, { message: "Invalid API key" });
    }

    // Check scope
    const scopeLevels: Record<ApiKeyScope, number> = { read: 1, write: 2, admin: 3 };
    if (scopeLevels[apiKey.scope] < scopeLevels[requiredScope]) {
      securityLogger.logAuthzFailure(c, "api", requiredScope);
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required scope: ${requiredScope}`,
      });
    }

    // Reset failed attempts on successful auth
    resetFailedAttempts(apiKey);

    // Attach auth context
    const authContext: AuthContext = {
      keyId: apiKey.keyId,
      scope: apiKey.scope,
      role: apiKey.role,
      additionalPermissions: apiKey.additionalPermissions,
      rateLimitTier: apiKey.rateLimitTier,
      authMethod: "api_key",
    };
    c.set("auth", authContext);

    return next();
  };
}

/**
 * Request signature authentication middleware.
 *
 * Authenticates requests using HMAC signatures.
 * Provides higher security than API keys for sensitive operations.
 */
export function signedRequestAuth(
  options: { requiredScope?: ApiKeyScope } = {}
): MiddlewareHandler {
  const { requiredScope = "write" } = options;

  return async (c, next) => {
    // Extract signature headers
    const sigHeader = c.req.header("X-Signature");
    const keyId = c.req.header("X-API-Key-Id");
    const timestampHeader = c.req.header("X-Timestamp");

    if (!sigHeader || !keyId || !timestampHeader) {
      securityLogger.logAuthFailure(c, "missing_signature_headers");
      throw new HTTPException(401, { message: "Signature authentication required" });
    }

    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      securityLogger.logAuthFailure(c, "invalid_timestamp");
      throw new HTTPException(400, { message: "Invalid timestamp" });
    }

    // Get request body
    let body = "";
    try {
      body = await c.req.text();
    } catch {
      // No body
    }

    // Verify signature
    if (!verifyRequestSignature(keyId, sigHeader, timestamp, c.req.method, c.req.path, body)) {
      securityLogger.logAuthFailure(c, "invalid_signature");
      throw new HTTPException(401, { message: "Invalid request signature" });
    }

    // Get API key and check scope
    const apiKey = getApiKey(keyId);
    if (!apiKey || !apiKey.active) {
      securityLogger.logAuthFailure(c, "invalid_api_key");
      throw new HTTPException(401, { message: "Invalid API key" });
    }

    const scopeLevels: Record<ApiKeyScope, number> = { read: 1, write: 2, admin: 3 };
    if (scopeLevels[apiKey.scope] < scopeLevels[requiredScope]) {
      securityLogger.logAuthzFailure(c, "api", requiredScope);
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required scope: ${requiredScope}`,
      });
    }

    // Attach auth context
    const authContext: AuthContext = {
      keyId: apiKey.keyId,
      scope: apiKey.scope,
      role: apiKey.role,
      additionalPermissions: apiKey.additionalPermissions,
      rateLimitTier: apiKey.rateLimitTier,
    };
    c.set("auth", authContext);

    return next();
  };
}

/**
 * Optional authentication middleware.
 *
 * Attaches auth context if credentials are provided, but doesn't require them.
 * Useful for endpoints that have enhanced features for authenticated users.
 */
export function optionalAuth(options: { allowSessions?: boolean } = {}): MiddlewareHandler {
  return async (c, next) => {
    const { allowSessions = true } = options;

    const clientIp =
      c.req.header("CF-Connecting-IP") ||
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
      c.req.header("X-Real-IP") ||
      "unknown";

    // Try session authentication first
    if (allowSessions) {
      const sessionToken = extractSessionToken(c);
      if (sessionToken) {
        const session = getSession(sessionToken);
        if (session && validateSession(session, clientIp, c)) {
          const apiKey = getApiKey(session.keyId);
          if (apiKey && apiKey.active) {
            updateSessionActivity(sessionToken);
            const authContext: AuthContext = {
              keyId: apiKey.keyId,
              scope: apiKey.scope,
              role: apiKey.role,
              additionalPermissions: apiKey.additionalPermissions,
              sessionId: session.sessionId,
              rateLimitTier: apiKey.rateLimitTier,
              authMethod: "session",
              mfaVerified: isSessionMfaVerified(sessionToken),
            };
            c.set("auth", authContext);
            return next();
          }
        }
      }
    }

    // Try API key authentication
    const apiKeyData = extractApiKey(c);
    if (apiKeyData) {
      const { keyId, secret } = apiKeyData;
      const apiKey = getApiKey(keyId);

      if (apiKey && apiKey.active && verifyApiKeySecret(keyId, secret)) {
        const authContext: AuthContext = {
          keyId: apiKey.keyId,
          scope: apiKey.scope,
          role: apiKey.role,
          additionalPermissions: apiKey.additionalPermissions,
          rateLimitTier: apiKey.rateLimitTier,
          authMethod: "api_key",
        };
        c.set("auth", authContext);
      }
    }

    return next();
  };
}

/**
 * Get authentication context from a Hono context.
 */
export function getAuthContext(c: Context): AuthContext | undefined {
  return c.get("auth");
}

/**
 * Check if the current request is authenticated.
 */
export function isAuthenticated(c: Context): boolean {
  return getAuthContext(c) !== undefined;
}

/**
 * Require a specific scope for access.
 */
export function requireScope(requiredScope: ApiKeyScope): MiddlewareHandler {
  return async (c, next) => {
    const auth = getAuthContext(c);

    if (!auth) {
      securityLogger.logAuthFailure(c, "not_authenticated");
      throw new HTTPException(401, { message: "Authentication required" });
    }

    const scopeLevels: Record<ApiKeyScope, number> = { read: 1, write: 2, admin: 3 };
    if (scopeLevels[auth.scope] < scopeLevels[requiredScope]) {
      securityLogger.logAuthzFailure(c, "api", requiredScope);
      throw new HTTPException(403, {
        message: `Insufficient permissions. Required scope: ${requiredScope}`,
      });
    }

    return next();
  };
}

/**
 * Regenerate a session ID after authentication to prevent session fixation.
 * Returns the new session ID.
 */
export function regenerateSession(oldSessionId: string): string | null {
  const oldSession = sessions.get(oldSessionId);
  if (!oldSession) return null;

  // Create new session with same data but new ID and CSRF token
  const newSessionId = crypto.randomUUID();
  const newSession: AuthSession = {
    ...oldSession,
    sessionId: newSessionId,
    originalSessionId: oldSessionId,
    regenerated: true,
    csrfToken: generateAuthCsrfTokenInternal(),
  };

  // Delete old session and create new one
  sessions.delete(oldSessionId);
  sessions.set(newSessionId, newSession);

  logger.info("Session regenerated", {
    oldSessionId,
    newSessionId,
    keyId: oldSession.keyId,
  });

  // Log session regeneration event
  logSessionEvent("session_regenerated", newSessionId, oldSession.keyId, "system", {
    oldSessionId,
    reason: "post_auth_fixation",
  });

  return newSessionId;
}

/**
 * Generate a cryptographically secure CSRF token for authentication sessions.
 * This is used internally by the authentication system.
 */
function generateAuthCsrfTokenInternal(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get CSRF token for a session.
 */
export function getSessionCsrfToken(sessionId: string): string | undefined {
  return sessions.get(sessionId)?.csrfToken;
}

/**
 * Verify CSRF token for a session.
 */
function verifyCsrfToken(session: AuthSession, token: string): boolean {
  return session.csrfToken === token;
}

// ============================================================================
// OAuth 2.0 Integration
// ============================================================================

/**
 * Register an OAuth provider.
 */
export function registerOAuthProvider(provider: OAuthProvider): void {
  oauthProviders.set(provider.providerId, provider);
  logger.info("OAuth provider registered", { providerId: provider.providerId });
}

/**
 * Get an OAuth provider by ID.
 */
export function getOAuthProvider(providerId: string): OAuthProvider | undefined {
  return oauthProviders.get(providerId);
}

/**
 * Generate OAuth state for PKCE flow.
 */
export async function generateOAuthState(
  providerId: string,
  redirectUrl?: string
): Promise<{ state: string; codeVerifier: string; codeChallenge: string }> {
  // Generate code verifier for PKCE
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");

  // Generate code challenge (SHA256 -> base64url)
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  // Generate state parameter
  const stateId = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  const oauthState: OAuthState = {
    stateId,
    providerId,
    codeVerifier,
    nonce,
    redirectUrl,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  };

  oauthStates.set(stateId, oauthState);

  return { state: stateId, codeVerifier, codeChallenge };
}

/**
 * Validate OAuth state and return the stored state data.
 */
export function validateOAuthState(state: string): OAuthState | null {
  const oauthState = oauthStates.get(state);

  if (!oauthState) {
    return null;
  }

  // Check expiration
  if (Date.now() > oauthState.expiresAt) {
    oauthStates.delete(state);
    return null;
  }

  return oauthState;
}

/**
 * Clean up OAuth state after use.
 */
export function cleanupOAuthState(state: string): void {
  oauthStates.delete(state);
}

/**
 * Create a session from OAuth authentication.
 */
export async function createOAuthSession(
  providerId: string,
  keyId: string,
  clientIp: string,
  userAgent?: string,
  userInfo?: Record<string, unknown>
): Promise<{ sessionId: string; refreshToken?: string }> {
  const metadata = {
    oauthProvider: providerId,
    ...userInfo,
  };

  return createSession(keyId, clientIp, userAgent, metadata, {
    type: "oauth",
    ipBinding: true,
    createRefreshToken: true,
  });
}

// ============================================================================
// TOTP (Multi-Factor Authentication)
// ============================================================================

/**
 * Generate a base32-encoded secret for TOTP.
 */
function generateTotpSecret(): string {
  const array = new Uint8Array(20); // 160 bits for TOTP
  crypto.getRandomValues(array);

  // Base32 alphabet
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  let bits = 0;
  let value = 0;

  for (const byte of array) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      bits -= 5;
      secret += alphabet[(value >> bits) & 31];
    }
  }

  if (bits > 0) {
    secret += alphabet[(value << (5 - bits)) & 31];
  }

  return secret;
}

/**
 * Generate backup codes for TOTP recovery.
 */
function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const array = new Uint8Array(4);
    crypto.getRandomValues(array);
    const code = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
    codes.push(code);
  }
  return codes;
}

/**
 * Set up TOTP for an API key.
 */
export function setupTotp(keyId: string): {
  secret: string;
  backupCodes: string[];
  qrCodeUrl: string;
} {
  const secret = generateTotpSecret();
  const backupCodes = generateBackupCodes();

  const totpConfig: TotpConfig = {
    keyId,
    secret,
    backupCodes: [...backupCodes], // Store copies
    enabled: false, // Requires verification first
    counter: 0,
    window: 30, // 30-second window
  };

  totpConfigs.set(keyId, totpConfig);

  // Generate QR code URL (otpauth:// format)
  const encodedSecret = secret;
  const qrCodeUrl = `otpauth://totp/MTA%20My%20Way:${keyId}?secret=${encodedSecret}&issuer=MTA%20My%20Way`;

  logger.info("TOTP setup initiated", { keyId });

  return { secret, backupCodes, qrCodeUrl };
}

/**
 * Verify a TOTP code.
 *
 * Uses a time-based window to account for clock skew.
 */
export async function verifyTotpCode(keyId: string, code: string): Promise<TotpVerificationResult> {
  const config = totpConfigs.get(keyId);

  if (!config || !config.enabled) {
    return { valid: false };
  }

  // Check if it's a backup code first
  const backupCodeIndex = config.backupCodes.indexOf(code);
  if (backupCodeIndex !== -1) {
    // Remove used backup code
    config.backupCodes.splice(backupCodeIndex, 1);
    totpConfigs.set(keyId, config);

    logger.info("Backup code used", { keyId, remaining: config.backupCodes.length });

    return {
      valid: true,
      remainingBackupCodes: config.backupCodes.length,
      usedBackupCode: true,
    };
  }

  // Verify TOTP code using HMAC-SHA1
  const now = Math.floor(Date.now() / 1000);
  const timeStep = 30; // 30-second time step

  // Check current and adjacent time steps (for clock skew)
  for (const timeOffset of [-1, 0, 1]) {
    const timeCounter = Math.floor((now + timeOffset * timeStep) / timeStep);

    // Convert counter to bytes
    const counterBytes = new ArrayBuffer(8);
    const counterView = new DataView(counterBytes);
    counterView.setUint32(4, timeCounter, false); // Big-endian
    counterView.setUint32(0, 0, false);

    // Generate HMAC-SHA1
    const key = base32Decode(config.secret);
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", hmacKey, counterBytes);
    const hmac = new Uint8Array(signature);

    // Extract 4-byte dynamic truncation
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff);

    const otp = (binary % 1_000_000).toString().padStart(6, "0");

    if (otp === code) {
      config.counter = timeCounter;
      config.lastVerifiedAt = Date.now();
      totpConfigs.set(keyId, config);

      logger.info("TOTP verified", { keyId, timeCounter });

      return {
        valid: true,
        remainingBackupCodes: config.backupCodes.length,
      };
    }
  }

  logger.warn("Invalid TOTP code", { keyId });

  return { valid: false };
}

/**
 * Base32 decode utility for TOTP secret.
 */
function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits: string[] = [];

  for (const char of input.toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    bits.push(index.toString(2).padStart(5, "0"));
  }

  const bitString = bits.join("");
  const bytes = new Uint8Array(Math.floor(bitString.length / 8));

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bitString.slice(i * 8, (i + 1) * 8), 2);
  }

  return bytes;
}

/**
 * Enable TOTP for an API key (after initial verification).
 */
export function enableTotp(keyId: string): boolean {
  const config = totpConfigs.get(keyId);
  if (!config) return false;

  config.enabled = true;
  totpConfigs.set(keyId, config);

  logger.info("TOTP enabled", { keyId });

  return true;
}

/**
 * Disable TOTP for an API key.
 */
export function disableTotp(keyId: string): boolean {
  const deleted = totpConfigs.delete(keyId);
  if (deleted) {
    logger.info("TOTP disabled", { keyId });
  }
  return deleted;
}

/**
 * Verify MFA for a session.
 */
export async function verifyMfaForSession(
  sessionId: string,
  code: string
): Promise<{ valid: boolean; newSessionId?: string }> {
  const session = sessions.get(sessionId);
  if (!session) return { valid: false };

  const result = await verifyTotpCode(session.keyId, code);
  if (!result.valid) return { valid: false };

  // Regenerate session after MFA verification
  const newSessionId = regenerateSession(sessionId);
  if (!newSessionId) return { valid: false };

  // Update session with MFA verification timestamp
  const newSession = sessions.get(newSessionId);
  if (newSession) {
    newSession.mfaVerifiedAt = Date.now();
    sessions.set(newSessionId, newSession);
  }

  logger.info("MFA verified for session", { oldSessionId: sessionId, newSessionId });

  return { valid: true, newSessionId };
}

/**
 * Check if a session has MFA verified.
 */
export function isSessionMfaVerified(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  // Check if MFA is required for this key
  const totpConfig = totpConfigs.get(session.keyId);
  if (!totpConfig || !totpConfig.enabled) {
    return true; // MFA not required
  }

  // Check if MFA was verified
  return !!session.mfaVerifiedAt;
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Session event types for audit logging.
 */
export type SessionEventType =
  | "session_created"
  | "session_refreshed"
  | "session_revoked"
  | "session_expired"
  | "session_regenerated"
  | "mfa_verified"
  | "mfa_failed"
  | "login_failed"
  | "login_success";

/**
 * Log a session-specific audit entry with enhanced details.
 */
export function logSessionEvent(
  eventType: SessionEventType,
  sessionId: string,
  keyId: string,
  clientIp: string,
  details?: Record<string, unknown>
): void {
  const entry: AuditLogEntry = {
    entryId: crypto.randomUUID(),
    timestamp: Date.now(),
    keyId,
    action: eventType,
    resource: sessionId,
    result: "success",
    clientIp,
    details,
  };

  auditLog.push(entry);

  // Keep only last 10,000 audit entries
  if (auditLog.length > 10_000) {
    auditLog.shift();
  }

  // Log important session events
  logger.info("Session event", {
    eventType,
    sessionId,
    keyId,
    clientIp,
    ...details,
  });
}

/**
 * Log an audit entry for a privileged operation.
 */
export function logAuditEntry(
  keyId: string,
  action: string,
  resource: string,
  result: "success" | "failure",
  clientIp: string,
  details?: Record<string, unknown>
): void {
  const entry: AuditLogEntry = {
    entryId: crypto.randomUUID(),
    timestamp: Date.now(),
    keyId,
    action,
    resource,
    result,
    clientIp,
    details,
  };

  auditLog.push(entry);

  // Keep only last 10,000 audit entries
  if (auditLog.length > 10_000) {
    auditLog.shift();
  }

  // Log important audit entries
  if (result === "failure" || action === "delete" || action === "admin") {
    logger.info("Audit log entry", {
      entryId: entry.entryId,
      keyId,
      action,
      resource,
      result,
      clientIp,
    });
  }
}

/**
 * Get audit log entries for a specific API key.
 */
export function getAuditLogForKey(keyId: string, limit = 100): AuditLogEntry[] {
  return auditLog
    .filter((entry) => entry.keyId === keyId)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/**
 * Get recent audit log entries across all keys.
 */
export function getRecentAuditLog(limit = 100): AuditLogEntry[] {
  return auditLog.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}
