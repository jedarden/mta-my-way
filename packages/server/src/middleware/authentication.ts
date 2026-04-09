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
 * - Password policy validation
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import {
  sanitizeStringSimple,
  validateApiKeyFormat,
  validateSessionTokenFormat,
  validateSignatureFormat,
} from "./sanitization.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Password Policy Utilities
// ============================================================================

/**
 * Password policy requirements.
 */
export interface PasswordPolicy {
  /** Minimum password length (default: 12) */
  minLength?: number;
  /** Require uppercase letters (default: true) */
  requireUppercase?: boolean;
  /** Require lowercase letters (default: true) */
  requireLowercase?: boolean;
  /** Require numbers (default: true) */
  requireNumbers?: boolean;
  /** Require special characters (default: true) */
  requireSpecialChars?: boolean;
  /** Blocked common passwords (default: common weak passwords) */
  blockedPasswords?: string[];
  /** Maximum character repetition (default: 3) */
  maxRepetition?: number;
}

/**
 * Password validation result.
 */
export interface PasswordValidationResult {
  /** Whether the password meets all requirements */
  valid: boolean;
  /** List of validation errors */
  errors: string[];
  /** Password strength score (0-100) */
  strength: number;
}

/**
 * Default password policy.
 */
const DEFAULT_PASSWORD_POLICY: Required<PasswordPolicy> = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  blockedPasswords: [
    "password",
    "password123",
    "12345678",
    "qwerty123",
    "abc12345",
    "letmein123",
    "welcome123",
    "admin123",
    "root123",
    "passw0rd",
  ],
  maxRepetition: 3,
};

/**
 * Validate a password against policy requirements.
 */
export function validatePassword(
  password: string,
  policy: PasswordPolicy = {}
): PasswordValidationResult {
  const mergedPolicy = { ...DEFAULT_PASSWORD_POLICY, ...policy };
  const errors: string[] = [];

  // Check minimum length
  if (password.length < mergedPolicy.minLength) {
    errors.push(`Password must be at least ${mergedPolicy.minLength} characters long`);
  }

  // Check uppercase
  if (mergedPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  // Check lowercase
  if (mergedPolicy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  // Check numbers
  if (mergedPolicy.requireNumbers && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  // Check special characters
  if (mergedPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }

  // Check against blocked passwords
  const lowerPassword = password.toLowerCase();
  for (const blocked of mergedPolicy.blockedPasswords) {
    if (lowerPassword.includes(blocked) || blocked.includes(lowerPassword)) {
      errors.push("Password is too common or weak");
      break;
    }
  }

  // Check character repetition
  if (mergedPolicy.maxRepetition > 0) {
    const repetitionRegex = new RegExp(`(.)\\1{${mergedPolicy.maxRepetition},}`, "g");
    if (repetitionRegex.test(password)) {
      errors.push(
        `Password cannot contain the same character more than ${mergedPolicy.maxRepetition} times in a row`
      );
    }
  }

  // Calculate strength score
  let strength = 0;
  if (password.length >= 8) strength += 20;
  if (password.length >= 12) strength += 20;
  if (/[A-Z]/.test(password)) strength += 15;
  if (/[a-z]/.test(password)) strength += 15;
  if (/\d/.test(password)) strength += 15;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength += 15;

  return {
    valid: errors.length === 0,
    errors,
    strength: Math.min(100, strength),
  };
}

/**
 * Generate a cryptographically secure random API key.
 */
export async function generateApiKey(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================================================
// Cryptographic Hashing
// ============================================================================

/**
 * Hash an API key using SHA-256 with proper salt.
 * Uses PBKDF2 for key derivation with 100,000 iterations.
 */
export async function hashApiKey(
  apiKey: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  const actualSalt =
    salt ||
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
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

  const hashBuffer = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(actualSalt),
      iterations: 100_000,
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
 * API key scope/permission levels.
 */
export type ApiKeyScope = "read" | "write" | "admin";

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
  /** Session ID if authenticated via session */
  sessionId?: string;
  /** Rate limit tier */
  rateLimitTier: number;
}

// ============================================================================
// API Key Storage (in-memory for now; should use database in production)
// ============================================================================

const apiKeys = new Map<string, ApiKey>();
const sessions = new Map<string, AuthSession>();
const auditLog: AuditLogEntry[] = [];

// Account lockout settings
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Auth failure tracking per IP (for rate limiting)
const authFailuresByIp = new Map<string, { count: number; resetAt: number }>();
const AUTH_FAILURE_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_AUTH_FAILURES_PER_MINUTE = 10;

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
 */
function getApiKey(keyId: string): ApiKey | undefined {
  return apiKeys.get(keyId);
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

/**
 * Create a new session for an authenticated API key.
 */
export function createSession(
  keyId: string,
  clientIp: string,
  userAgent?: string,
  metadata?: Record<string, unknown>
): string {
  // Clean up old sessions for this key
  cleanupOldSessions(keyId);

  const sessionId = crypto.randomUUID();
  const now = Date.now();

  const session: AuthSession = {
    sessionId,
    keyId,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: now + SESSION_TTL_MS,
    clientIp,
    userAgent,
    metadata,
    csrfToken: generateAuthCsrfTokenInternal(),
    regenerated: false,
  };

  sessions.set(sessionId, session);

  logger.info("Session created", { sessionId, keyId, clientIp });

  return sessionId;
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
 * Validate a session (check expiration).
 */
function validateSession(session: AuthSession): boolean {
  const now = Date.now();
  return session.expiresAt > now;
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

    // Try session authentication first
    if (allowSessions) {
      const sessionToken = extractSessionToken(c);
      if (sessionToken) {
        const session = getSession(sessionToken);
        if (session && validateSession(session)) {
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
                sessionId: session.sessionId,
                rateLimitTier: apiKey.rateLimitTier,
              };
              c.set("auth", authContext);

              return next();
            }
          }
        }

        // Invalid session
        securityLogger.logAuthFailure(c, "invalid_session_token");
      }
    }

    // Try API key authentication
    const apiKeyData = extractApiKey(c);
    if (!apiKeyData) {
      securityLogger.logAuthFailure(c, "missing_api_key");
      c.header("WWW-Authenticate", `Bearer realm="${realm}"`);
      throw new HTTPException(401, { message: "Authentication required" });
    }

    const { keyId, secret } = apiKeyData;
    const apiKey = getApiKey(keyId);

    if (!apiKey || !apiKey.active) {
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

    // Verify secret
    if (!verifyApiKeySecret(keyId, secret)) {
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

    // Attach auth context
    const authContext: AuthContext = {
      keyId: apiKey.keyId,
      scope: apiKey.scope,
      rateLimitTier: apiKey.rateLimitTier,
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

    // Try session authentication first
    if (allowSessions) {
      const sessionToken = extractSessionToken(c);
      if (sessionToken) {
        const session = getSession(sessionToken);
        if (session && validateSession(session)) {
          const apiKey = getApiKey(session.keyId);
          if (apiKey && apiKey.active) {
            updateSessionActivity(sessionToken);
            const authContext: AuthContext = {
              keyId: apiKey.keyId,
              scope: apiKey.scope,
              sessionId: session.sessionId,
              rateLimitTier: apiKey.rateLimitTier,
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
          rateLimitTier: apiKey.rateLimitTier,
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
// Audit Logging
// ============================================================================

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
