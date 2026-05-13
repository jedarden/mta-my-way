/**
 * HTTP method restrictions middleware for Hono.
 *
 * OWASP A01:2021 - Broken Access Control
 * OWASP A05:2021 - Security Misconfiguration
 *
 * Restricts access to potentially dangerous HTTP methods that
 * could be used for reconnaissance or attacks.
 *
 * Dangerous methods blocked:
 * - TRACE: Can be used for Cross-Site Tracing (XST) attacks to steal cookies
 * - CONNECT: Can be used as a proxy for attacks on other servers
 * - PATCH: Often misconfigured, can lead to data integrity issues
 *
 * Safe methods allowed:
 * - GET, HEAD, OPTIONS: Read-only operations
 * - POST: Standard state-changing operations
 * - PUT: Resource updates (if needed by your API)
 * - DELETE: Resource deletion (if needed by your API)
 *
 * This middleware should be applied globally to all routes.
 */

import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { securityLogger } from "./security-logging.js";

/**
 * HTTP method restrictions options.
 */
export interface HttpMethodRestrictionsOptions {
  /** Additional allowed methods beyond the safe defaults (default: []) */
  additionalAllowedMethods?: string[];
  /** Additional blocked methods beyond the dangerous defaults (default: []) */
  additionalBlockedMethods?: string[];
  /** Skip validation for these paths (default: []) */
  excludePaths?: string[];
  /** Whether to log all method requests (default: false) */
  logAllMethods?: boolean;
  /** Custom error message (default: "Method not allowed") */
  errorMessage?: string;
}

/**
 * Safe HTTP methods that are always allowed.
 * These are read-only methods that don't modify server state.
 */
const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"] as const;

/**
 * Common state-changing methods that are typically allowed.
 * These are standard methods for REST APIs.
 */
const COMMON_STATE_CHANGING_METHODS = ["POST", "PUT", "DELETE", "PATCH"] as const;

/**
 * Dangerous HTTP methods that should be blocked.
 * These methods can be used for attacks or reconnaissance.
 */
const DANGEROUS_METHODS = ["TRACE", "CONNECT"] as const;

/**
 * Other potentially unsafe methods that should be explicitly allowed.
 */
const OTHER_METHODS = ["PROPFIND", "PROPPATCH", "MKCOL", "COPY", "MOVE", "LOCK", "UNLOCK"] as const;

/**
 * HTTP method restrictions middleware.
 *
 * Blocks dangerous HTTP methods and logs the attempt.
 * Returns 405 Method Not Allowed for blocked methods.
 */
export function httpMethodRestrictions(
  options: HttpMethodRestrictionsOptions = {}
): MiddlewareHandler {
  const {
    additionalAllowedMethods = [],
    additionalBlockedMethods = [],
    excludePaths = [],
    logAllMethods = false,
    errorMessage = "Method not allowed",
  } = options;

  // Build the set of allowed methods
  const allowedMethods = new Set<string>([
    ...SAFE_METHODS,
    ...COMMON_STATE_CHANGING_METHODS,
    ...additionalAllowedMethods,
  ]);

  // Build the set of blocked methods (dangerous + additional)
  const blockedMethods = new Set<string>([...DANGEROUS_METHODS, ...additionalBlockedMethods]);

  return async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    // Skip if path is excluded
    if (excludePaths.some((exclude) => path.startsWith(exclude))) {
      return next();
    }

    // Log all method requests if enabled
    if (logAllMethods) {
      securityLogger.logUnusualActivity(c, "http_method_request", `${method} ${path}`);
    }

    // Check if method is explicitly blocked
    if (blockedMethods.has(method)) {
      securityLogger.logBlockedAttack(c, "http_method_blocked", `${method} ${path}`);

      // Return 405 with Allow header showing valid methods
      c.header("Allow", Array.from(allowedMethods).join(", "));
      c.header("Content-Type", "text/plain; charset=utf-8");

      throw new HTTPException(405, {
        message: `${method} method is not allowed: ${errorMessage}`,
      });
    }

    // Optionally warn about uncommon methods
    if (OTHER_METHODS.includes(method as (typeof OTHER_METHODS)[number])) {
      securityLogger.logUnusualActivity(c, "http_method_uncommon", `${method} ${path}`);
    }

    // Add Allow header for OPTIONS requests
    if (method === "OPTIONS") {
      c.header("Allow", Array.from(allowedMethods).join(", "));
    }

    await next();
  };
}

/**
 * Check if a method is safe (read-only).
 */
export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.includes(method.toUpperCase() as (typeof SAFE_METHODS)[number]);
}

/**
 * Check if a method is dangerous.
 */
export function isDangerousMethod(method: string): boolean {
  return DANGEROUS_METHODS.includes(method.toUpperCase() as (typeof DANGEROUS_METHODS)[number]);
}

/**
 * Check if a method is idempotent (safe + PUT/DELETE).
 * Idempotent methods can be safely retried.
 */
export function isIdempotentMethod(method: string): boolean {
  return (
    isSafeMethod(method) || method.toUpperCase() === "PUT" || method.toUpperCase() === "DELETE"
  );
}

/**
 * Get the set of allowed methods.
 */
export function getAllowedMethods(additional: string[] = []): Set<string> {
  return new Set([...SAFE_METHODS, ...COMMON_STATE_CHANGING_METHODS, ...additional]);
}

/**
 * Get the set of blocked methods.
 */
export function getBlockedMethods(additional: string[] = []): Set<string> {
  return new Set([...DANGEROUS_METHODS, ...additional]);
}

/**
 * Strict HTTP method restrictions middleware.
 *
 * Like httpMethodRestrictions but only allows GET, HEAD, OPTIONS, POST.
 * Blocks PUT, DELETE, PATCH unless explicitly allowed.
 * Use this for applications that don't need full REST API support.
 */
export function strictHttpMethodRestrictions(
  options: Omit<HttpMethodRestrictionsOptions, "additionalBlockedMethods"> = {}
): MiddlewareHandler {
  const {
    additionalAllowedMethods = [],
    excludePaths = [],
    logAllMethods = false,
    errorMessage = "Method not allowed",
  } = options;

  // Only allow safe methods + POST
  const allowedMethods = new Set([...SAFE_METHODS, "POST", ...additionalAllowedMethods]);

  return async (c, next) => {
    const method = c.req.method;
    const path = c.req.path;

    // Skip if path is excluded
    if (excludePaths.some((exclude) => path.startsWith(exclude))) {
      return next();
    }

    // Log all method requests if enabled
    if (logAllMethods) {
      securityLogger.logUnusualActivity(c, "http_method_request", `${method} ${path}`);
    }

    // Check if method is allowed
    if (!allowedMethods.has(method)) {
      securityLogger.logBlockedAttack(c, "http_method_blocked_strict", `${method} ${path}`);

      c.header("Allow", Array.from(allowedMethods).join(", "));
      c.header("Content-Type", "text/plain; charset=utf-8");

      throw new HTTPException(405, {
        message: `${method} method is not allowed: ${errorMessage}`,
      });
    }

    // Add Allow header for OPTIONS requests
    if (method === "OPTIONS") {
      c.header("Allow", Array.from(allowedMethods).join(", "));
    }

    await next();
  };
}
