/**
 * Tests for apiCache module
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedFetch,
  getCacheStats,
  getCacheStrategyForPath,
  getCached,
  hasCached,
  invalidateCache,
  setCached,
} from "./apiCache";

// Mock the Cache API
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  keys: vi.fn(),
};

const mockCaches = {
  open: vi.fn().mockResolvedValue(mockCache),
};

Object.defineProperty(global, "caches", {
  value: mockCaches,
  writable: true,
});

describe("apiCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getCacheStrategyForPath", () => {
    it("returns STATIC for stations endpoint", () => {
      expect(getCacheStrategyForPath("/api/stations")).toBe("STATIC");
      expect(getCacheStrategyForPath("/api/stations/123")).toBe("STATIC");
    });

    it("returns NONE for stations search", () => {
      expect(getCacheStrategyForPath("/api/stations/search?q=penn")).toBe("NONE");
    });

    it("returns STATIC for routes endpoint", () => {
      expect(getCacheStrategyForPath("/api/routes")).toBe("STATIC");
      expect(getCacheStrategyForPath("/api/routes/1")).toBe("STATIC");
    });

    it("returns STATIC for complexes endpoint", () => {
      expect(getCacheStrategyForPath("/api/static/complexes")).toBe("STATIC");
    });

    it("returns SEMI_STATIC for equipment endpoint", () => {
      expect(getCacheStrategyForPath("/api/equipment")).toBe("SEMI_STATIC");
      expect(getCacheStrategyForPath("/api/equipment/123")).toBe("SEMI_STATIC");
    });

    it("returns SEMI_STATIC for alerts endpoint", () => {
      expect(getCacheStrategyForPath("/api/alerts")).toBe("SEMI_STATIC");
      expect(getCacheStrategyForPath("/api/alerts/1")).toBe("SEMI_STATIC");
    });

    it("returns REALTIME for arrivals endpoint", () => {
      expect(getCacheStrategyForPath("/api/arrivals/123")).toBe("REALTIME");
    });

    it("returns REALTIME for positions endpoint", () => {
      expect(getCacheStrategyForPath("/api/positions/1")).toBe("REALTIME");
    });

    it("returns HEALTH for health endpoint", () => {
      expect(getCacheStrategyForPath("/api/health")).toBe("HEALTH");
    });

    it("returns COMMUTE for commute endpoint", () => {
      expect(getCacheStrategyForPath("/api/commute/analyze")).toBe("COMMUTE");
    });

    it("returns TRIP for trip endpoint", () => {
      expect(getCacheStrategyForPath("/api/trip/123")).toBe("TRIP");
    });

    it("returns NONE for push endpoints", () => {
      expect(getCacheStrategyForPath("/api/push/subscribe")).toBe("NONE");
      expect(getCacheStrategyForPath("/api/push/vapid-public-key")).toBe("NONE");
    });

    it("returns NONE for unknown endpoints", () => {
      expect(getCacheStrategyForPath("/api/unknown")).toBe("NONE");
    });
  });

  describe("getCached", () => {
    it("returns null when cache is empty", async () => {
      mockCache.match.mockResolvedValue(undefined);
      const result = await getCached("/api/stations");
      expect(result).toBeNull();
    });

    it("returns cached data when available and valid", async () => {
      const mockData = [{ id: "1", name: "Station 1" }];
      const mockResponse = {
        json: async () => ({
          data: mockData,
          cachedAt: Date.now(),
          ttl: 10000,
        }),
      } as Response;
      mockCache.match.mockResolvedValue(mockResponse);

      const result = await getCached("/api/stations");
      expect(result).toEqual(mockData);
    });

    it("returns null and deletes expired cache entries", async () => {
      const mockData = [{ id: "1", name: "Station 1" }];
      const expiredTime = Date.now() - 20000;
      const mockResponse = {
        json: async () => ({
          data: mockData,
          cachedAt: expiredTime,
          ttl: 10000,
        }),
      } as Response;
      mockCache.match.mockResolvedValue(mockResponse);
      mockCache.delete.mockResolvedValue(true);

      const result = await getCached("/api/stations");
      expect(result).toBeNull();
      expect(mockCache.delete).toHaveBeenCalled();
    });

    it("returns null when cache API fails", async () => {
      mockCache.match.mockRejectedValue(new Error("Cache error"));
      const result = await getCached("/api/stations");
      expect(result).toBeNull();
    });
  });

  describe("setCached", () => {
    it("stores data in cache", async () => {
      const mockData = [{ id: "1", name: "Station 1" }];
      mockCache.put.mockResolvedValue(undefined);

      await setCached("/api/stations", mockData);
      expect(mockCache.put).toHaveBeenCalled();
    });

    it("does not cache when TTL is 0", async () => {
      const mockData = [{ id: "1", name: "Station 1" }];
      await setCached("/api/push/subscribe", mockData, undefined, "NONE");
      expect(mockCache.put).not.toHaveBeenCalled();
    });

    it("handles cache errors gracefully", async () => {
      const mockData = [{ id: "1", name: "Station 1" }];
      mockCache.put.mockRejectedValue(new Error("Cache error"));

      await expect(setCached("/api/stations", mockData)).resolves.toBeUndefined();
    });
  });

  describe("invalidateCache", () => {
    it("clears all cache when no pattern provided", async () => {
      mockCache.keys.mockResolvedValue(["key1", "key2"]);
      mockCache.delete.mockResolvedValue(true);

      await invalidateCache();
      expect(mockCache.delete).toHaveBeenCalledTimes(2);
    });

    it("clears only matching cache entries", async () => {
      const mockKeys = [
        { url: "http://localhost/api/stations" },
        { url: "http://localhost/api/routes" },
      ];
      mockCache.keys.mockResolvedValue(mockKeys);
      mockCache.delete.mockResolvedValue(true);

      await invalidateCache("/api/stations");
      expect(mockCache.delete).toHaveBeenCalledTimes(1);
    });

    it("handles cache errors gracefully", async () => {
      mockCache.keys.mockRejectedValue(new Error("Cache error"));

      await expect(invalidateCache()).resolves.toBeUndefined();
    });
  });

  describe("hasCached", () => {
    it("returns true when cache exists", async () => {
      mockCache.match.mockResolvedValue({} as Response);

      const result = await hasCached("/api/stations");
      expect(result).toBe(true);
    });

    it("returns false when cache does not exist", async () => {
      mockCache.match.mockResolvedValue(undefined);

      const result = await hasCached("/api/stations");
      expect(result).toBe(false);
    });

    it("returns false when cache API fails", async () => {
      mockCache.match.mockRejectedValue(new Error("Cache error"));

      const result = await hasCached("/api/stations");
      expect(result).toBe(false);
    });
  });

  describe("getCacheStats", () => {
    it("returns cache statistics", async () => {
      const mockKeys = [{ url: "http://localhost/api/stations" }];
      const mockResponse = {
        json: async () => ({
          data: [{ id: "1" }],
          cachedAt: Date.now(),
          ttl: 10000,
        }),
      } as Response;

      mockCache.keys.mockResolvedValue(mockKeys);
      mockCache.match.mockResolvedValue(mockResponse);

      const stats = await getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toHaveLength(1);
    });

    it("returns empty stats when cache API fails", async () => {
      mockCache.keys.mockRejectedValue(new Error("Cache error"));

      const stats = await getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.entries).toHaveLength(0);
    });
  });

  describe("cachedFetch", () => {
    it("returns cached data when available", async () => {
      const mockData = [{ id: "1", name: "Station 1" }];
      const mockResponse = {
        json: async () => ({
          data: mockData,
          cachedAt: Date.now(),
          ttl: 10000,
        }),
      } as Response;
      mockCache.match.mockResolvedValue(mockResponse);

      const fetcher = vi.fn().mockResolvedValue(mockData);
      const result = await cachedFetch("/api/stations", fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).not.toHaveBeenCalled();
    });

    it("fetches from network when cache is empty", async () => {
      mockCache.match.mockResolvedValue(undefined);
      const mockData = [{ id: "1", name: "Station 1" }];
      const fetcher = vi.fn().mockResolvedValue(mockData);
      mockCache.put.mockResolvedValue(undefined);

      const result = await cachedFetch("/api/stations", fetcher);

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalled();
      expect(mockCache.put).toHaveBeenCalled();
    });

    it("fetches from network when forceRefresh is true", async () => {
      const mockData = [{ id: "1", name: "Station 1" }];
      const mockResponse = {
        json: async () => ({
          data: mockData,
          cachedAt: Date.now(),
          ttl: 10000,
        }),
      } as Response;
      mockCache.match.mockResolvedValue(mockResponse);
      const fetcher = vi.fn().mockResolvedValue(mockData);
      mockCache.put.mockResolvedValue(undefined);

      const result = await cachedFetch("/api/stations", fetcher, { forceRefresh: true });

      expect(result).toEqual(mockData);
      expect(fetcher).toHaveBeenCalled();
    });
  });
});
