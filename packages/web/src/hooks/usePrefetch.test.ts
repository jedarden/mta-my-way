/**
 * Tests for usePrefetch hook
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePrefetch } from "./usePrefetch";

// Mock dependencies first
vi.mock("../lib/prefetch", () => ({
  prefetchStations: vi.fn(),
}));

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock("./useGeofence", () => ({
  useGeofence: vi.fn(),
}));

// Create a shared state container that the mock can access
const sharedMockState = {
  current: {
    favorites: [
      { id: "fav1", stationId: "101", stationName: "South Ferry", lines: ["1"] },
      { id: "fav2", stationId: "725", stationName: "Times Square", lines: ["1", "2", "3"] },
    ],
    commutes: [
      {
        id: "commute1",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Square" },
        preferredLines: ["1"],
      },
    ],
  },
};

// Mock the favoritesStore module with a zustand-like store
vi.mock("../stores/favoritesStore", () => ({
  useFavoritesStore: Object.assign(
    (selector?: (s: unknown) => unknown) => {
      const state = sharedMockState.current;
      return selector ? selector(state) : state;
    },
    {
      getState: () => sharedMockState.current,
      setState: vi.fn(),
      subscribe: vi.fn(),
    }
  ),
}));

// Import after mocking
import { prefetchStations } from "../lib/prefetch";
import { useGeofence } from "./useGeofence";
import { useOnlineStatus } from "./useOnlineStatus";

describe("usePrefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());

    // Reset to default state
    sharedMockState.current = {
      favorites: [
        { id: "fav1", stationId: "101", stationName: "South Ferry", lines: ["1"] },
        { id: "fav2", stationId: "725", stationName: "Times Square", lines: ["1", "2", "3"] },
      ],
      commutes: [
        {
          id: "commute1",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Square" },
          preferredLines: ["1"],
        },
      ],
    };

    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useGeofence).mockReturnValue({
      isWatching: false,
      lastEvent: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns initial state", () => {
    const { result } = renderHook(() => usePrefetch());

    expect(result.current.isWatching).toBe(false);
    expect(result.current.lastGeofenceEvent).toBeNull();
    expect(typeof result.current.prefetchAll).toBe("function");
  });

  it("collects station IDs from favorites and commutes", async () => {
    vi.mocked(prefetchStations).mockResolvedValue(undefined);

    const { result } = renderHook(() => usePrefetch());

    await act(async () => {
      result.current.prefetchAll();
      // Flush pending promises
      await Promise.resolve();
    });

    expect(vi.mocked(prefetchStations)).toHaveBeenCalledWith(
      expect.arrayContaining(["101", "725"])
    );
  });

  it("deduplicates station IDs", async () => {
    // Override with duplicate station IDs
    sharedMockState.current = {
      favorites: [
        { id: "fav1", stationId: "101", stationName: "South Ferry", lines: ["1"] },
        { id: "fav2", stationId: "101", stationName: "South Ferry", lines: ["1"] },
      ],
      commutes: [
        {
          id: "commute1",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Square" },
          preferredLines: ["1"],
        },
      ],
    };

    vi.mocked(prefetchStations).mockResolvedValue(undefined);

    const { result } = renderHook(() => usePrefetch());

    await act(async () => {
      result.current.prefetchAll();
      await Promise.resolve();
    });

    const stations = vi.mocked(prefetchStations).mock.calls[0]?.[0];
    const uniqueStations = [...new Set(stations)];
    expect(stations).toHaveLength(uniqueStations.length);
  });

  it("throttles prefetch to once per 60 seconds", async () => {
    vi.mocked(prefetchStations).mockResolvedValue(undefined);

    const { result } = renderHook(() => usePrefetch());

    await act(async () => {
      result.current.prefetchAll();
      await Promise.resolve();
    });

    expect(vi.mocked(prefetchStations)).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.prefetchAll();
      await Promise.resolve();
    });

    // Still only called once due to throttling
    expect(vi.mocked(prefetchStations)).toHaveBeenCalledTimes(1);

    // Advance time past throttle threshold
    await act(async () => {
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
    });

    await act(async () => {
      result.current.prefetchAll();
      await Promise.resolve();
    });

    // Now called twice
    expect(vi.mocked(prefetchStations)).toHaveBeenCalledTimes(2);
  });

  it("triggers prefetch on geofence entry", async () => {
    const handleGeofenceEnter = vi.fn();
    vi.mocked(useGeofence).mockImplementation((options) => {
      if (options?.onEnter) {
        handleGeofenceEnter.mockImplementation(options.onEnter);
      }
      return {
        isWatching: true,
        lastEvent: null,
      };
    });

    vi.mocked(prefetchStations).mockResolvedValue(undefined);

    renderHook(() => usePrefetch());

    const mockEvent = {
      stationId: "101",
      stationName: "South Ferry",
      distanceM: 50,
    };

    await act(async () => {
      handleGeofenceEnter(mockEvent);
      await Promise.resolve();
    });

    expect(vi.mocked(prefetchStations)).toHaveBeenCalled();
  });

  it("does not auto-prefetch when initially offline", () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    vi.mocked(prefetchStations).mockResolvedValue(undefined);

    renderHook(() => usePrefetch());

    // When offline, the useEffect should not trigger prefetch on mount
    expect(vi.mocked(prefetchStations)).not.toHaveBeenCalled();
  });

  it("prefetches when coming back online with last geofence event", async () => {
    let isOnline = false;
    vi.mocked(useOnlineStatus).mockImplementation(() => isOnline);

    // Track geofence entries separately - don't auto-call onEnter when hook is called
    const capturedHandlers: Array<(event: unknown) => void> = [];
    vi.mocked(useGeofence).mockImplementation((options) => {
      if (options?.onEnter) {
        capturedHandlers.push(options.onEnter);
      }
      return {
        isWatching: true,
        lastEvent: null,
      };
    });

    vi.mocked(prefetchStations).mockResolvedValue(undefined);

    const { rerender } = renderHook(() => usePrefetch());

    // Start offline - no prefetch
    expect(vi.mocked(prefetchStations)).not.toHaveBeenCalled();

    const mockEvent = {
      stationId: "101",
      stationName: "South Ferry",
      distanceM: 50,
    };

    // Simulate geofence entry while offline
    await act(async () => {
      capturedHandlers[0]?.(mockEvent);
      await Promise.resolve();
    });

    // Still no prefetch because we're offline
    expect(vi.mocked(prefetchStations)).not.toHaveBeenCalled();

    // Come back online - should prefetch now due to last geofence event
    isOnline = true;
    rerender();

    await act(async () => {
      await Promise.resolve();
    });

    expect(vi.mocked(prefetchStations)).toHaveBeenCalled();
  });

  it("does not prefetch when no stations available", async () => {
    sharedMockState.current = {
      favorites: [],
      commutes: [],
    };

    vi.mocked(prefetchStations).mockResolvedValue(undefined);

    const { result } = renderHook(() => usePrefetch());

    await act(async () => {
      result.current.prefetchAll();
      await Promise.resolve();
    });

    expect(vi.mocked(prefetchStations)).not.toHaveBeenCalled();
  });

  it("passes isOnline to geofence enabled option", () => {
    const isOnline = true;
    vi.mocked(useOnlineStatus).mockReturnValue(isOnline);

    renderHook(() => usePrefetch());

    expect(vi.mocked(useGeofence)).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: isOnline,
      })
    );
  });
});
