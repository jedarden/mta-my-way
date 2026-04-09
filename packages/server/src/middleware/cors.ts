/**
 * CORS middleware for Hono.
 *
 * Configures Cross-Origin Resource Sharing headers for secure API access.
 * Only allows requests from configured origins (default: same-origin).
 */

import type { MiddlewareHandler } from "hono";
import { securityLogger } from "./security-logging.js";

/**
 * Origin validation result.
 */
interface OriginValidationResult {
  valid: boolean;
  origin?: string;
  reason?: string;
}

/**
 * CORS configuration options.
 */
export interface CorsOptions {
  /** Allowed origins (default: same-origin) */
  allowedOrigins?: string[];
  /** Allowed methods (default: GET, HEAD, POST, PUT, DELETE, PATCH) */
  allowedMethods?: string[];
  /** Allowed headers (default: Content-Type, Authorization) */
  allowedHeaders?: string[];
  /** Exposed headers for client (default: none) */
  exposedHeaders?: string[];
  /** Allow credentials (cookies, auth) */
  allowCredentials?: boolean;
  /** Max age for preflight cache (seconds) */
  maxAge?: number;
  /** Block private network origins (localhost, 127.0.0.1, etc.) */
  blockPrivateNetworks?: boolean;
  /** Block null origin (sandboxed iframes, local files) */
  blockNullOrigin?: boolean;
  /** Log rejected origins for security monitoring */
  logRejections?: boolean;
  /** Custom origin validation function */
  originValidator?: (origin: string) => boolean;
}

const DEFAULT_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"];
const DEFAULT_ALLOWED_HEADERS = ["Content-Type", "Authorization"];
const DEFAULT_MAX_AGE = 86400; // 24 hours

/**
 * Private network patterns to block.
 */
const PRIVATE_NETWORK_PATTERNS = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https?:\/\/127\.\d+\.\d+\.\d+(?::\d+)?$/i,
  /^https?:\/\/0\.0\.0\.0(?::\d+)?$/i,
  /^https?:\/\/::1(?::\d+)?$/i,
  /^https?:\/\/10\.\d+\.\d+\.\d+(?::\d+)?$/i, // 10.0.0.0/8
  /^https?:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(?::\d+)?$/i, // 172.16.0.0/12
  /^https?:\/\/192\.168\.\d+\.\d+(?::\d+)?$/i, // 192.168.0.0/16
  /^https?:\/\/file:\/\//i,
  /^https?:\/\/.*\.local(?::\d+)?$/i, // .local TLD
];

/**
 * Check if an origin matches a private network pattern.
 */
function isPrivateNetworkOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    return PRIVATE_NETWORK_PATTERNS.some((pattern) => pattern.test(origin));
  } catch {
    return false;
  }
}

/**
 * Validate an origin against allowed origins.
 */
function validateOrigin(
  origin: string | undefined,
  requestHost: string | undefined,
  options: CorsOptions
): OriginValidationResult {
  // No origin header = same-origin request (allow)
  if (!origin) {
    return { valid: true };
  }

  // Handle null origin
  if (origin === "null") {
    if (options.blockNullOrigin) {
      return { valid: false, reason: "null_origin_blocked" };
    }
    // When not blocking, allow null origin
    return { valid: true, origin: "null" };
  }

  // Handle private network origins
  if (isPrivateNetworkOrigin(origin)) {
    if (options.blockPrivateNetworks) {
      return { valid: false, reason: "private_network_blocked" };
    }
    // When not blocking private networks, allow them through
    return { valid: true, origin };
  }

  // Check custom validator first
  if (options.originValidator) {
    const valid = options.originValidator(origin);
    if (!valid) {
      return { valid: false, reason: "custom_validator_failed" };
    }
    return { valid: true, origin };
  }

  // No allowed origins configured = same-origin only
  if (options.allowedOrigins === undefined || options.allowedOrigins.length === 0) {
    if (requestHost) {
      try {
        const requestOrigin = new URL(origin).hostname;
        const hostWithoutPort = requestHost.split(":")[0];
        if (hostWithoutPort && requestOrigin === hostWithoutPort) {
          return { valid: true, origin };
        }
      } catch {
        return { valid: false, reason: "invalid_origin_url" };
      }
    }
    return { valid: false, reason: "origin_not_allowed" };
  }

  // Wildcard = allow all origins
  if (options.allowedOrigins.includes("*")) {
    return { valid: true, origin: "*" };
  }

  // Exact match against allowed origins
  if (options.allowedOrigins.includes(origin)) {
    return { valid: true, origin };
  }

  return { valid: false, reason: "origin_not_in_allowlist" };
}

/**
 * CORS middleware factory.
 *
 * @param options - CORS configuration
 * @returns Hono middleware
 */
export function cors(options: CorsOptions = {}): MiddlewareHandler {
  const {
    allowedOrigins = [],
    allowedMethods = DEFAULT_ALLOWED_METHODS,
    allowedHeaders = DEFAULT_ALLOWED_HEADERS,
    exposedHeaders = [],
    allowCredentials = false,
    maxAge = DEFAULT_MAX_AGE,
    blockPrivateNetworks = true,
    blockNullOrigin = true,
    logRejections = true,
  } = options;

  return async (c, next) => {
    const origin = c.req.header("Origin");
    const requestHost = c.req.header("Host");

    // Validate origin
    const validationResult = validateOrigin(origin, requestHost, options);

    if (!validationResult.valid && origin) {
      // Log rejected origins for security monitoring
      if (logRejections) {
        securityLogger.logSuspiciousRequest(
          c,
          "cors_origin_rejected",
          `Origin rejected: ${validationResult.reason}`
        );
      }
      // Don't set CORS headers for rejected origins
      return next();
    }

    // Set Access-Control-Allow-Origin based on validation result
    if (validationResult.valid && validationResult.origin) {
      if (validationResult.origin === "*") {
        c.res.headers.set("Access-Control-Allow-Origin", "*");
      } else {
        c.res.headers.set("Access-Control-Allow-Origin", validationResult.origin);
        // Vary header for caching when using specific origins
        c.res.headers.append("Vary", "Origin");
      }
    }

    // Handle preflight request
    if (c.req.method === "OPTIONS") {
      // Pre-flight response methods
      c.res.headers.set("Access-Control-Allow-Methods", allowedMethods.join(", "));

      // Pre-flight response headers
      c.res.headers.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));

      // Exposed headers
      if (exposedHeaders.length > 0) {
        c.res.headers.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));
      }

      // Credentials (cannot be used with wildcard origin)
      if (allowCredentials && validationResult.origin !== "*") {
        c.res.headers.set("Access-Control-Allow-Credentials", "true");
      }

      // Max age for preflight cache
      c.res.headers.set("Access-Control-Max-Age", maxAge.toString());

      // Return early for preflight
      return c.body(null, 204);
    }

    // Regular request handling
    await next();

    // Exposed headers for non-preflight requests
    if (exposedHeaders.length > 0) {
      c.res.headers.set("Access-Control-Expose-Headers", exposedHeaders.join(", "));
    }

    // Credentials for non-preflight requests
    if (allowCredentials && validationResult.origin !== "*") {
      c.res.headers.set("Access-Control-Allow-Credentials", "true");
    }
  };
}
