/**
 * Application-level API response caching using Cache API.
 *
 * Works alongside the service worker's runtime caching to provide:
 * - Explicit cache control from application code
 * - Ability to check cache status and availability
 * - Manual cache invalidation when needed
 * - Better integration with offline detection
 *
 * Cache strategies per endpoint type:
 * - STATIC: Long-lived cache (stations, routes, complexes)
 * - SEMI_STATIC: Medium cache with background refresh (equipment, alerts)
 * - REALTIME: Short cache with network priority (arrivals, positions)
 * - NONE: No caching (push subscribe/unsubscribe)
 */

const CACHE_NAME = "mta-api-cache-v1";
const CACHE_ENABLED = true;

// Cache TTL configuration (in milliseconds)
const CACHE_TTL = {
  STATIC: 7 * 24 * 60 * 60 * 1000, // 7 days
  SEMI_STATIC: 30 * 60 * 1000, // 30 minutes
  REALTIME: 30 * 1000, // 30 seconds
  HEALTH: 60 * 1000, // 1 minute
  COMMUTE: 5 * 60 * 1000, // 5 minutes
  TRIP: 45 * 1000, // 45 seconds
};

export type CacheStrategy =
  | "STATIC"
  | "SEMI_STATIC"
  | "REALTIME"
  | "HEALTH"
  | "COMMUTE"
  | "TRIP"
  | "NONE";

interface CachedResponse<T> {
  data: T;
  cachedAt: number;
  ttl: number;
}

/**
 * Get cache strategy for an API endpoint (exported for testing)
 */
export function getCacheStrategyForPath(path: string): CacheStrategy {
  if (path.startsWith("/api/stations") && !path.includes("/search")) return "STATIC";
  if (path.startsWith("/api/routes")) return "STATIC";
  if (path.startsWith("/api/static/complexes")) return "STATIC";
  if (path.startsWith("/api/equipment")) return "SEMI_STATIC";
  if (path.startsWith("/api/alerts")) return "SEMI_STATIC";
  if (path.startsWith("/api/arrivals")) return "REALTIME";
  if (path.startsWith("/api/positions")) return "REALTIME";
  if (path.startsWith("/api/health")) return "HEALTH";
  if (path.startsWith("/api/commute")) return "COMMUTE";
  if (path.startsWith("/api/trip/")) return "TRIP";
  if (path.startsWith("/api/push")) return "NONE";
  return "NONE";
}

/**
 * Get TTL for a cache strategy
 */
function getTTLForStrategy(strategy: CacheStrategy): number {
  switch (strategy) {
    case "STATIC":
      return CACHE_TTL.STATIC;
    case "SEMI_STATIC":
      return CACHE_TTL.SEMI_STATIC;
    case "REALTIME":
      return CACHE_TTL.REALTIME;
    case "HEALTH":
      return CACHE_TTL.HEALTH;
    case "COMMUTE":
      return CACHE_TTL.COMMUTE;
    case "TRIP":
      return CACHE_TTL.TRIP;
    case "NONE":
      return 0;
  }
}

/**
 * Initialize the cache
 */
async function initCache(): Promise<Cache> {
  if (!CACHE_ENABLED || !("caches" in window)) {
    throw new Error("Cache API not available");
  }
  return await caches.open(CACHE_NAME);
}

/**
 * Generate a cache key from URL and options
 */
function generateCacheKey(path: string, options?: RequestInit): string {
  const url = new URL(path, window.location.origin);

  // For POST requests, include the body in the cache key
  if (options?.method === "POST" && options.body) {
    url.searchParams.set("_body", String(options.body));
  }

  // For DELETE requests, include the body in the cache key
  if (options?.method === "DELETE" && options.body) {
    url.searchParams.set("_body", String(options.body));
  }

  return url.toString();
}

/**
 * Check if a cached response is still valid
 */
function isCacheEntryValid<T>(entry: CachedResponse<T>): boolean {
  return Date.now() - entry.cachedAt < entry.ttl;
}

/**
 * Get cached response if available and valid
 */
export async function getCached<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const cache = await initCache();
    const key = generateCacheKey(path, options);
    const response = await cache.match(key);

    if (!response) {
      return null;
    }

    const entry: CachedResponse<T> = await response.json();

    if (!isCacheEntryValid(entry)) {
      // Cache expired, remove it
      await cache.delete(key);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Set cached response
 */
export async function setCached<T>(
  path: string,
  data: T,
  options?: RequestInit,
  strategy?: CacheStrategy
): Promise<void> {
  try {
    const cache = await initCache();
    const key = generateCacheKey(path, options);
    const resolvedStrategy = strategy ?? getCacheStrategyForPath(path);
    const ttl = getTTLForStrategy(resolvedStrategy);

    if (ttl === 0) {
      return; // Don't cache if TTL is 0
    }

    const entry: CachedResponse<T> = {
      data,
      cachedAt: Date.now(),
      ttl,
    };

    const response = new Response(JSON.stringify(entry), {
      headers: {
        "Content-Type": "application/json",
      },
    });

    await cache.put(key, response);
  } catch {
    // Silently fail if caching doesn't work
  }
}

/**
 * Invalidate cached response(s)
 */
export async function invalidateCache(pathPattern?: string): Promise<void> {
  try {
    const cache = await initCache();

    if (!pathPattern) {
      // Clear all cache
      const keys = await cache.keys();
      await Promise.all(keys.map((key) => cache.delete(key)));
      return;
    }

    // Clear matching cache entries
    const keys = await cache.keys();
    await Promise.all(
      keys.filter((key) => key.url.includes(pathPattern)).map((key) => cache.delete(key))
    );
  } catch {
    // Silently fail if cache invalidation doesn't work
  }
}

/**
 * Check if cached data exists for a path
 */
export async function hasCached(path: string, options?: RequestInit): Promise<boolean> {
  try {
    const cache = await initCache();
    const key = generateCacheKey(path, options);
    const response = await cache.match(key);
    return response !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  size: number;
  entries: Array<{ url: string; timestamp: number }>;
}> {
  try {
    const cache = await initCache();
    const keys = await cache.keys();
    const entries: Array<{ url: string; timestamp: number }> = [];

    for (const key of keys) {
      const response = await cache.match(key);
      if (response) {
        const entry = await response.json();
        entries.push({
          url: key.url,
          timestamp: entry.cachedAt,
        });
      }
    }

    return {
      size: keys.length,
      entries: entries.sort((a, b) => b.timestamp - a.timestamp),
    };
  } catch {
    return { size: 0, entries: [] };
  }
}

/**
 * Wrapper function for cached API calls
 *
 * Usage:
 * ```ts
 * const data = await cachedFetch("/api/stations", () => fetchJson("/api/stations"));
 * ```
 */
export async function cachedFetch<T>(
  path: string,
  fetcher: () => Promise<T>,
  options?: {
    strategy?: CacheStrategy;
    forceRefresh?: boolean;
    fetchOptions?: RequestInit;
  }
): Promise<T> {
  const { strategy, forceRefresh = false, fetchOptions } = options ?? {};

  // Try to get from cache first (unless force refresh is requested)
  if (!forceRefresh) {
    const cached = await getCached<T>(path, fetchOptions);
    if (cached !== null) {
      return cached;
    }
  }

  // Fetch from network
  const data = await fetcher();

  // Cache the response
  await setCached(path, data, fetchOptions, strategy);

  return data;
}

/**
 * Preload specific endpoints into cache
 */
export async function preloadCache(paths: string[]): Promise<void> {
  const { api } = await import("./api");

  const promises = paths.map(async (path) => {
    try {
      if (path === "/api/stations") {
        await cachedFetch(path, () => api.getStations());
      } else if (path === "/api/routes") {
        await cachedFetch(path, () => api.getRoutes());
      } else if (path === "/api/static/complexes") {
        await cachedFetch(path, () => api.getComplexes());
      }
    } catch {
      // Silently fail preload errors
    }
  });

  await Promise.all(promises);
}

/**
 * Export cache utilities
 */
export const apiCache = {
  get: getCached,
  set: setCached,
  invalidate: invalidateCache,
  has: hasCached,
  stats: getCacheStats,
  fetch: cachedFetch,
  preload: preloadCache,
};
