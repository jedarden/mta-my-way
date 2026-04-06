/**
 * HTTP caching middleware for API responses.
 *
 * Provides granular cache control headers for different resource types:
 * - Static data (stations, routes, complexes): long TTL with stale-while-revalidate
 * - Semi-static data (equipment, alerts): moderate TTL
 * - Real-time data (arrivals, positions): short TTL or no-cache
 * - Private data (user subscriptions): no-cache
 *
 * All cache headers include stale-while-revalidate where appropriate to enable
 * offline functionality via Service Worker.
 */

import type { MiddlewareHandler } from "hono";

/** Cache TTL configuration (seconds) */
const CACHE_TTLS = {
  /** Static reference data: 24 hours */
  static: 86400,
  /** Static data with stale-while-revalidate: 7 days */
  staticStale: 604800,
  /** Semi-static data (equipment, shuttle info): 5 minutes */
  semiStatic: 300,
  /** Real-time data (arrivals, positions): 30 seconds */
  realtime: 30,
  /** API responses with stale-while-revalidate: 2 minutes */
  api: 120,
  /** Health/status: 1 minute */
  health: 60,
  /** No caching for private/transactional data */
  private: 0,
} as const;

/**
 * Helper to build Cache-Control header
 */
function buildCacheHeader(options: {
  maxAge: number;
  staleWhileRevalidate?: number;
  mustRevalidate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  private?: boolean;
}): string {
  const parts: string[] = [];

  if (options.noCache) {
    parts.push("no-cache");
    return parts.join(", ");
  }

  if (options.noStore) {
    parts.push("no-store");
    return parts.join(", ");
  }

  if (options.private) {
    parts.push("private");
  } else {
    parts.push("public");
  }

  if (options.maxAge > 0) {
    parts.push(`max-age=${options.maxAge}`);
  }

  if (options.staleWhileRevalidate && options.staleWhileRevalidate > 0) {
    parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }

  if (options.mustRevalidate) {
    parts.push("must-revalidate");
  }

  return parts.join(", ");
}

/**
 * Middleware factory for different cache strategies
 */

/**
 * Cache static reference data (stations, routes, complexes)
 * Long TTL with stale-while-revalidate for offline support
 */
export function staticCache(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status === 200) {
      c.header(
        "Cache-Control",
        buildCacheHeader({
          maxAge: CACHE_TTLS.static,
          staleWhileRevalidate: CACHE_TTLS.staticStale,
        })
      );
    }
  };
}

/**
 * Cache semi-static data (equipment, alerts)
 * Moderate TTL with stale-while-revalidate
 */
export function semiStaticCache(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status === 200) {
      c.header(
        "Cache-Control",
        buildCacheHeader({
          maxAge: CACHE_TTLS.semiStatic,
          staleWhileRevalidate: CACHE_TTLS.semiStatic,
        })
      );
    }
  };
}

/**
 * Cache real-time data (arrivals, positions)
 * Short TTL for freshness, but with stale fallback
 */
export function realtimeCache(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status === 200) {
      c.header(
        "Cache-Control",
        buildCacheHeader({
          maxAge: CACHE_TTLS.realtime,
          staleWhileRevalidate: CACHE_TTLS.realtime * 2,
        })
      );
    }
  };
}

/**
 * Cache API responses with moderate TTL
 * Good for commute analysis, trip data
 */
export function apiCache(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status === 200) {
      c.header(
        "Cache-Control",
        buildCacheHeader({
          maxAge: CACHE_TTLS.api,
          staleWhileRevalidate: CACHE_TTLS.api * 2,
        })
      );
    }
  };
}

/**
 * Cache health/status endpoints
 * Short TTL to prevent excessive health checks
 */
export function healthCache(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.res.status === 200) {
      c.header(
        "Cache-Control",
        buildCacheHeader({
          maxAge: CACHE_TTLS.health,
          staleWhileRevalidate: CACHE_TTLS.health * 2,
        })
      );
    }
  };
}

/**
 * Disable caching for private/transactional data
 * Used for push subscriptions, user-specific mutations
 */
export function noCache(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("Cache-Control", buildCacheHeader({ noCache: true }));
  };
}

/**
 * No-store for sensitive data that should never be cached
 */
export function noStore(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("Cache-Control", buildCacheHeader({ noStore: true }));
  };
}

/**
 * ETag support for conditional requests
 * Adds ETag header based on response body hash
 */
export function etagCache(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    // Only add ETag for successful JSON responses
    if (c.res.status === 200 && c.res.headers.get("Content-Type")?.includes("json")) {
      // Create a simple hash from the response
      const body = await c.res.clone().text();
      const hash = Buffer.from(body).toString("base64").slice(0, 27);
      c.header("ETag", `"${hash}"`);
    }
  };
}

/**
 * Conditional request handling (If-None-Match)
 * Returns 304 Not Modified if ETag matches
 */
export function conditionalGet(): MiddlewareHandler {
  return async (c, next) => {
    const ifNoneMatch = c.req.header("If-None-Match");
    if (!ifNoneMatch) {
      await next();
      return;
    }

    // Let the handler run, then check if ETag matches
    await next();

    const etag = c.res.headers.get("ETag");
    if (etag && ifNoneMatch === etag && c.res.status === 200) {
      // Return 304 with empty body
      return new Response(null, {
        status: 304,
        headers: c.res.headers,
      });
    }
  };
}

/**
 * Cache header for immutable assets (content-hashed filenames)
 */
export function immutableCache(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  };
}
