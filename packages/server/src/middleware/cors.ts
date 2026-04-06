/**
 * CORS middleware for Hono.
 *
 * Configures Cross-Origin Resource Sharing headers for secure API access.
 * Only allows requests from configured origins (default: same-origin).
 */

import type { MiddlewareHandler } from "hono";

/**
 * CORS configuration options.
 */
interface CorsOptions {
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
}

const DEFAULT_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"];
const DEFAULT_ALLOWED_HEADERS = ["Content-Type", "Authorization"];
const DEFAULT_MAX_AGE = 86400; // 24 hours

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
  } = options;

  return async (c, next) => {
    // Get origin from request
    const origin = c.req.header("Origin");

    // Set Access-Control-Allow-Origin based on allowed origins
    if (allowedOrigins.length === 0) {
      // Same-origin: only set if origin matches request host
      if (origin) {
        const requestHost = c.req.header("Host");
        const requestOrigin = new URL(origin).hostname;
        // Compare hostnames, accounting for port in Host header
        const hostWithoutPort = requestHost?.split(":")[0];
        if (hostWithoutPort && requestOrigin === hostWithoutPort) {
          c.res.headers.set("Access-Control-Allow-Origin", origin);
        }
      }
    } else if (allowedOrigins.includes("*")) {
      // Allow all origins
      c.res.headers.set("Access-Control-Allow-Origin", "*");
    } else if (origin && allowedOrigins.includes(origin)) {
      // Specific allowed origin
      c.res.headers.set("Access-Control-Allow-Origin", origin);
      // Vary header for caching
      c.res.headers.append("Vary", "Origin");
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

      // Credentials
      if (allowCredentials) {
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
    if (allowCredentials) {
      c.res.headers.set("Access-Control-Allow-Credentials", "true");
    }
  };
}
