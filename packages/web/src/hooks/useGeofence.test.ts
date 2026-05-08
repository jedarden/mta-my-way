/**
 * Tests for useGeofence hook
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGeofence } from "./useGeofence";

// Mock the dependencies
vi.mock("@mta-my-way/shared", () => ({
  haversineDistance: vi.fn((lat1, lon1, lat2, lon2) => {
    // Simple mock: return distance in km
    const dx = lat1 - lat2;
    const dy = lon1 - lon2;
    return Math.sqrt(dx * dx + dy * dy) * 111; // Rough km conversion
  }),
}));

vi.mock("./useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock("./useStationIndex", () => ({
  useStationIndex: vi.fn(() => ({
    stations: [
      { id: "123", name: "Times Square", lat: 40.758, lon: -73.985 },
      { id: "456", name: "Penn Station", lat: 40.75, lon: -73.99 },
    ],
  })),
}));

describe("useGeofence", () => {
  let mockGeolocation: {
    watchPosition: ReturnType<typeof vi.fn>;
    clearWatch: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockGeolocation = {
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    Object.defineProperty(global.navigator, "geolocation", {
      value: mockGeolocation,
      writable: true,
    });
  });

  it("returns not watching when permission not granted", () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() => Promise.resolve({ state: "prompt" })),
    };

    const { result } = renderHook(() => useGeofence());

    expect(result.current.isWatching).toBe(false);
    expect(result.current.lastEvent).toBeNull();
    expect(result.current.gpsFailureCount).toBe(0);
  });

  it("starts watching when permission granted and online", async () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() =>
        Promise.resolve({
          state: "granted",
          addEventListener: vi.fn(),
        })
      ),
    };

    mockGeolocation.watchPosition.mockImplementation((success) => {
      success({
        coords: { latitude: 40.758, longitude: -73.985 },
        timestamp: Date.now(),
      });
      return 1;
    });

    const onEnter = vi.fn();
    const { result } = renderHook(() => useGeofence({ onEnter }));

    await waitFor(() => {
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });

    expect(result.current.isWatching).toBe(true);
  });

  it("fires onEnter when entering station radius", async () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() =>
        Promise.resolve({
          state: "granted",
          addEventListener: vi.fn(),
        })
      ),
    };

    let successCallback: any;
    mockGeolocation.watchPosition.mockImplementation((success) => {
      successCallback = success;
      return 1;
    });

    const onEnter = vi.fn();
    renderHook(() => useGeofence({ radius: 200, onEnter }));

    await waitFor(() => {
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });

    // Simulate position update at Times Square
    act(() => {
      successCallback({
        coords: { latitude: 40.758, longitude: -73.985 },
        timestamp: Date.now(),
      });
    });

    expect(onEnter).toHaveBeenCalledWith(
      expect.objectContaining({
        stationId: "123",
        stationName: "Times Square",
      })
    );
  });

  it("does not fire onEnter twice for same station", async () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() =>
        Promise.resolve({
          state: "granted",
          addEventListener: vi.fn(),
        })
      ),
    };

    let successCallback: any;
    mockGeolocation.watchPosition.mockImplementation((success) => {
      successCallback = success;
      return 1;
    });

    const onEnter = vi.fn();
    renderHook(() => useGeofence({ radius: 200, onEnter }));

    await waitFor(() => {
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });

    // Same position twice
    act(() => {
      successCallback({
        coords: { latitude: 40.758, longitude: -73.985 },
        timestamp: Date.now(),
      });
    });

    act(() => {
      successCallback({
        coords: { latitude: 40.758, longitude: -73.985 },
        timestamp: Date.now(),
      });
    });

    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("tracks GPS failures and stops watching after threshold", async () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() =>
        Promise.resolve({
          state: "granted",
          addEventListener: vi.fn(),
        })
      ),
    };

    let errorCallback: any;
    mockGeolocation.watchPosition.mockImplementation((_success, error) => {
      errorCallback = error;
      return 1;
    });

    const { result } = renderHook(() => useGeofence());

    await waitFor(() => {
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });

    // Trigger GPS errors 3 times (threshold)
    for (let i = 0; i < 3; i++) {
      act(() => {
        errorCallback({ code: 2, message: "Position unavailable" });
      });
    }

    expect(result.current.gpsFailureCount).toBe(3);
    expect(mockGeolocation.clearWatch).toHaveBeenCalled();
  });

  it("uses custom radius when provided", async () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() =>
        Promise.resolve({
          state: "granted",
          addEventListener: vi.fn(),
        })
      ),
    };

    let successCallback: any;
    mockGeolocation.watchPosition.mockImplementation((success) => {
      successCallback = success;
      return 1;
    });

    const onEnter = vi.fn();
    renderHook(() => useGeofence({ radius: 500, onEnter }));

    await waitFor(() => {
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });

    act(() => {
      successCallback({
        coords: { latitude: 40.758, longitude: -73.985 },
        timestamp: Date.now(),
      });
    });

    expect(onEnter).toHaveBeenCalled();
  });

  it("does not watch when disabled", async () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() =>
        Promise.resolve({
          state: "granted",
          addEventListener: vi.fn(),
        })
      ),
    };

    const { result } = renderHook(() => useGeofence({ enabled: false }));

    await waitFor(() => {
      expect(result.current.isWatching).toBe(false);
    });

    expect(mockGeolocation.watchPosition).not.toHaveBeenCalled();
  });

  it("respects geolocation options", async () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() =>
        Promise.resolve({
          state: "granted",
          addEventListener: vi.fn(),
        })
      ),
    };

    mockGeolocation.watchPosition.mockReturnValue(1);

    renderHook(() => useGeofence());

    await waitFor(() => {
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });

    const options = mockGeolocation.watchPosition.mock.calls[0][2];
    expect(options.enableHighAccuracy).toBe(false);
    expect(options.timeout).toBe(15000);
    expect(options.maximumAge).toBe(30000);
  });

  it("cleans up watch on unmount", async () => {
    (global.navigator as any).permissions = {
      query: vi.fn(() =>
        Promise.resolve({
          state: "granted",
          addEventListener: vi.fn(),
        })
      ),
    };

    mockGeolocation.watchPosition.mockReturnValue(1);

    const { unmount } = renderHook(() => useGeofence());

    await waitFor(() => {
      expect(mockGeolocation.watchPosition).toHaveBeenCalled();
    });

    unmount();

    expect(mockGeolocation.clearWatch).toHaveBeenCalledWith(1);
  });
});
