/**
 * Open Redirect protection middleware.
 *
 * OWASP A01:2021 - Broken Access Control
 *
 * Prevents open redirect attacks by:
 * - Validating redirect URLs against allow-lists
 * - Blocking redirects to external domains
 * - Preventing redirect chaining
 * - Validating URL protocols
 * - Detecting and blocking phishing attempts
 *
 * Open redirect vulnerabilities occur when an application accepts a
 * user-provided URL as a redirect target without proper validation,
 * allowing attackers to redirect users to malicious sites for phishing.
 */

import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "../observability/logger.js";
import { securityLogger } from "./security-logging.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Open redirect protection options.
 */
export interface OpenRedirectOptions {
  /** Allowed redirect targets (relative paths or exact URLs) */
  allowedTargets?: string[];
  /** Allowed hostnames for external redirects */
  allowedHostnames?: string[];
  /** Allow relative redirects (default: true) */
  allowRelative?: boolean;
  /** Block external redirects (default: true) */
  blockExternal?: boolean;
  /** Redirect parameter name (default: "redirect", "url", "return", "next") */
  redirectParams?: string[];
  /** Whether to check query parameters (default: true) */
  checkQueryParams?: boolean;
  /** Whether to check request body (default: true) */
  checkBody?: boolean;
}

/**
 * Redirect validation result.
 */
export interface RedirectValidationResult {
  /** Whether the redirect URL is valid */
  valid: boolean;
  /** The sanitized/validated redirect URL */
  url?: string;
  /** Reason for rejection (if invalid) */
  reason?: string;
  /** The original URL that was rejected */
  originalUrl?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default redirect parameter names to check.
 */
const DEFAULT_REDIRECT_PARAMS = ["redirect", "url", "return", "next", "goto", "target", "link"];

/**
 * Safe redirect protocols.
 */
const SAFE_PROTOCOLS = ["http:", "https:", "/"];

/**
 * Common phishing TLDs to block.
 */
const PHISHING_TLDS = [".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".cc", ".top", ".pw", ".club"];

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a redirect URL for open redirect vulnerabilities.
 *
 * Checks:
 * - URL format and protocol
 * - External hostnames against allow-list
 * - Relative paths
 * - JavaScript/data protocols
 * - URL encoding attacks
 */
export function validateRedirectUrl(
  url: string,
  options: OpenRedirectOptions = {}
): RedirectValidationResult {
  const {
    allowedTargets = [],
    allowedHostnames = [],
    allowRelative = true,
    blockExternal = true,
  } = options;

  // Trim whitespace
  const trimmedUrl = url.trim();

  // Check for empty URL
  if (!trimmedUrl) {
    return {
      valid: false,
      reason: "empty_url",
      originalUrl: url,
    };
  }

  // Check for exact match in allowed targets
  if (allowedTargets.includes(trimmedUrl)) {
    return {
      valid: true,
      url: trimmedUrl,
    };
  }

  // Check for relative URL
  if (trimmedUrl.startsWith("/")) {
    if (allowRelative) {
      // Ensure relative URL doesn't contain protocol
      if (trimmedUrl.includes("//")) {
        return {
          valid: false,
          reason: "protocol_in_relative_url",
          originalUrl: url,
        };
      }

      // Prevent path traversal in relative URLs
      if (trimmedUrl.includes("..")) {
        return {
          valid: false,
          reason: "path_traversal",
          originalUrl: url,
        };
      }

      return {
        valid: true,
        url: trimmedUrl,
      };
    }

    return {
      valid: false,
      reason: "relative_url_not_allowed",
      originalUrl: url,
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return {
      valid: false,
      reason: "invalid_url_format",
      originalUrl: url,
    };
  }

  // Check protocol
  if (!SAFE_PROTOCOLS.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      reason: "unsafe_protocol",
      originalUrl: url,
    };
  }

  // Block JavaScript and data URLs (even though they should fail URL parsing)
  const lowerUrl = trimmedUrl.toLowerCase();
  if (
    lowerUrl.startsWith("javascript:") ||
    lowerUrl.startsWith("data:") ||
    lowerUrl.startsWith("vbscript:")
  ) {
    return {
      valid: false,
      reason: "dangerous_protocol",
      originalUrl: url,
    };
  }

  // Check for external redirect
  if (blockExternal) {
    // If no allowed hostnames configured, block all external redirects
    if (allowedHostnames.length === 0) {
      return {
        valid: false,
        reason: "external_redirect_blocked",
        originalUrl: url,
      };
    }

    // Check if hostname is in allow-list
    const hostname = parsedUrl.hostname.toLowerCase();
    const allowed = allowedHostnames.some((allowed) => {
      const allowedLower = allowed.toLowerCase();
      return hostname === allowedLower || hostname.endsWith(`.${allowedLower}`);
    });

    if (!allowed) {
      return {
        valid: false,
        reason: "hostname_not_allowed",
        originalUrl: url,
      };
    }
  }

  // Check for phishing TLDs
  const hostname = parsedUrl.hostname.toLowerCase();
  for (const tld of PHISHING_TLDS) {
    if (hostname.endsWith(tld)) {
      return {
        valid: false,
        reason: "suspicious_tld",
        originalUrl: url,
      };
    }
  }

  // Check for URL encoding attacks
  if (trimmedUrl !== decodeURIComponent(trimmedUrl)) {
    // URL contains encoded characters - could be an attack
    // Allow only safe encodings
    const decoded = decodeURIComponent(trimmedUrl);
    try {
      const decodedUrl = new URL(decoded);
      // If decoded URL is different, reject it
      if (decodedUrl.href !== parsedUrl.href) {
        return {
          valid: false,
          reason: "url_encoding_attack",
          originalUrl: url,
        };
      }
    } catch {
      return {
        valid: false,
        reason: "invalid_encoded_url",
        originalUrl: url,
      };
    }
  }

  return {
    valid: true,
    url: parsedUrl.href,
  };
}

/**
 * Extract redirect URLs from a request.
 *
 * Checks query parameters and request body for redirect URLs.
 */
export function extractRedirectUrls(
  c: Context,
  options: OpenRedirectOptions = {}
): Map<string, string> {
  const redirects = new Map<string, string>();
  const {
    redirectParams = DEFAULT_REDIRECT_PARAMS,
    checkQueryParams = true,
  } = options;

  // Check query parameters
  if (checkQueryParams) {
    for (const param of redirectParams) {
      const value = c.req.query(param);
      if (value) {
        redirects.set(`query.${param}`, value);
      }
    }
  }

  // Check request body (async, handled in middleware)
  // This is a synchronous helper for the middleware to use

  return redirects;
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Open redirect protection middleware factory.
 *
 * Validates redirect URLs in query parameters and request body to prevent
 * open redirect attacks. Can be configured with allow-lists for safe targets.
 *
 * @example
 * ```ts
 * // Block all external redirects
 * app.use('/api/*', openRedirectProtection({
 *   blockExternal: true,
 *   allowRelative: true,
 * }));
 *
 * // Allow specific external sites
 * app.use('/auth/*', openRedirectProtection({
 *   allowedHostnames: ['example.com', 'trusted-site.com'],
 *   blockExternal: true,
 * }));
 * ```
 */
export function openRedirectProtection(options: OpenRedirectOptions = {}): MiddlewareHandler {
  const {
    redirectParams = DEFAULT_REDIRECT_PARAMS,
    checkQueryParams = true,
    checkBody = true,
  } = options;

  return async (c, next) => {
    const violations: Array<{ param: string; url: string; reason: string }> = [];

    // Check query parameters
    if (checkQueryParams) {
      for (const param of redirectParams) {
        const value = c.req.query(param);
        if (value) {
          const result = validateRedirectUrl(value, options);
          if (!result.valid) {
            violations.push({
              param: `query.${param}`,
              url: value.slice(0, 100), // Truncate for logging
              reason: result.reason ?? "unknown",
            });
          }
        }
      }
    }

    // Check request body
    if (checkBody) {
      const contentType = c.req.header("Content-Type");
      if (contentType?.includes("application/json")) {
        try {
          const body = await c.req.json().catch(() => null);
          if (body && typeof body === "object") {
            for (const param of redirectParams) {
              if (param in body) {
                const value = body[param];
                if (typeof value === "string") {
                  const result = validateRedirectUrl(value, options);
                  if (!result.valid) {
                    violations.push({
                      param: `body.${param}`,
                      url: value.slice(0, 100),
                      reason: result.reason ?? "unknown",
                    });
                  }
                }
              }
            }
          }
        } catch {
          // Body parsing failed - continue
        }
      }
    }

    // Log violations if found
    if (violations.length > 0) {
      securityLogger.logSuspiciousActivity(
        c,
        "open_redirect_attempt",
        `Open redirect attempt blocked: ${violations.map((v) => `${v.param} (${v.reason})`).join(", ")}`
      );

      logger.warn("Open redirect attempt blocked", {
        violations,
        path: c.req.path,
        method: c.req.method,
        ip:
          c.req.header("CF-Connecting-IP") ||
          c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
          "unknown",
      });

      throw new HTTPException(400, {
        message: "Invalid redirect URL",
      });
    }

    return next();
  };
}

/**
 * Create a safe redirect response.
 *
 * This helper creates a redirect response with proper validation.
 * Use this instead of directly setting Location headers.
 */
export async function createSafeRedirect(
  c: Context,
  url: string,
  options: OpenRedirectOptions = {},
  defaultUrl = "/"
): Promise<Response> {
  const result = validateRedirectUrl(url, options);

  if (!result.valid) {
    securityLogger.logSuspiciousActivity(
      c,
      "unsafe_redirect_attempt",
      `Unsafe redirect blocked: ${result.reason} - ${url.slice(0, 100)}`
    );

    // Redirect to default URL
    return c.redirect(defaultUrl);
  }

  return c.redirect(result.url!);
}

// ============================================================================
// Common Allow-Lists
// ============================================================================

/**
 * Allowed hostnames for OAuth callbacks.
 */
export const OAUTH_ALLOWED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "mtamyway.com",
  "www.mtamyway.com",
];

/**
 * Safe redirect targets for post-login/post-logout.
 */
export const SAFE_REDIRECT_TARGETS = ["/", "/settings", "/journal", "/map"] as const;
