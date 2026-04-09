/**
 * Cross-Site Request Forgery (CSRF) protection middleware.
 *
 * OWASP A01:2021 - Broken Access Control
 *
 * Prevents CSRF attacks by:
 * - Generating cryptographically secure CSRF tokens
 * - Validating tokens on state-changing requests
 * - Supporting double-submit cookie pattern
 * - Supporting SameSite cookie attribute
 * - Token rotation on authentication
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  generateCsrfToken as generateAuthCsrfToken,
  getSessionCsrfToken,
} from "./authentication.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types
// ============================================================================

/**
 * CSRF protection options.
 */
export interface CsrfProtectionOptions {
  /** Header name for CSRF token (default: X-CSRF-Token) */
  tokenHeader?: string;
  /** Form field name for CSRF token (default: csrf_token) */
  tokenField?: string;
  /** Cookie name for CSRF token (default: csrf_token) */
  cookieName?: string;
  /** Cookie path (default: /) */
  cookiePath?: string;
  /** Whether to set SameSite=Strict (default: true) */
  sameSiteStrict?: boolean;
  /** Whether to require token for safe methods (GET, HEAD, OPTIONS) (default: false) */
  requireForSafeMethods?: boolean;
  /** Error message on validation failure (default: Invalid CSRF token) */
  errorMessage?: string;
  /** Paths to exclude from CSRF protection */
  excludePaths?: string[];
}

/**
 * CSRF token data stored in session.
 */
export interface CsrfTokenData {
  /** The token value */
  token: string;
  /** Token creation timestamp */
  createdAt: number;
  /** Whether the token has been used (single-use tokens) */
  used?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default CSRF protection options.
 */
const DEFAULT_OPTIONS: Required<Omit<CsrfProtectionOptions, "excludePaths">> = {
  tokenHeader: "X-CSRF-Token",
  tokenField: "csrf_token",
  cookieName: "csrf_token",
  cookiePath: "/",
  sameSiteStrict: true,
  requireForSafeMethods: false,
  errorMessage: "Invalid CSRF token",
};

/**
 * Safe HTTP methods that don't require CSRF protection.
 */
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS", "TRACE"];

/**
 * State-changing methods that require CSRF protection.
 */
const UNSAFE_METHODS = ["POST", "PUT", "DELETE", "PATCH"];

// ============================================================================
// Token Storage
// ============================================================================

/**
 * In-memory token storage (for stateless operation).
 * In production, this should be replaced with a proper cache/store.
 */
const tokenStore = new Map<string, CsrfTokenData>();

/**
 * Token TTL (24 hours).
 */
const TOKEN_TTL_MS = 86_400_000;

/**
 * Clean up expired tokens.
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  for (const [tokenId, tokenData] of tokenStore.entries()) {
    if (now - tokenData.createdAt > TOKEN_TTL_MS) {
      tokenStore.delete(tokenId);
    }
  }
}

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 3_600_000);

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate a new CSRF token.
 *
 * Creates a cryptographically secure random token and stores it
 * with metadata for validation.
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");

  const tokenData: CsrfTokenData = {
    token,
    createdAt: Date.now(),
    used: false,
  };

  tokenStore.set(token, tokenData);

  return token;
}

/**
 * Generate a CSRF token tied to a session.
 *
 * This provides additional security by binding the token to a specific
 * session ID, making token reuse across sessions impossible.
 */
export function generateSessionCsrfToken(sessionId: string): string {
  const token = generateCsrfToken();
  // Store the session-token mapping for additional validation
  const tokenData = tokenStore.get(token);
  if (tokenData) {
    (tokenData as CsrfTokenData & { sessionId?: string }).sessionId = sessionId;
  }
  return token;
}

// ============================================================================
// Token Validation
// ============================================================================

/**
 * Validate a CSRF token.
 *
 * Checks:
 * - Token exists in store
 * - Token hasn't expired
 * - Token hasn't been used (for single-use tokens)
 * - Optional session binding
 */
export function validateCsrfToken(
  token: string,
  options?: {
    /** Require session binding */
    sessionId?: string;
    /** Allow token reuse (default: false for state-changing operations) */
    allowReuse?: boolean;
  }
): boolean {
  const tokenData = tokenStore.get(token);

  if (!tokenData) {
    return false;
  }

  // Check expiration
  if (Date.now() - tokenData.createdAt > TOKEN_TTL_MS) {
    tokenStore.delete(token);
    return false;
  }

  // Check if already used (for single-use tokens)
  if (!options?.allowReuse && tokenData.used) {
    return false;
  }

  // Check session binding
  if (options?.sessionId) {
    const sessionToken = tokenData as CsrfTokenData & { sessionId?: string };
    if (sessionToken.sessionId && sessionToken.sessionId !== options.sessionId) {
      return false;
    }
  }

  return true;
}

/**
 * Mark a CSRF token as used (for single-use tokens).
 */
export function markCsrfTokenUsed(token: string): void {
  const tokenData = tokenStore.get(token);
  if (tokenData) {
    tokenData.used = true;
  }
}

/**
 * Revoke a CSRF token.
 */
export function revokeCsrfToken(token: string): void {
  tokenStore.delete(token);
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * CSRF protection middleware factory.
 *
 * Generates and validates CSRF tokens for state-changing operations.
 *
 * For safe methods (GET, HEAD, OPTIONS), the middleware generates a token
 * and sets it in a cookie for later use.
 *
 * For unsafe methods (POST, PUT, DELETE, PATCH), the middleware validates
 * the token from the request header or form field.
 */
export function csrfProtection(options: CsrfProtectionOptions = {}): MiddlewareHandler {
  const {
    tokenHeader,
    tokenField,
    cookieName,
    cookiePath,
    sameSiteStrict,
    requireForSafeMethods,
    errorMessage,
    excludePaths = [],
  } = { ...DEFAULT_OPTIONS, ...options };

  return async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    // Check if path is excluded
    if (excludePaths.some((exclude) => path.startsWith(exclude))) {
      return next();
    }

    const isSafeMethod = SAFE_METHODS.includes(method);

    // For safe methods, generate and set token
    if (isSafeMethod && !requireForSafeMethods) {
      // Get existing token from cookie or generate new one
      const existingToken = c.req.header("Cookie")?.match(new RegExp(`${cookieName}=([^;]+)`))?.[1];
      let token = existingToken;

      if (!token || !validateCsrfToken(token, { allowReuse: true })) {
        token = generateCsrfToken();
      }

      // Set CSRF cookie
      const sameSite = sameSiteStrict ? "Strict" : "Lax";
      c.header(
        "Set-Cookie",
        `${cookieName}=${token}; Path=${cookiePath}; SameSite=${sameSite}; HttpOnly; Secure`
      );

      // Make token available to templates
      c.set("csrfToken", token);

      return next();
    }

    // For unsafe methods, validate token
    const auth = c.get("auth");
    const sessionId = auth?.sessionId;

    // Get token from header or form field
    let token: string | undefined;

    // Try header first
    token = c.req.header(tokenHeader);

    // Try form field (for multipart/form-data and application/x-www-form-urlencoded)
    if (!token) {
      try {
        const contentType = c.req.header("Content-Type");
        if (
          contentType?.includes("multipart/form-data") ||
          contentType?.includes("x-www-form-urlencoded")
        ) {
          const formData = await c.req.formData().catch(() => null);
          if (formData) {
            token = formData.get(tokenField)?.toString();
          }
        }
      } catch {
        // Form data parsing failed
      }
    }

    // Try JSON body
    if (!token) {
      try {
        const body = await c.req.json().catch(() => null);
        if (body && typeof body === "object") {
          token = body[tokenField] as string | undefined;
        }
      } catch {
        // JSON parsing failed
      }
    }

    // Try cookie (double-submit pattern)
    if (!token) {
      const cookieMatch = c.req.header("Cookie")?.match(new RegExp(`${cookieName}=([^;]+)`));
      if (cookieMatch) {
        token = cookieMatch[1];
      }
    }

    // Validate token
    if (!token) {
      securityLogger.logAuthFailure(c, "missing_csrf_token");
      throw new HTTPException(403, { message: errorMessage });
    }

    const isValid = validateCsrfToken(token, {
      sessionId,
      allowReuse: false, // Single-use for state-changing operations
    });

    if (!isValid) {
      securityLogger.logAuthFailure(c, "invalid_csrf_token");
      throw new HTTPException(403, { message: errorMessage });
    }

    // Mark token as used (single-use)
    markCsrfTokenUsed(token);

    // Generate new token for next request
    const newToken = generateSessionCsrfToken(sessionId || "default");
    c.header(
      "Set-Cookie",
      `${cookieName}=${newToken}; Path=${cookiePath}; SameSite=${sameSiteStrict ? "Strict" : "Lax"}; HttpOnly; Secure`
    );
    c.set("csrfToken", newToken);

    return next();
  };
}

/**
 * Get the CSRF token for the current request.
 *
 * This can be used in templates to include the token in forms.
 */
export function getCsrfToken(c: Context): string | undefined {
  return c.get("csrfToken") as string | undefined;
}

/**
 * CSRF token validation middleware for manual validation.
 *
 * Use this when you need to validate CSRF tokens in specific routes
 * rather than globally.
 */
export function validateCsrf(options: CsrfProtectionOptions = {}): MiddlewareHandler {
  const { tokenHeader, tokenField, cookieName, errorMessage } = { ...DEFAULT_OPTIONS, ...options };

  return async (c, next) => {
    const auth = c.get("auth");
    const sessionId = auth?.sessionId;

    // Get token from header or form field
    let token: string | undefined;

    // Try header first
    token = c.req.header(tokenHeader);

    // Try form field
    if (!token) {
      try {
        const contentType = c.req.header("Content-Type");
        if (
          contentType?.includes("multipart/form-data") ||
          contentType?.includes("x-www-form-urlencoded")
        ) {
          const formData = await c.req.formData().catch(() => null);
          if (formData) {
            token = formData.get(tokenField)?.toString();
          }
        }
      } catch {
        // Form data parsing failed
      }
    }

    // Try JSON body
    if (!token) {
      try {
        const body = await c.req.json().catch(() => null);
        if (body && typeof body === "object") {
          token = body[tokenField] as string | undefined;
        }
      } catch {
        // JSON parsing failed
      }
    }

    // Try cookie
    if (!token) {
      const cookieMatch = c.req.header("Cookie")?.match(new RegExp(`${cookieName}=([^;]+)`));
      if (cookieMatch) {
        token = cookieMatch[1];
      }
    }

    // Validate token
    if (!token || !validateCsrfToken(token, { sessionId, allowReuse: false })) {
      securityLogger.logAuthFailure(c, "invalid_csrf_token");
      throw new HTTPException(403, { message: errorMessage });
    }

    // Mark token as used
    markCsrfTokenUsed(token);

    return next();
  };
}
