/**
 * Unit tests for prefetch utilities
 *
 * Per plan.md Phase 4: Performance optimization with geofence-triggered pre-fetching.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPrefetchCache,
  getPrefetchedArrivals,
  getPrefetchedStationIds,
  prefetchStation,
  prefetchStations,
} from "./prefetch";

// Mock Cache API
const mockCache = new Map<string, { response: Response; prefetchedAt: number }>();

const mockCacheInstance = {
  put: vi.fn(),
  match: vi.fn(),
  delete: vi.fn(),
  keys: vi.fn(),
};

const mockCaches = {
  open: vi.fn(),
  delete: vi.fn(),
  has: vi.fn(),
};

vi.stubGlobal("caches", mockCaches);

// Mock fetch
global.fetch = vi.fn();

describe("prefetch utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCache.clear();

    // Setup default cache behavior
    mockCaches.open.mockResolvedValue(mockCacheInstance);
    mockCaches.delete.mockResolvedValue(true);

    mockCacheInstance.match.mockImplementation((url) => {
      const cached = mockCache.get(url.toString());
      if (cached) {
        return Promise.resolve(cached.response);
      }
      return Promise.resolve(undefined);
    });

    mockCacheInstance.put.mockImplementation((url, response) => {
      mockCache.set(url.toString(), { response, prefetchedAt: Date.now() });
      return Promise.resolve();
    });

    mockCacheInstance.delete.mockImplementation((url) => {
      mockCache.delete(url.toString());
      return Promise.resolve(true);
    });

    mockCacheInstance.keys.mockImplementation(() => {
      return Promise.resolve(
        Array.from(mockCache.keys()).map((url) => ({ url: new URL(url, "http://example.com") }))
      );
    });
  });

  describe("prefetchStation", () => {
    it("fetches and caches station arrivals", async () => {
      const mockResponse = {
        northbound: [],
        southbound: [],
        stationId: "123",
        stationName: "Test Station",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        blob: vi
          .fn()
          .mockResolvedValue(
            new Blob([JSON.stringify(mockResponse)], { type: "application/json" })
          ),
      } as unknown as Response);

      await prefetchStation("123");

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/arrivals/123"));
      expect(mockCacheInstance.put).toHaveBeenCalled();
    });

    it("handles failed fetches gracefully", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      // Should not throw
      await expect(prefetchStation("123")).resolves.toBeUndefined();
    });

    it("handles non-ok responses", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      await prefetchStation("123");

      // Should not cache failed responses
      expect(mockCacheInstance.put).not.toHaveBeenCalled();
    });

    it("deduplicates concurrent requests for same station", async () => {
      let resolveFetch: ((value: unknown) => void) | undefined;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      global.fetch = vi.fn().mockReturnValue(fetchPromise);

      // Launch concurrent requests
      const p1 = prefetchStation("123");
      const p2 = prefetchStation("123");
      const p3 = prefetchStation("123");

      // Should only call fetch once
      expect(fetch).toHaveBeenCalledTimes(1);

      // Resolve the fetch
      resolveFetch?.({
        ok: true,
        headers: new Headers(),
        blob: vi.fn().mockResolvedValue(new Blob()),
      });

      await Promise.all([p1, p2, p3]);

      // Still only called once
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("prefetchStations", () => {
    it("fetches multiple stations concurrently", async () => {
      const mockResponse = {
        northbound: [],
        southbound: [],
        stationId: "123",
        stationName: "Test Station",
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        blob: vi
          .fn()
          .mockResolvedValue(
            new Blob([JSON.stringify(mockResponse)], { type: "application/json" })
          ),
      } as unknown as Response);

      await prefetchStations(["123", "456", "789"]);

      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("deduplicates station IDs", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        blob: vi.fn().mockResolvedValue(new Blob()),
      } as unknown as Response);

      await prefetchStations(["123", "456", "123", "456", "789"]);

      // Should only fetch unique stations
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("continues on individual failures", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({
          ok: true,
          headers: new Headers(),
          blob: vi.fn().mockResolvedValue(new Blob()),
        });
      });

      // Should not throw despite one failure
      await expect(prefetchStations(["123", "456", "789"])).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("getPrefetchedArrivals", () => {
    it("returns cached arrivals if not expired", async () => {
      const mockData = {
        northbound: [],
        southbound: [],
        stationId: "123",
        stationName: "Test Station",
      };

      const cachedResponse = new Response(JSON.stringify(mockData), {
        headers: new Headers({ "x-prefetched-at": Date.now().toString() }),
      });

      mockCacheInstance.match.mockResolvedValue(cachedResponse);

      const result = await getPrefetchedArrivals("123");

      expect(result).not.toBeNull();
      expect(result?.data).toEqual(mockData);
    });

    it("returns null if not cached", async () => {
      mockCacheInstance.match.mockResolvedValue(undefined);

      const result = await getPrefetchedArrivals("123");

      expect(result).toBeNull();
    });

    it("returns null if expired (TTL exceeded)", async () => {
      const mockData = {
        northbound: [],
        southbound: [],
        stationId: "123",
        stationName: "Test Station",
      };

      // Cached 15 minutes ago (exceeds 10 minute TTL)
      const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
      const cachedResponse = new Response(JSON.stringify(mockData), {
        headers: new Headers({ "x-prefetched-at": fifteenMinutesAgo.toString() }),
      });

      mockCacheInstance.match.mockResolvedValue(cachedResponse);

      const result = await getPrefetchedArrivals("123");

      expect(result).toBeNull();
      expect(mockCacheInstance.delete).toHaveBeenCalled();
    });

    it("deletes invalid JSON from cache", async () => {
      const cachedResponse = new Response("invalid json", {
        headers: new Headers({ "x-prefetched-at": Date.now().toString() }),
      });

      mockCacheInstance.match.mockResolvedValue(cachedResponse);

      const result = await getPrefetchedArrivals("123");

      expect(result).toBeNull();
      expect(mockCacheInstance.delete).toHaveBeenCalled();
    });
  });

  describe("getPrefetchedStationIds", () => {
    it("returns list of cached station IDs", async () => {
      // Mock cache keys with URL objects that have href properties
      const mockKeys = [
        { url: { href: "http://example.com/api/arrivals/123", pathname: "/api/arrivals/123" } },
        { url: { href: "http://example.com/api/arrivals/456", pathname: "/api/arrivals/456" } },
        { url: { href: "http://example.com/api/arrivals/789", pathname: "/api/arrivals/789" } },
      ];

      mockCacheInstance.keys.mockResolvedValue(mockKeys);

      const ids = await getPrefetchedStationIds();

      expect(ids).toEqual(["123", "456", "789"]);
    });

    it("returns empty array when cache is empty", async () => {
      mockCacheInstance.keys.mockResolvedValue([]);

      const ids = await getPrefetchedStationIds();

      expect(ids).toEqual([]);
    });

    it("handles malformed URLs gracefully", async () => {
      const mockKeys = [
        { url: { href: "http://example.com/api/arrivals/123", pathname: "/api/arrivals/123" } },
        { url: { href: "http://example.com/invalid-url", pathname: "/invalid-url" } },
        { url: { href: "http://example.com/api/arrivals/456", pathname: "/api/arrivals/456" } },
      ];

      mockCacheInstance.keys.mockResolvedValue(mockKeys);

      const ids = await getPrefetchedStationIds();

      // Should include valid station IDs and skip invalid ones
      expect(ids).toContain("123");
      expect(ids).toContain("456");
    });
  });

  describe("clearPrefetchCache", () => {
    it("deletes the prefetch cache", async () => {
      await clearPrefetchCache();

      expect(mockCaches.delete).toHaveBeenCalledWith("mta-prefetch-v1");
    });
  });

  describe("TTL behavior", () => {
    it("calculates TTL correctly", async () => {
      const mockData = {
        northbound: [],
        southbound: [],
        stationId: "123",
        stationName: "Test Station",
      };

      // Cached 9 minutes ago - should be valid
      const nineMinutesAgo = Date.now() - 9 * 60 * 1000;
      const cachedResponse = new Response(JSON.stringify(mockData), {
        headers: new Headers({ "x-prefetched-at": nineMinutesAgo.toString() }),
      });

      mockCacheInstance.match.mockResolvedValue(cachedResponse);

      const result = await getPrefetchedArrivals("123");

      expect(result).not.toBeNull();
      expect(mockCacheInstance.delete).not.toHaveBeenCalled();
    });

    it("expires data after TTL", async () => {
      const mockData = {
        northbound: [],
        southbound: [],
        stationId: "123",
        stationName: "Test Station",
      };

      // Cached 11 minutes ago - should be expired
      const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
      const cachedResponse = new Response(JSON.stringify(mockData), {
        headers: new Headers({ "x-prefetched-at": elevenMinutesAgo.toString() }),
      });

      mockCacheInstance.match.mockResolvedValue(cachedResponse);

      const result = await getPrefetchedArrivals("123");

      expect(result).toBeNull();
      expect(mockCacheInstance.delete).toHaveBeenCalled();
    });
  });
});
