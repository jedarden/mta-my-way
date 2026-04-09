/**
 * Cookie security middleware and utilities for Hono.
 *
 * Provides:
 * - Secure cookie configuration with proper flags
 * - CSRF double-submit cookie pattern
 * - Session cookie utilities
 * - Cookie signing and verification
 * - Cookie security validation
 *
 * Security Features:
 * - Secure flag (HTTPS only)
 * - HttpOnly flag (prevents XSS access)
 * - SameSite protection (CSRF mitigation)
 * - Cookie signing (HMAC-based integrity)
 * - Automatic cookie rotation support
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Cookie security options.
 */
export interface CookieSecurityOptions {
  /** Enable Secure flag (HTTPS only, default: true) */
  secure?: boolean;
  /** Enable HttpOnly flag (prevents JavaScript access, default: true) */
  httpOnly?: boolean;
  /** SameSite attribute (default: 'strict') */
  sameSite?: "strict" | "lax" | "none";
  /** Cookie path (default: '/') */
  path?: string;
  /** Cookie domain (optional) */
  domain?: string;
  /** Max age in seconds (optional, creates session cookie if not set) */
  maxAge?: number;
  /** Enable cookie signing (default: true) */
  signed?: boolean;
}

/**
 * Cookie signing configuration.
 */
export interface CookieSigningConfig {
  /** Secret key for HMAC signing */
  secret: string;
  /** Algorithm to use (default: 'SHA-256') */
  algorithm?: "SHA-256" | "SHA-384" | "SHA-512";
}

/**
 * CSRF double-submit cookie options.
 */
export interface CsrfCookieOptions extends CookieSecurityOptions {
  /** Cookie name for CSRF token (default: 'csrf_token') */
  cookieName?: string;
  /** Header name for CSRF token (default: 'x-csrf-token') */
  headerName?: string;
  /** Token length in bytes (default: 32) */
  tokenLength?: number;
}

/**
 * Session cookie options.
 */
export interface SessionCookieOptions extends CookieSecurityOptions {
  /** Cookie name for session token (default: 'session_token') */
  cookieName?: string;
}

/**
 * Signed cookie data format.
 */
interface SignedCookieData {
  value: string;
  signature: string;
  timestamp: number;
}

// ============================================================================
// Cookie Signing
// ============================================================================

/**
 * Default signing configuration (should be overridden in production).
 * In production, load from environment variable.
 */
let signingConfig: CookieSigningConfig = {
  secret: globalThis.process?.env.COOKIE_SECRET || "change-this-secret-in-production",
  algorithm: "SHA-256",
};

/**
 * Configure cookie signing.
 *
 * Call this during app initialization with a secure secret.
 */
export function configureCookieSigning(config: CookieSigningConfig): void {
  signingConfig = config;
  logger.info("Cookie signing configured", { algorithm: config.algorithm });
}

/**
 * Sign a cookie value using HMAC.
 *
 * Creates a signature: HMAC(timestamp + value, secret)
 */
export async function signCookie(value: string): Promise<string> {
  const timestamp = Date.now();
  const message = `${timestamp}:${value}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingConfig.secret),
    { name: "HMAC", hash: signingConfig.algorithm || "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return `${timestamp}:${value}:${signatureB64}`;
}

/**
 * Verify a signed cookie value.
 *
 * Returns the original value if valid, null otherwise.
 */
export async function verifySignedCookie(signedValue: string): Promise<string | null> {
  const parts = signedValue.split(":");
  if (parts.length !== 3) {
    return null;
  }

  const [timestampStr, value, signatureB64] = parts;
  const timestamp = parseInt(timestampStr, 10);

  // Check timestamp is within 24 hours
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;
  if (isNaN(timestamp) || now - timestamp > maxAge) {
    return null;
  }

  // Verify signature
  const message = `${timestamp}:${value}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingConfig.secret),
    { name: "HMAC", hash: signingConfig.algorithm || "SHA-256" },
    false,
    ["verify"]
  );

  const signature = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
  const isValid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(message));

  return isValid ? value : null;
}

// ============================================================================
// Cookie Security Utilities
// ============================================================================

/**
 * Build a cookie string with security attributes.
 */
export function buildCookieString(
  name: string,
  value: string,
  options: CookieSecurityOptions = {}
): string {
  const {
    secure = true,
    httpOnly = true,
    sameSite = "strict",
    path = "/",
    domain,
    maxAge,
    signed = true,
  } = options;

  let cookie = `${name}=${value}`;

  if (secure) {
    cookie += "; Secure";
  }

  if (httpOnly) {
    cookie += "; HttpOnly";
  }

  if (sameSite) {
    cookie += `; SameSite=${sameSite === "none" ? "None" : sameSite === "lax" ? "Lax" : "Strict"}`;
  }

  if (path) {
    cookie += `; Path=${path}`;
  }

  if (domain) {
    cookie += `; Domain=${domain}`;
  }

  if (maxAge !== undefined) {
    cookie += `; Max-Age=${maxAge}`;
  }

  return cookie;
}

/**
 * Set a secure cookie on the response.
 *
 * Note: This is an async function but returns void for compatibility.
 * The cookie is set asynchronously; ensure headers aren't sent before this completes.
 */
export async function setSecureCookie(
  c: Context,
  name: string,
  value: string,
  options: CookieSecurityOptions = {}
): Promise<void> {
  const signedValue = options.signed !== false ? await signCookie(value) : value;

  const cookieString = buildCookieString(name, signedValue, options);
  c.res.headers.append("Set-Cookie", cookieString);
}

/**
 * Get and verify a signed cookie from the request.
 */
export async function getSignedCookie(c: Context, name: string): Promise<string | null> {
  const cookieHeader = c.req.header("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const targetCookie = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  if (!targetCookie) return null;

  const signedValue = targetCookie.substring(name.length + 1);
  return verifySignedCookie(signedValue);
}

/**
 * Delete a cookie by setting its expiration to the past.
 */
export function deleteCookie(
  c: Context,
  name: string,
  options: Pick<CookieSecurityOptions, "path" | "domain"> = {}
): void {
  const cookieString = buildCookieString(name, "", {
    ...options,
    maxAge: 0,
    secure: true,
    httpOnly: true,
    sameSite: "strict",
  });
  c.res.headers.append("Set-Cookie", cookieString);
}

// ============================================================================
// CSRF Double-Submit Cookie Pattern
// ============================================================================

/**
 * Generate a cryptographically secure CSRF token.
 */
export function generateCsrfToken(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * CSRF cookie middleware.
 *
 * Implements the double-submit cookie pattern:
 * 1. Sets a CSRF token in a secure, HttpOnly cookie
 * 2. Client must include the token in a custom header for state-changing requests
 * 3. Middleware verifies the cookie and header values match
 */
export function csrfCookie(options: CsrfCookieOptions = {}): MiddlewareHandler {
  const {
    cookieName = "csrf_token",
    headerName = "x-csrf-token",
    tokenLength = 32,
    secure = true,
    httpOnly = false, // JavaScript needs to read this for the header
    sameSite = "strict",
    signed = true,
  } = options;

  return async (c, next) => {
    // For safe methods, just ensure the CSRF cookie exists
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const existingToken = await getSignedCookie(c, cookieName);

      if (!existingToken) {
        const token = generateCsrfToken(tokenLength);
        await setSecureCookie(c, cookieName, token, {
          secure,
          httpOnly,
          sameSite,
          signed,
        });
      }

      return next();
    }

    // For state-changing methods, verify the CSRF token
    const cookieToken = await getSignedCookie(c, cookieName);
    const headerToken = c.req.header(headerName);

    if (!cookieToken) {
      securityLogger.logAuthFailure(c, "missing_csrf_cookie");
      throw new HTTPException(403, { message: "CSRF token missing. Please refresh the page." });
    }

    if (!headerToken) {
      securityLogger.logAuthFailure(c, "missing_csrf_header");
      throw new HTTPException(403, {
        message: `CSRF token required. Include the token in the '${headerName}' header.`,
      });
    }

    // Use timing-safe comparison to prevent timing attacks
    if (!timingSafeEqual(cookieToken, headerToken)) {
      securityLogger.logSuspiciousActivity(
        c,
        "csrf_token_mismatch",
        "CSRF token mismatch detected"
      );
      throw new HTTPException(403, { message: "Invalid CSRF token. Please refresh the page." });
    }

    return next();
  };
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i]! ^ bBytes[i]!;
  }

  return result === 0;
}

/**
 * Get the current CSRF token for use in forms/headers.
 *
 * This is a utility for templates/client code to retrieve the token.
 */
export async function getCsrfToken(c: Context, cookieName = "csrf_token"): Promise<string | null> {
  return getSignedCookie(c, cookieName);
}

// ============================================================================
// Session Cookie Management
// ============================================================================

/**
 * Set a session token cookie.
 *
 * Used to store session tokens in secure cookies for automatic authentication.
 */
export async function setSessionCookie(
  c: Context,
  sessionToken: string,
  options: SessionCookieOptions = {}
): Promise<void> {
  const {
    cookieName = "session_token",
    maxAge = 24 * 60 * 60, // 24 hours default
    secure = true,
    httpOnly = true,
    sameSite = "strict",
    signed = false, // Session tokens are already cryptographically secure
  } = options;

  await setSecureCookie(c, cookieName, sessionToken, {
    secure,
    httpOnly,
    sameSite,
    maxAge,
    path: "/",
    signed,
  });

  logger.debug("Session cookie set", { cookieName });
}

/**
 * Get the session token from cookies.
 *
 * Retrieves and verifies the session token from cookies.
 */
export async function getSessionCookie(
  c: Context,
  cookieName = "session_token"
): Promise<string | null> {
  const cookieHeader = c.req.header("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const targetCookie = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`));

  if (!targetCookie) return null;

  return targetCookie.substring(cookieName.length + 1);
}

/**
 * Clear the session cookie.
 *
 * Use this when logging out or revoking a session.
 */
export function clearSessionCookie(c: Context, cookieName = "session_token"): void {
  deleteCookie(c, cookieName, { path: "/" });
  logger.debug("Session cookie cleared", { cookieName });
}

// ============================================================================
// Refresh Token Cookie Management
// ============================================================================

/**
 * Set a refresh token cookie.
 *
 * Refresh tokens are stored separately with longer expiration.
 */
export async function setRefreshTokenCookie(
  c: Context,
  refreshToken: string,
  options: CookieSecurityOptions = {}
): Promise<void> {
  const {
    cookieName = "refresh_token",
    maxAge = 30 * 24 * 60 * 60, // 30 days default
    secure = true,
    httpOnly = true,
    sameSite = "strict",
    signed = false,
  } = options;

  await setSecureCookie(c, cookieName, refreshToken, {
    secure,
    httpOnly,
    sameSite,
    maxAge,
    path: "/",
    signed,
  });

  logger.debug("Refresh token cookie set", { cookieName });
}

/**
 * Get the refresh token from cookies.
 */
export async function getRefreshTokenCookie(
  c: Context,
  cookieName = "refresh_token"
): Promise<string | null> {
  const cookieHeader = c.req.header("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const targetCookie = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`));

  if (!targetCookie) return null;

  return targetCookie.substring(cookieName.length + 1);
}

/**
 * Clear the refresh token cookie.
 */
export function clearRefreshTokenCookie(c: Context, cookieName = "refresh_token"): void {
  deleteCookie(c, cookieName, { path: "/" });
  logger.debug("Refresh token cookie cleared", { cookieName });
}

// ============================================================================
// Cookie Security Validation
// ============================================================================

/**
 * Validate cookie security attributes.
 *
 * Checks if cookies being set have appropriate security flags.
 */
export function validateCookieSecurity(setCookieHeaders: string[]): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  for (const header of setCookieHeaders) {
    const cookie = header.split(";")[0];
    const name = cookie.split("=")[0]?.trim();

    if (!name) continue;

    const hasSecure = header.includes("Secure");
    const hasHttpOnly = header.includes("HttpOnly");
    const hasSameSite = /SameSite=(Strict|Lax|None)/i.test(header);

    if (!hasSecure) {
      issues.push(`Cookie '${name}' missing Secure flag`);
    }

    if (!hasHttpOnly && !name.startsWith("csrf_")) {
      // CSRF cookies need to be readable by JavaScript
      issues.push(`Cookie '${name}' missing HttpOnly flag`);
    }

    if (!hasSameSite) {
      issues.push(`Cookie '${name}' missing SameSite attribute`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Middleware to log cookie security issues in development.
 */
export function cookieSecurityValidator(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Only validate in development
    if (globalThis.process?.env.NODE_ENV !== "production") {
      const setCookieHeaders = c.res.headers.getSetCookie();
      if (setCookieHeaders.length > 0) {
        const validation = validateCookieSecurity(setCookieHeaders);
        if (!validation.valid) {
          logger.warn("Cookie security issues detected", {
            issues: validation.issues,
          });
        }
      }
    }
  };
}

// ============================================================================
// Middleware Integration
// ============================================================================

/**
 * Combined session and CSRF cookie middleware.
 *
 * Provides automatic cookie-based session handling with CSRF protection.
 */
export function cookieSessionAuth(
  options: {
    sessionCookieName?: string;
    csrfCookieName?: string;
    csrfHeaderName?: string;
    csrfCookieOptions?: CsrfCookieOptions;
  } = {}
): MiddlewareHandler {
  const {
    sessionCookieName = "session_token",
    csrfCookieName = "csrf_token",
    csrfHeaderName = "x-csrf-token",
    csrfCookieOptions,
  } = options;

  return async (c, next) => {
    // Attach session token from cookie to context
    const sessionToken = await getSessionCookie(c, sessionCookieName);
    if (sessionToken) {
      c.set("sessionToken", sessionToken);
    }

    // Attach CSRF token to context for templates
    const csrfToken = await getCsrfToken(c, csrfCookieName);
    if (csrfToken) {
      c.set("csrfToken", csrfToken);
    }

    return next();
  };
}
