/**
 * Tests for arrivals store.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArrivalsStore } from "./arrivalsStore";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

vi.stubGlobal("localStorage", localStorageMock);

describe("arrivalsStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useArrivalsStore.setState({
      cache: {},
      lastFetch: null,
    });
    vi.clearAllMocks();
  });

  describe("setCachedArrivals", () => {
    it("stores arrival data with timestamp", () => {
      const mockData = {
        stationId: "123",
        stationName: "Test Station",
        updatedAt: Date.now(),
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      useArrivalsStore.getState().setCachedArrivals("123", mockData);

      const state = useArrivalsStore.getState();
      expect(state.cache["123"]).toBeDefined();
      expect(state.cache["123"]?.data).toEqual(mockData);
      expect(state.cache["123"]?.cachedAt).toBeLessThanOrEqual(Date.now());
    });

    it("overwrites existing cached data", () => {
      const mockData1 = {
        stationId: "123",
        stationName: "Test Station",
        updatedAt: 1000,
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      const mockData2 = {
        stationId: "123",
        stationName: "Updated Station",
        updatedAt: 2000,
        feedAge: 3,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      useArrivalsStore.getState().setCachedArrivals("123", mockData1);
      useArrivalsStore.getState().setCachedArrivals("123", mockData2);

      const state = useArrivalsStore.getState();
      expect(state.cache["123"]?.data.stationName).toBe("Updated Station");
    });
  });

  describe("getCachedArrivals", () => {
    it("returns null for non-existent station", () => {
      const result = useArrivalsStore.getState().getCachedArrivals("999");
      expect(result).toBeNull();
    });

    it("returns cached data if fresh", () => {
      const mockData = {
        stationId: "123",
        stationName: "Test Station",
        updatedAt: Date.now(),
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      useArrivalsStore.getState().setCachedArrivals("123", mockData);

      const result = useArrivalsStore.getState().getCachedArrivals("123");
      expect(result).toBeDefined();
      expect(result?.data.stationName).toBe("Test Station");
    });

    it("returns null for stale data", () => {
      const oldData = {
        stationId: "123",
        stationName: "Old Station",
        updatedAt: 1000,
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      // Manually set old cached data
      useArrivalsStore.setState({
        cache: {
          "123": {
            stationId: "123",
            data: oldData,
            cachedAt: Date.now() - 6 * 60 * 1000, // 6 minutes ago
          },
        },
      });

      const result = useArrivalsStore.getState().getCachedArrivals("123");
      expect(result).toBeNull();
    });

    it("uses 5 minute max cache age", () => {
      const mockData = {
        stationId: "123",
        stationName: "Test Station",
        updatedAt: Date.now(),
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      useArrivalsStore.getState().setCachedArrivals("123", mockData);

      // Data should still be fresh after 4 minutes
      useArrivalsStore.setState({
        cache: {
          "123": {
            stationId: "123",
            data: mockData,
            cachedAt: Date.now() - 4 * 60 * 1000,
          },
        },
      });

      const result = useArrivalsStore.getState().getCachedArrivals("123");
      expect(result).not.toBeNull();
    });
  });

  describe("getStaleArrivals", () => {
    it("returns cached data even if stale", () => {
      const oldData = {
        stationId: "123",
        stationName: "Old Station",
        updatedAt: 1000,
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      useArrivalsStore.setState({
        cache: {
          "123": {
            stationId: "123",
            data: oldData,
            cachedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
          },
        },
      });

      const result = useArrivalsStore.getState().getStaleArrivals("123");
      expect(result).toBeDefined();
      expect(result?.data.stationName).toBe("Old Station");
    });

    it("returns null for non-existent station", () => {
      const result = useArrivalsStore.getState().getStaleArrivals("999");
      expect(result).toBeNull();
    });
  });

  describe("clearCache", () => {
    it("clears all cached data", () => {
      const mockData = {
        stationId: "123",
        stationName: "Test Station",
        updatedAt: Date.now(),
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      useArrivalsStore.getState().setCachedArrivals("123", mockData);
      useArrivalsStore.getState().setCachedArrivals("456", mockData);
      useArrivalsStore.getState().setLastFetch(Date.now());

      expect(Object.keys(useArrivalsStore.getState().cache).length).toBe(2);

      useArrivalsStore.getState().clearCache();

      const state = useArrivalsStore.getState();
      expect(Object.keys(state.cache).length).toBe(0);
      expect(state.lastFetch).toBeNull();
    });
  });

  describe("setLastFetch", () => {
    it("sets the last fetch timestamp", () => {
      const timestamp = Date.now();
      useArrivalsStore.getState().setLastFetch(timestamp);

      expect(useArrivalsStore.getState().lastFetch).toBe(timestamp);
    });
  });

  describe("cache behavior", () => {
    it("stores multiple stations independently", () => {
      const station1Data = {
        stationId: "123",
        stationName: "Station 1",
        updatedAt: Date.now(),
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      const station2Data = {
        stationId: "456",
        stationName: "Station 2",
        updatedAt: Date.now(),
        feedAge: 5,
        northbound: [],
        southbound: [],
        alerts: [],
      };

      useArrivalsStore.getState().setCachedArrivals("123", station1Data);
      useArrivalsStore.getState().setCachedArrivals("456", station2Data);

      const result1 = useArrivalsStore.getState().getCachedArrivals("123");
      const result2 = useArrivalsStore.getState().getCachedArrivals("456");

      expect(result1?.data.stationName).toBe("Station 1");
      expect(result2?.data.stationName).toBe("Station 2");
    });
  });
});
