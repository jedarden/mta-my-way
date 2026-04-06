/**
 * Path traversal prevention middleware for Hono.
 *
 * Protects against directory traversal attacks by detecting and blocking
 * path sequences like ../, ..\, URL-encoded variations, and other attempts
 * to access files outside the intended directory.
 */

import type { MiddlewareHandler } from "hono";

/**
 * Path traversal patterns to detect.
 *
 * These patterns represent various ways attackers attempt to traverse
 * the directory structure, including:
 * - Standard ../ and ..\ sequences
 * - URL-encoded variations (%2e%2e, %252e, etc.)
 * - Double-encoded variations
 * - Unicode and alternative encodings
 * - Null byte injection attempts
 */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//, // ../
  /\.\.\\/, // ..\
  /%2e%2e/i, // URL-encoded ..
  /%252e/i, // Double-encoded .
  /%c0%ae/i, // Unicode overlong encoding
  /\.\.%2f/i, // Mixed . and encoded /
  /\.\.%5c/i, // Mixed . and encoded \
  /%2e%2e%2f/i, // ../ fully encoded
  /%2e%2e%5c/i, // ..\ fully encoded
  /%u002e%u002e/i, // Unicode-encoded ..
  /\x00/, // Null byte injection
];

/**
 * Additional suspicious patterns that may indicate path traversal attempts.
 */
const SUSPICIOUS_PATTERNS = [
  /\.\.[\/\\]/, // ../ or ..\
  /%5c/i, // Encoded backslash
  /%2f/i, // Encoded forward slash
  /\.{2,}/, // Two or more dots (potential obfuscation)
  /~.*%2f/i, // Tilde with encoded slash (home directory traversal)
  /%00/i, // Null byte in URL encoding
];

/**
 * Options for path traversal prevention.
 */
interface PathTraversalOptions {
  /** Check URL path (default: true) */
  checkPath?: boolean;
  /** Check query parameters (default: true) */
  checkQuery?: boolean;
  /** Check request headers (default: false) */
  checkHeaders?: boolean;
  /** Custom blocklist of patterns (optional) */
  customBlocklist?: RegExp[];
}

/**
 * Sanitize a string by checking for path traversal patterns.
 *
 * @param input - The string to check
 * @param patterns - Array of regex patterns to check against
 * @returns true if the input contains suspicious patterns
 */
function containsPathTraversal(input: string, patterns: RegExp[]): boolean {
  for (const pattern of patterns) {
    if (pattern.test(input)) {
      return true;
    }
  }
  return false;
}

/**
 * Path traversal prevention middleware.
 *
 * Blocks requests containing path traversal sequences in the URL path,
 * query parameters, or optionally headers. Returns 400 Bad Request with
 * a generic error message when traversal is detected.
 *
 * Note: This middleware provides defense in depth. The primary protection
 * should always be proper input validation and using safe APIs (e.g., path.join)
 * that handle path sanitization correctly.
 */
export function pathTraversalPrevention(options: PathTraversalOptions = {}): MiddlewareHandler {
  const {
    checkPath = true,
    checkQuery = true,
    checkHeaders = false,
    customBlocklist = [],
  } = options;

  const allPatterns = [...PATH_TRAVERSAL_PATTERNS, ...SUSPICIOUS_PATTERNS, ...customBlocklist];

  return async (c, next) => {
    // Check URL path for traversal patterns
    if (checkPath) {
      const path = c.req.path;
      if (containsPathTraversal(path, allPatterns)) {
        console.warn(
          JSON.stringify({
            event: "path_traversal_blocked",
            timestamp: new Date().toISOString(),
            path,
            ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
          })
        );
        return c.json({ error: "Invalid request path" }, 400);
      }
    }

    // Check query parameters
    if (checkQuery) {
      const queryParams = c.req.query();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value && containsPathTraversal(value, allPatterns)) {
          console.warn(
            JSON.stringify({
              event: "path_traversal_blocked",
              timestamp: new Date().toISOString(),
              location: "query",
              parameter: key,
              ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
            })
          );
          return c.json({ error: "Invalid request parameter" }, 400);
        }
        // Also check parameter names
        if (containsPathTraversal(key, allPatterns)) {
          console.warn(
            JSON.stringify({
              event: "path_traversal_blocked",
              timestamp: new Date().toISOString(),
              location: "query_param_name",
              parameter: key,
              ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
            })
          );
          return c.json({ error: "Invalid request parameter" }, 400);
        }
      }
    }

    // Check headers (optional, as some headers may legitimately contain dots)
    if (checkHeaders) {
      for (const [key, value] of c.req.raw.headers.entries()) {
        if (value && containsPathTraversal(value, allPatterns)) {
          console.warn(
            JSON.stringify({
              event: "path_traversal_blocked",
              timestamp: new Date().toISOString(),
              location: "header",
              header: key,
              ip: c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
            })
          );
          return c.json({ error: "Invalid request header" }, 400);
        }
      }
    }

    await next();
  };
}

/**
 * Helper function to validate file paths.
 *
 * Use this when handling file paths in application code to ensure
 * they don't contain path traversal sequences.
 *
 * @param filePath - The file path to validate
 * @returns true if the path is safe, false otherwise
 */
export function isSafePath(filePath: string): boolean {
  return !containsPathTraversal(filePath, [
    ...PATH_TRAVERSAL_PATTERNS,
    ...SUSPICIOUS_PATTERNS,
  ]);
}
