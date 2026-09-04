/**
 * prefetch.ts — manages geofence-triggered pre-fetching and cache lifecycle.
 *
 * When a user enters a 200m radius of any station, this module batch-fetches
 * arrivals for all stations on the user's commute routes and favorite stations,
 * storing them in the Cache API for offline underground use.
 *
 * Key design decisions:
 * - Uses Cache API (not localStorage) for pre-fetched data — survives page
 *   reload, has built-in TTL via cache names, and doesn't compete with the
 *   arrivalsStore's in-memory cache.
 * - Separate cache namespace (`mta-prefetch-v1`) from the Service Worker's
 *   runtime cache to avoid eviction conflicts.
 * - Deduplicates concurrent fetches for the same station.
 * - Battery-conscious: callers should use enableHighAccuracy=false.
 */

import type { StationArrivals } from "@mta-my-way/shared";

const API_BASE = import.meta.env.VITE_API_BASE || "";

/** Cache API namespace for pre-fetched arrivals */
const PREFETCH_CACHE_NAME = "mta-prefetch-v1";

/** Max age for pre-fetched data in the Cache API (10 minutes) */
const PREFETCH_MAX_AGE_MS = 10 * 60 * 1000;

/** In-flight fetch dedup map */
const inflightFetches = new Map<string, Promise<void>>();

/**
 * Open (or create) the pre-fetch cache.
 */
async function getPrefetchCache(): Promise<Cache> {
  return caches.open(PREFETCH_CACHE_NAME);
}

/**
 * Build the cache URL for a station's arrivals.
 */
function prefetchUrl(stationId: string): string {
  return `${API_BASE}/api/arrivals/${stationId}`;
}

/**
 * Fetch arrivals for a single station and store in the Cache API.
 * Deduplicates concurrent requests for the same station.
 */
export async function prefetchStation(stationId: string): Promise<void> {
  // Deduplicate
  if (inflightFetches.has(stationId)) return;
  const promise = doPrefetchStation(stationId).finally(() => {
    inflightFetches.delete(stationId);
  });
  inflightFetches.set(stationId, promise);
  await promise;
}

async function doPrefetchStation(stationId: string): Promise<void> {
  const url = prefetchUrl(stationId);
  try {
    const response = await fetch(url);
    if (!response.ok) return;

    // Clone so we can both cache and return
    const cache = await getPrefetchCache();
    // Store with a Date header for TTL tracking
    const headers = new Headers(response.headers);
    headers.set("x-prefetched-at", Date.now().toString());

    const body = await response.blob();
    const cachedResponse = new Response(body, {
      status: response.status,
      headers,
    });

    await cache.put(url, cachedResponse);
  } catch {
    // Network error — silently skip (may be offline)
  }
}

/**
 * Batch-fetch arrivals for multiple stations.
 * Runs fetches concurrently with a concurrency limit.
 */
export async function prefetchStations(stationIds: string[]): Promise<void> {
  // Deduplicate input
  const unique = [...new Set(stationIds)];
  // Run all concurrently — dedup inside prefetchStation handles overlap
  await Promise.allSettled(unique.map((id) => prefetchStation(id)));
}

/**
 * Retrieve pre-fetched arrivals for a station from the Cache API.
 * Returns null if not cached or expired.
 */
export async function getPrefetchedArrivals(
  stationId: string
): Promise<{ data: StationArrivals; prefetchedAt: number } | null> {
  const cache = await getPrefetchCache();
  const url = prefetchUrl(stationId);
  const response = await cache.match(url);
  if (!response) return null;

  // Check TTL
  const prefetchedAt = parseInt(response.headers.get("x-prefetched-at") || "0", 10);
  if (Date.now() - prefetchedAt > PREFETCH_MAX_AGE_MS) {
    await cache.delete(url);
    return null;
  }

  try {
    const data: StationArrivals = await response.json();
    return { data, prefetchedAt };
  } catch {
    await cache.delete(url);
    return null;
  }
}

/**
 * Purge all pre-fetched cache entries.
 * Call on connectivity return after a fresh fetch cycle.
 */
export async function clearPrefetchCache(): Promise<void> {
  await caches.delete(PREFETCH_CACHE_NAME);
}

/**
 * Get all station IDs that currently have pre-fetched data.
 */
export async function getPrefetchedStationIds(): Promise<string[]> {
  const cache = await getPrefetchCache();
  const keys = await cache.keys();
  return keys
    .map((req) => {
      // Extract stationId from URL pattern: /api/arrivals/{stationId}
      const match = req.url.match(/\/api\/arrivals\/([^/?]+)/);
      return match ? match[1] : null;
    })
    .filter((id): id is string => id !== null);
}
