/**
 * HTTP Response Splitting protection middleware.
 *
 * HTTP Response Splitting (CRLFi) is an attack that allows an attacker to
 * inject arbitrary HTTP headers into the response by injecting CRLF characters
 * (\r\n) into untrusted data that's used in response headers.
 *
 * OWASP A01:2021 - Broken Access Control
 * OWASP A03:2021 - Injection
 *
 * This middleware:
 * - Detects and blocks CRLF injection attempts in headers
 * - Sanitizes redirect URLs to prevent header injection
 * - Logs blocked attempts for security monitoring
 */

import type { Context, MiddlewareHandler } from "hono";
import { securityLogger } from "./security-logging.js";

/**
 * CRLF byte sequence pattern.
 * Matches any of: \r\n, \n\r, \r, or \n
 * Global flag to replace all occurrences
 */
const CRLF_PATTERN = /(\r\n|\n\r|\r|\n)/g;

/**
 * CRLF detection pattern for injection testing.
 * Matches any individual CR or LF character.
 */
const CRLF_INJECTION_PATTERN = /[\r\n]/;

/**
 * Detects CRLF injection in a string.
 * Returns true if any CR or LF character is present.
 */
export function hasCrlfInjection(input: string): boolean {
  return CRLF_INJECTION_PATTERN.test(input);
}

/**
 * Sanitizes a string by removing CRLF characters.
 * Replaces them with a space to prevent injection.
 */
export function sanitizeCrlf(input: string): string {
  return input.replace(CRLF_PATTERN, " ");
}

/**
 * Check if a redirect URL is safe from CRLF injection.
 * Returns true if safe, false if CRLF characters are detected.
 */
export function isSafeRedirectUrl(url: string): boolean {
  // Check for CRLF injection
  if (hasCrlfInjection(url)) {
    return false;
  }

  // Additional check: ensure URL doesn't start with // (protocol-relative)
  // which could be used for header injection
  if (url.trim().startsWith("//")) {
    return false;
  }

  return true;
}

/**
 * Create a safe redirect URL by sanitizing CRLF characters.
 * Returns the sanitized URL, or null if the URL is malicious.
 */
export function createSafeRedirectUrl(url: string): string | null {
  if (!isSafeRedirectUrl(url)) {
    return null;
  }

  return url;
}

/**
 * HTTP Response Splitting protection options.
 */
export interface HttpResponseSplittingOptions {
  /** Paths to exclude from CRLF checking (default: none) */
  excludePaths?: string[];
  /** Custom action when CRLF is detected (default: block with 400) */
  onCrlfDetected?: (c: Context, detectedIn: string) => Response;
}

/**
 * HTTP Response Splitting protection middleware.
 *
 * This middleware checks response headers for CRLF injection attempts
 * before they are sent to the client. If CRLF characters are detected,
 * the request is blocked with a 400 Bad Request response.
 *
 * @example
 * ```ts
 * app.use("*", httpResponseSplitting());
 * ```
 */
export function httpResponseSplitting(
  options: HttpResponseSplittingOptions = {}
): MiddlewareHandler {
  const { excludePaths = [] } = options;

  return async (c, next) => {
    // Skip excluded paths
    if (excludePaths.some((path) => c.req.path.startsWith(path))) {
      return next();
    }

    // Check for CRLF injection in query parameters
    const queryParams = c.req.queries();
    for (const [key, value] of Object.entries(queryParams)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          if (hasCrlfInjection(v)) {
            securityLogger.logBlockedAttack(
              c,
              "http_response_splitting",
              `CRLF injection detected in query parameter: ${key}`
            );
            return c.json(
              {
                error: "Bad Request",
                message: "Invalid characters in request",
              },
              400
            );
          }
        }
      } else if (hasCrlfInjection(value)) {
        securityLogger.logBlockedAttack(
          c,
          "http_response_splitting",
          `CRLF injection detected in query parameter: ${key}`
        );
        return c.json(
          {
            error: "Bad Request",
            message: "Invalid characters in request",
          },
          400
        );
      }
    }

    // Check for CRLF injection in path parameters
    for (const [key, value] of Object.entries(c.req.param())) {
      if (hasCrlfInjection(value)) {
        securityLogger.logBlockedAttack(
          c,
          "http_response_splitting",
          `CRLF injection detected in path parameter: ${key}`
        );
        return c.json(
          {
            error: "Bad Request",
            message: "Invalid characters in request",
          },
          400
        );
      }
    }

    // Continue to next middleware
    await next();

    // Check response headers for CRLF injection
    // This catches cases where middleware or handlers set headers with user input
    const responseHeaders = c.res.headers;
    for (const [key, value] of responseHeaders.entries()) {
      if (value && hasCrlfInjection(value)) {
        securityLogger.logBlockedAttack(
          c,
          "http_response_splitting",
          `CRLF injection detected in response header: ${key}`
        );
        // Remove the malicious header
        responseHeaders.delete(key);
      }
    }
  };
}

/**
 * Helper middleware to protect redirect endpoints.
 *
 * Use this for endpoints that perform redirects based on user input.
 * This middleware checks the "url" query parameter before the handler executes.
 *
 * @example
 * ```ts
 * app.get("/redirect", protectRedirect(), (c) => {
 *   const url = c.req.query("url");
 *   if (!url) return c.json({ error: "Missing URL" }, 400);
 *   return c.redirect(url);
 * });
 * ```
 */
export function protectRedirect(): MiddlewareHandler {
  return async (c, next) => {
    // Check the URL query parameter before the handler executes
    const url = c.req.query("url");
    if (url && !isSafeRedirectUrl(url)) {
      securityLogger.logBlockedAttack(
        c,
        "http_response_splitting",
        "CRLF injection detected in redirect URL"
      );
      return c.json(
        {
          error: "Bad Request",
          message: "Invalid redirect URL",
        },
        400
      );
    }

    await next();

    // Also check the response Location header for safety
    const status = c.res.status;
    if (status >= 300 && status < 400) {
      const location = c.res.headers.get("Location");
      if (location && !isSafeRedirectUrl(location)) {
        securityLogger.logBlockedAttack(
          c,
          "http_response_splitting",
          "CRLF injection detected in redirect Location header"
        );
        // Override the redirect with an error
        return c.json(
          {
            error: "Bad Request",
            message: "Invalid redirect URL",
          },
          400
        );
      }
    }
  };
}
