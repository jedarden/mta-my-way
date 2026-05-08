/**
 * Tests for useArrivals hook
 *
 * Tests the arrivals data fetching hook including:
 * - Data fetching and caching
 * - Auto-refresh behavior
 * - Error handling
 * - Status transitions
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArrivals } from "./useArrivals";

// Mock apiEnhanced
const mockGetArrivals = vi.fn();
vi.mock("../lib/apiEnhanced", () => ({
  EnhancedApiError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "EnhancedApiError";
    }
  },
  apiEnhanced: {
    getArrivals: (...args: unknown[]) => mockGetArrivals(...args),
  },
}));

// Mock arrivalsStore with Zustand selector pattern
let mockCachedArrivals: unknown = null;
let mockStaleArrivals: unknown = null;
const mockSetCachedArrivals = vi.fn();
const mockSetLastFetch = vi.fn();

vi.mock("../stores/arrivalsStore", () => ({
  useArrivalsStore: vi.fn((selector) => {
    const state = {
      arrivals: {},
      lastFetch: null,
      getCachedArrivals: () => mockCachedArrivals,
      getStaleArrivals: () => mockStaleArrivals,
      setCachedArrivals: mockSetCachedArrivals,
      setLastFetch: mockSetLastFetch,
    };
    return selector ? selector(state) : state;
  }),
}));

// Mock settingsStore with Zustand selector pattern
let mockRefreshInterval = 30;
let mockHapticFeedback = false;

vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = {
      theme: "system" as const,
      showUnassignedTrips: false,
      refreshInterval: mockRefreshInterval,
      alertSeverityFilter: "all" as const,
      hapticFeedback: mockHapticFeedback,
      accessibleMode: false,
      quietHours: { enabled: false, startHour: 22, endHour: 7 },
      setTheme: vi.fn(),
      setShowUnassignedTrips: vi.fn(),
      setRefreshInterval: vi.fn(),
      setAlertSeverityFilter: vi.fn(),
      setHapticFeedback: vi.fn(),
      setAccessibleMode: vi.fn(),
      setQuietHours: vi.fn(),
    };
    return selector ? selector(state) : state;
  }),
}));

describe("useArrivals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockRefreshInterval = 30;
    mockHapticFeedback = false;
    mockCachedArrivals = null;
    mockStaleArrivals = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns idle status when no stationId provided", () => {
    const { result } = renderHook(() => useArrivals(null));

    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBe(null);
  });

  it("fetches arrivals for a station", async () => {
    const mockArrivals = {
      stationId: "101",
      stationName: "Test Station",
      northbound: [{ tripId: "trip1", minutesAway: 2 }],
      southbound: [],
    };

    mockGetArrivals.mockResolvedValueOnce(mockArrivals);

    const { result } = renderHook(() => useArrivals("101"));

    expect(result.current.status).toBe("loading");

    // Run pending timers to trigger the effect
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("success");
    expect(result.current.data).toEqual(mockArrivals);
    expect(mockGetArrivals).toHaveBeenCalledWith("101");
  });

  it("uses cached arrivals if available", async () => {
    const cachedData = {
      data: {
        stationId: "101",
        stationName: "Test Station",
        northbound: [{ tripId: "cached", minutesAway: 5 }],
        southbound: [],
      },
      cachedAt: Date.now() - 10000,
    };

    mockCachedArrivals = cachedData;

    const { result } = renderHook(() => useArrivals("101"));

    // Should show cached data immediately
    expect(result.current.status).toBe("success");
    expect(result.current.data).toEqual(cachedData.data);
  });

  it("transitions to stale status during refresh", async () => {
    const mockArrivals = {
      stationId: "101",
      stationName: "Test Station",
      northbound: [],
      southbound: [],
    };

    mockGetArrivals.mockResolvedValue(mockArrivals);

    const { result } = renderHook(() => useArrivals("101"));

    // Wait for initial success
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("success");

    // Trigger a refresh
    act(() => {
      result.current.refresh();
    });

    // Should go to stale since we have data
    expect(result.current.status).toBe("stale");

    // Run timers and wait for success again
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("success");
  });

  it("handles fetch errors", async () => {
    mockGetArrivals.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useArrivals("101"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Network error");
  });

  it("sets offline status when offline", async () => {
    mockGetArrivals.mockRejectedValueOnce(new Error("Offline"));

    // Mock navigator.onLine
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });

    const { result } = renderHook(() => useArrivals("101"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("offline");

    // Restore
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: originalOnLine,
    });
  });

  it("auto-refreshes on interval", async () => {
    const mockArrivals = {
      stationId: "101",
      stationName: "Test Station",
      northbound: [],
      southbound: [],
    };

    mockGetArrivals.mockResolvedValue(mockArrivals);

    const { result } = renderHook(() => useArrivals("101"));

    // Wait for initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("success");

    expect(mockGetArrivals).toHaveBeenCalledTimes(1);

    // Fast-forward past the refresh interval (30s)
    await act(async () => {
      vi.advanceTimersByTime(30000);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetArrivals).toHaveBeenCalledTimes(2);
  });

  it("uses stale data on error if available", async () => {
    const staleData = {
      stationId: "101",
      stationName: "Test Station",
      northbound: [{ tripId: "stale", minutesAway: 10 }],
      southbound: [],
    };

    mockStaleArrivals = {
      data: staleData,
      cachedAt: Date.now() - 60000,
    };

    mockGetArrivals.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useArrivals("101"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    // Should have stale data
    expect(result.current.data).toEqual(staleData);
  });

  it("triggers haptic feedback when enabled", async () => {
    const mockVibrate = vi.fn();
    (navigator as any).vibrate = mockVibrate;
    mockHapticFeedback = true;

    const mockArrivals = {
      stationId: "101",
      stationName: "Test Station",
      northbound: [],
      southbound: [],
    };

    mockGetArrivals.mockResolvedValue(mockArrivals);

    const { result } = renderHook(() => useArrivals("101"));

    // Wait for initial load
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("success");

    // Trigger manual refresh
    act(() => {
      result.current.refresh();
    });

    expect(mockVibrate).toHaveBeenCalledWith(10);

    delete (navigator as any).vibrate;
  });

  it("cleans up interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    mockGetArrivals.mockResolvedValue({
      stationId: "101",
      stationName: "Test Station",
      northbound: [],
      southbound: [],
    });

    const { unmount } = renderHook(() => useArrivals("101"));

    unmount();

    // Interval should be cleared
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("handles stationId changes", async () => {
    mockGetArrivals
      .mockResolvedValueOnce({
        stationId: "101",
        stationName: "Station 101",
        northbound: [],
        southbound: [],
      })
      .mockResolvedValueOnce({
        stationId: "102",
        stationName: "Station 102",
        northbound: [],
        southbound: [],
      });

    const { result, rerender } = renderHook(({ stationId }) => useArrivals(stationId), {
      initialProps: { stationId: "101" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data?.stationId).toBe("101");

    // Change station
    rerender({ stationId: "102" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.data?.stationId).toBe("102");
  });
});
