/**
 * HTTP Request Smuggling protection middleware.
 *
 * HTTP Request Smuggling is an attack that allows an attacker to interfere
 * with the way a web server processes requests, potentially allowing them to
 * bypass security controls, gain unauthorized access, or perform other attacks.
 *
 * OWASP A01:2021 - Broken Access Control
 * OWASP A03:2021 - Injection
 * CWE-444: Inconsistent Interpretation of HTTP Requests ('HTTP Request Smuggling')
 *
 * This middleware:
 * - Validates Content-Length header consistency
 * - Detects Transfer-Encoding abuse attempts
 * - Blocks requests with conflicting length headers
 * - Logs suspicious smuggling attempts
 */

import type { Context, MiddlewareHandler } from "hono";
import { securityLogger } from "./security-logging.js";

/**
 * Transfer-Encoding patterns that may indicate smuggling attempts.
 */
const SUSPICIOUS_TRANSFER_ENCODING = ["chunked", "gzip", "deflate", "compress", "identity", "br"];

/**
 * Patterns that indicate potential request smuggling attempts.
 * Note: These patterns are checked in unexpected places like query parameters,
 * path parameters, and custom headers - not in standard HTTP headers.
 */
const SMUGGLING_PATTERNS = [
  // Double encoding attempts
  /%2532%36/i, // %26 (&)
  /%250%260/i, // double-encoded &
  // Null bytes
  /\x00/,
  // CRLF sequences (potential CRLF injection) - detect any CRLF in unexpected places
  /\r\n/g,
  // Chunked encoding in unexpected places (when not in Transfer-Encoding header)
  /chunked/i,
  // HTTP request manipulation attempts in parameters/custom values
  /Transfer-Encoding(?!\s*:)/i, // Not "Transfer-Encoding: value" format
  /Content-Length(?!\s*:)/i, // Not "Content-Length: value" format
];

/**
 * Standard HTTP headers that should not be checked for smuggling patterns
 * (they are validated separately)
 */
const STANDARD_HEADERS = new Set([
  "content-length",
  "transfer-encoding",
  "content-type",
  "content-encoding",
  "accept",
  "accept-encoding",
  "authorization",
  "host",
  "connection",
  "cache-control",
  "user-agent",
  "referer",
  "origin",
  "sec-",
  "x-",
]);

/**
 * Check if a header value contains suspicious patterns.
 */
export function hasSmugglingPatterns(value: string): boolean {
  if (!value) return false;

  return SMUGGLING_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Validate Content-Length header value.
 * Returns true if valid, false otherwise.
 * Note: This only checks if the value is a valid non-negative integer.
 * Size limits are enforced separately in the middleware.
 */
export function isValidContentLength(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return true; // Missing Content-Length is OK for some requests
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return false;
  }

  // Content-Length must be non-negative
  if (parsed < 0) {
    return false;
  }

  return true;
}

/**
 * Check for Transfer-Encoding header abuse.
 * Returns true if abuse is detected.
 */
export function hasTransferEncodingAbuse(transferEncoding: string | null | undefined): boolean {
  if (!transferEncoding) {
    return false;
  }

  // Check for multiple Transfer-Encoding values (comma-separated)
  const encodings = transferEncoding.split(",").map((e) => e.trim().toLowerCase());

  // Multiple encodings can indicate smuggling attempts
  if (encodings.length > 1) {
    return true;
  }

  // Check for suspicious encoding combinations
  const encoding = encodings[0]!;
  if (encoding.includes("chunked") && transferEncoding.includes("identity")) {
    return true;
  }

  return false;
}

/**
 * Check for conflicting Content-Length and Transfer-Encoding headers.
 * RFC 7230 states that if both are present, Transfer-Encoding takes precedence,
 * but both being present can still indicate smuggling attempts.
 */
export function hasConflictingLengthHeaders(
  contentLength: string | null | undefined,
  transferEncoding: string | null | undefined
): boolean {
  // Both headers present is suspicious
  return !!(contentLength && transferEncoding);
}

/**
 * HTTP Request Smuggling protection options.
 */
export interface HttpRequestSmugglingOptions {
  /** Maximum allowed Content-Length value (default: 100MB) */
  maxContentLength?: number;
  /** Whether to block requests with both Content-Length and Transfer-Encoding (default: true) */
  blockConflictingHeaders?: boolean;
  /** Paths to exclude from checks (default: none) */
  excludePaths?: string[];
}

/**
 * HTTP Request Smuggling protection middleware.
 *
 * This middleware validates HTTP request headers to detect and prevent
 * request smuggling attempts.
 *
 * @example
 * ```ts
 * app.use("*", httpRequestSmuggling());
 * ```
 */
export function httpRequestSmuggling(options: HttpRequestSmugglingOptions = {}): MiddlewareHandler {
  const {
    maxContentLength = 100 * 1024 * 1024, // 100MB
    blockConflictingHeaders = true,
    excludePaths = [],
  } = options;

  return async (c, next) => {
    // Skip excluded paths
    if (excludePaths.some((path) => c.req.path.startsWith(path))) {
      return next();
    }

    const contentLength = c.req.header("Content-Length");
    const transferEncoding = c.req.header("Transfer-Encoding");

    // Check Content-Length validity
    if (contentLength && !isValidContentLength(contentLength)) {
      securityLogger.logBlockedAttack(
        c,
        "http_request_smuggling",
        `Invalid Content-Length header: ${contentLength}`
      );
      return c.json(
        {
          error: "Bad Request",
          message: "Invalid Content-Length header",
        },
        400
      );
    }

    // Check for Content-Length exceeding maximum
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (length > maxContentLength) {
        securityLogger.logBlockedAttack(
          c,
          "http_request_smuggling",
          `Content-Length exceeds maximum: ${length} > ${maxContentLength}`
        );
        return c.json(
          {
            error: "Payload Too Large",
            message: "Request body too large",
          },
          413
        );
      }
    }

    // Check for Transfer-Encoding abuse
    if (transferEncoding && hasTransferEncodingAbuse(transferEncoding)) {
      securityLogger.logBlockedAttack(
        c,
        "http_request_smuggling",
        `Suspicious Transfer-Encoding header: ${transferEncoding}`
      );
      return c.json(
        {
          error: "Bad Request",
          message: "Invalid Transfer-Encoding header",
        },
        400
      );
    }

    // Check for conflicting length headers
    if (blockConflictingHeaders && hasConflictingLengthHeaders(contentLength, transferEncoding)) {
      securityLogger.logBlockedAttack(
        c,
        "http_request_smuggling",
        "Conflicting Content-Length and Transfer-Encoding headers"
      );
      return c.json(
        {
          error: "Bad Request",
          message: "Conflicting length headers",
        },
        400
      );
    }

    // Check all headers for smuggling patterns
    // Skip standard HTTP headers which are validated separately
    const headers = c.req.raw.headers;
    for (const [key, value] of headers.entries()) {
      const lowerKey = key.toLowerCase();
      // Skip standard headers - they're validated by specific checks above
      const isStandardHeader =
        lowerKey === "content-length" ||
        lowerKey === "transfer-encoding" ||
        lowerKey.startsWith("content-") ||
        lowerKey.startsWith("accept-") ||
        lowerKey === "authorization" ||
        lowerKey === "host" ||
        lowerKey === "connection" ||
        lowerKey === "cache-control" ||
        lowerKey.startsWith("sec-");

      if (!isStandardHeader && value && hasSmugglingPatterns(value)) {
        securityLogger.logBlockedAttack(
          c,
          "http_request_smuggling",
          `Smuggling pattern detected in header: ${key}`
        );
        return c.json(
          {
            error: "Bad Request",
            message: "Invalid request header",
          },
          400
        );
      }
    }

    // Check query parameters for smuggling patterns
    const queryParams = c.req.queries();
    for (const [key, value] of Object.entries(queryParams)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          if (v && hasSmugglingPatterns(v)) {
            securityLogger.logBlockedAttack(
              c,
              "http_request_smuggling",
              `Smuggling pattern detected in query parameter: ${key}`
            );
            return c.json(
              {
                error: "Bad Request",
                message: "Invalid query parameter",
              },
              400
            );
          }
        }
      } else if (value && hasSmugglingPatterns(value)) {
        securityLogger.logBlockedAttack(
          c,
          "http_request_smuggling",
          `Smuggling pattern detected in query parameter: ${key}`
        );
        return c.json(
          {
            error: "Bad Request",
            message: "Invalid query parameter",
          },
          400
        );
      }
    }

    // Check path parameters for smuggling patterns
    for (const [key, value] of Object.entries(c.req.param())) {
      if (value && hasSmugglingPatterns(value)) {
        securityLogger.logBlockedAttack(
          c,
          "http_request_smuggling",
          `Smuggling pattern detected in path parameter: ${key}`
        );
        return c.json(
          {
            error: "Bad Request",
            message: "Invalid path parameter",
          },
          400
        );
      }
    }

    // Check the request path itself
    if (hasSmugglingPatterns(c.req.path)) {
      securityLogger.logBlockedAttack(
        c,
        "http_request_smuggling",
        "Smuggling pattern detected in request path"
      );
      return c.json(
        {
          error: "Bad Request",
          message: "Invalid request path",
        },
        400
      );
    }

    await next();
  };
}

/**
 * Strict HTTP Request Smuggling protection.
 *
 * This version applies stricter rules for high-security endpoints.
 * Blocks any request with unusual header patterns or encoding.
 */
export function strictHttpRequestSmuggling(
  options: Omit<HttpRequestSmugglingOptions, "blockConflictingHeaders"> = {}
): MiddlewareHandler {
  return httpRequestSmuggling({
    ...options,
    blockConflictingHeaders: true,
    maxContentLength: options.maxContentLength ?? 10 * 1024 * 1024, // 10MB default
  });
}
