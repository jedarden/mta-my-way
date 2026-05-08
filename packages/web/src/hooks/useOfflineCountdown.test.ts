/**
 * Tests for useOfflineCountdown hook
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfflineCountdown } from "./useOfflineCountdown";

// Mock dependencies
vi.mock("../lib/prefetch", () => ({
  getPrefetchedArrivals: vi.fn(),
}));

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(),
}));

// Import after mocking
import { getPrefetchedArrivals } from "../lib/prefetch";
import { useOnlineStatus } from "./useOnlineStatus";

describe("useOfflineCountdown", () => {
  const BASE_TIME = new Date("2024-01-01T12:00:00Z").getTime();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns inactive when online", () => {
    vi.mocked(useOnlineStatus).mockReturnValue(true);

    const { result } = renderHook(() => useOfflineCountdown("123"));

    expect(result.current.isActive).toBe(false);
    expect(result.current.isOffline).toBe(false);
    expect(result.current.arrivals).toBeNull();
  });

  it("returns inactive when stationId is null", () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    const { result } = renderHook(() => useOfflineCountdown(null));

    expect(result.current.isActive).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  it("loads cached data when offline", async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    const mockCachedData = {
      data: {
        stationId: "123",
        stationName: "Times Square",
        updatedAt: BASE_TIME,
        feedAge: 10,
        northbound: [
          {
            line: "1",
            direction: "N" as const,
            arrivalTime: Math.floor(BASE_TIME / 1000) + 300,
            minutesAway: 5,
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            tripId: "trip1",
            destination: "Van Cortlandt Park",
            confidence: "high" as const,
            feedName: "gtfs",
            feedAge: 10,
          },
        ],
        southbound: [],
        alerts: [],
      },
      prefetchedAt: BASE_TIME - 5000,
    };

    vi.mocked(getPrefetchedArrivals).mockResolvedValue(mockCachedData);

    const { result } = renderHook(() => useOfflineCountdown("123"));

    // Advance timers to allow async operations to complete
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(vi.mocked(getPrefetchedArrivals)).toHaveBeenCalledWith("123");
    expect(result.current.isOffline).toBe(true);
    expect(result.current.prefetchedAt).toBe(mockCachedData.prefetchedAt);
  });

  it("clears data when going back online", async () => {
    let onlineStatus = false;
    vi.mocked(useOnlineStatus).mockImplementation(() => onlineStatus);

    const mockCachedData = {
      data: {
        stationId: "123",
        stationName: "Times Square",
        updatedAt: Date.now(),
        feedAge: 10,
        northbound: [],
        southbound: [],
        alerts: [],
      },
      prefetchedAt: Date.now(),
    };

    vi.mocked(getPrefetchedArrivals).mockResolvedValue(mockCachedData);

    const { result, rerender } = renderHook(() => useOfflineCountdown("123"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.arrivals).not.toBeNull();

    onlineStatus = true;
    rerender();

    expect(result.current.isActive).toBe(false);
    expect(result.current.arrivals).toBeNull();
  });

  it("sets isActive to false when no cached data available", async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    vi.mocked(getPrefetchedArrivals).mockResolvedValue(null);

    const { result } = renderHook(() => useOfflineCountdown("123"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isActive).toBe(false);
    expect(result.current.arrivals).toBeNull();
  });

  it("updates countdown every second when active", async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    const now = BASE_TIME;
    const arrivalTimeMs = now + 120_000; // arrivalTime is in milliseconds (like Date.now())

    const mockCachedData = {
      data: {
        stationId: "123",
        stationName: "Times Square",
        updatedAt: now,
        feedAge: 10,
        northbound: [
          {
            line: "1",
            direction: "N" as const,
            arrivalTime: arrivalTimeMs,
            minutesAway: 2,
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            tripId: "trip1",
            destination: "Van Cortlandt Park",
            confidence: "high" as const,
            feedName: "gtfs",
            feedAge: 10,
          },
        ],
        southbound: [],
        alerts: [],
      },
      prefetchedAt: now - 5000,
    };

    vi.mocked(getPrefetchedArrivals).mockResolvedValue(mockCachedData);

    const { result } = renderHook(() => useOfflineCountdown("123"));

    // Wait for initial data load - this sets isActive
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.isActive).toBe(true);

    // Wait for first tick to populate arrivals (the tick runs immediately when isActive becomes true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.arrivals).not.toBeNull();
    expect(result.current.arrivals?.northbound[0].minutesAway).toBeGreaterThan(1.9);
    expect(result.current.arrivals?.northbound[0].minutesAway).toBeLessThan(2.1);

    // Advance by 1 second and check countdown decreased
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.arrivals?.northbound[0].minutesAway).toBeLessThan(2);
  });

  it("filters out arrivals that have passed", async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    const now = BASE_TIME;
    const pastArrivalTimeMs = now - 60_000; // Past arrival (more than 30s ago, so filtered)
    const futureArrivalTimeMs = now + 120_000; // Future arrival (2 minutes away)

    const mockCachedData = {
      data: {
        stationId: "123",
        stationName: "Times Square",
        updatedAt: now,
        feedAge: 10,
        northbound: [
          {
            line: "1",
            direction: "N" as const,
            arrivalTime: pastArrivalTimeMs,
            minutesAway: -1,
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            tripId: "trip1",
            destination: "Van Cortlandt Park",
            confidence: "high" as const,
            feedName: "gtfs",
            feedAge: 10,
          },
          {
            line: "1",
            direction: "N" as const,
            arrivalTime: futureArrivalTimeMs,
            minutesAway: 2,
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            tripId: "trip2",
            destination: "Van Cortlandt Park",
            confidence: "high" as const,
            feedName: "gtfs",
            feedAge: 10,
          },
        ],
        southbound: [],
        alerts: [],
      },
      prefetchedAt: now - 5000,
    };

    vi.mocked(getPrefetchedArrivals).mockResolvedValue(mockCachedData);

    const { result } = renderHook(() => useOfflineCountdown("123"));

    // Wait for initial data load and first tick
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110);
    });

    expect(result.current.arrivals?.northbound).toHaveLength(1);
    expect(result.current.arrivals?.northbound[0].tripId).toBe("trip2");
  });

  it("marks arrivals as estimated", async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    const now = BASE_TIME;
    const arrivalTimeMs = now + 120_000; // arrivalTime is in milliseconds (like Date.now())

    const mockCachedData = {
      data: {
        stationId: "123",
        stationName: "Times Square",
        updatedAt: now,
        feedAge: 10,
        northbound: [
          {
            line: "1",
            direction: "N" as const,
            arrivalTime: arrivalTimeMs,
            minutesAway: 2,
            isAssigned: true,
            isRerouted: false,
            isExpress: false,
            tripId: "trip1",
            destination: "Van Cortlandt Park",
            confidence: "high" as const,
            feedName: "gtfs",
            feedAge: 10,
          },
        ],
        southbound: [],
        alerts: [],
      },
      prefetchedAt: now,
    };

    vi.mocked(getPrefetchedArrivals).mockResolvedValue(mockCachedData);

    const { result } = renderHook(() => useOfflineCountdown("123"));

    // Wait for initial data load and first tick
    await act(async () => {
      await vi.advanceTimersByTimeAsync(110);
    });

    expect(result.current.arrivals?.northbound[0]).toHaveProperty("isEstimated", true);
  });

  it("re-checks cache periodically", async () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);

    vi.mocked(getPrefetchedArrivals).mockResolvedValue({
      data: {
        stationId: "123",
        stationName: "Times Square",
        updatedAt: Date.now(),
        feedAge: 10,
        northbound: [],
        southbound: [],
        alerts: [],
      },
      prefetchedAt: Date.now(),
    });

    const { result } = renderHook(() => useOfflineCountdown("123"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(vi.mocked(getPrefetchedArrivals)).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(vi.mocked(getPrefetchedArrivals)).toHaveBeenCalledTimes(2);
  });
});
