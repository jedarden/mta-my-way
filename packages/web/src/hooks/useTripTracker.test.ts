/**
 * Tests for useTripTracker hook.
 *
 * Tests the trip tracking functionality:
 * - Trip fetching and state management
 * - Stop progress derivation
 * - ETA calculation
 * - Polling behavior
 * - Trip expiration handling
 * - Error handling and user-friendly messages
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { EnhancedApiError } from "../lib/apiEnhanced";
import { useTripTracker } from "./useTripTracker";

// Mock the API module
vi.mock("../lib/api", () => ({
  api: {
    getTrip: vi.fn(),
  },
}));

// Mock the error messages module
vi.mock("../lib/errorMessages", () => ({
  ErrorCategory: {
    UNKNOWN: "unknown",
    NETWORK: "network",
    TIMEOUT: "timeout",
    NOT_FOUND: "not_found",
    SERVER: "server",
  },
  getUserErrorMessage: vi.fn((type, resource) => ({
    message: `Error for ${resource}: ${type}`,
  })),
}));

describe("useTripTracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockTripData = {
    tripId: "test-trip-123",
    routeId: "1",
    direction: "N",
    destination: "Van Cortlandt Park",
    progressPercent: 45,
    currentStopIndex: 3,
    stops: [
      {
        stopId: "101",
        stationId: "101",
        stationName: "South Ferry",
        arrivalTime: Math.floor(Date.now() / 1000) - 600,
        departureTime: Math.floor(Date.now() / 1000) - 540,
      },
      {
        stopId: "102",
        stationId: "102",
        stationName: "Rector St",
        arrivalTime: Math.floor(Date.now() / 1000) - 480,
        departureTime: Math.floor(Date.now() / 1000) - 420,
      },
      {
        stopId: "103",
        stationId: "103",
        stationName: "WTC Cortlandt",
        arrivalTime: Math.floor(Date.now() / 1000) - 360,
        departureTime: Math.floor(Date.now() / 1000) - 300,
      },
      {
        stopId: "104",
        stationId: "104",
        stationName: "Franklin St",
        arrivalTime: Math.floor(Date.now() / 1000) + 60,
        departureTime: Math.floor(Date.now() / 1000) + 120,
      },
      {
        stopId: "105",
        stationId: "105",
        stationName: "Canal St",
        arrivalTime: Math.floor(Date.now() / 1000) + 180,
        departureTime: Math.floor(Date.now() / 1000) + 240,
      },
      {
        stopId: "725",
        stationId: "725",
        stationName: "Times Sq-42 St",
        arrivalTime: Math.floor(Date.now() / 1000) + 600,
        departureTime: null,
      },
    ],
  };

  describe("initial state", () => {
    it("should initialize with loading state when tripId is provided", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      // Initial state should be loading
      expect(result.current.isActive).toBe(true);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.trip).toBe(null);

      // Wait for fetch to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it("should initialize with inactive state when tripId is null", () => {
      const { result } = renderHook(() => useTripTracker(null));

      expect(result.current.isActive).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.trip).toBe(null);
    });
  });

  describe("trip fetching", () => {
    it("should fetch trip data and update state", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.trip).toEqual(mockTripData);
      expect(result.current.isActive).toBe(true);
      expect(result.current.error).toBe(null);
    });

    it("should derive stop progress correctly", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const stops = result.current.stops;

      // First 3 stops should be passed
      expect(stops[0]?.status).toBe("passed");
      expect(stops[1]?.status).toBe("passed");
      expect(stops[2]?.status).toBe("passed");

      // Current stop (index 3)
      expect(stops[3]?.status).toBe("current");

      // Next stop
      expect(stops[4]?.status).toBe("next");

      // Upcoming stops
      expect(stops[5]?.status).toBe("destination");

      // Verify minutesAway for next stop
      expect(stops[4]?.minutesAway).toBeGreaterThan(0);
    });

    it("should calculate ETA to destination", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.eta).toBe(mockTripData.stops[5]?.arrivalTime);
      expect(result.current.minutesToDestination).toBeGreaterThan(0);
    });

    it("should set progress percent from trip data", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.progressPercent).toBe(45);
    });
  });

  describe("polling behavior", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should poll every 30 seconds", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      // Wait for initial fetch
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      const callCountAfterInitial = vi.mocked(api.api.getTrip).mock.calls.length;
      expect(callCountAfterInitial).toBeGreaterThan(0);

      // Fast forward 30 seconds - should trigger another poll
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      const callCountAfterPoll = vi.mocked(api.api.getTrip).mock.calls.length;
      expect(callCountAfterPoll).toBeGreaterThan(callCountAfterInitial);
    });

    it("should stop polling when tripId changes to null", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result, rerender } = renderHook(({ tripId }) => useTripTracker(tripId), {
        initialProps: { tripId: "test-trip-123" },
      });

      // Wait for initial fetch
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      const callCountAfterInitial = vi.mocked(api.api.getTrip).mock.calls.length;
      expect(callCountAfterInitial).toBeGreaterThan(0);

      // Change tripId to null
      await act(async () => {
        rerender({ tripId: null });
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.trip).toBe(null);

      // Fast forward - should not poll further
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      const callCountAfterStop = vi.mocked(api.api.getTrip).mock.calls.length;
      expect(callCountAfterStop).toBe(callCountAfterInitial);
    });
  });

  describe("error handling", () => {
    it("should handle 404 as trip expiration", async () => {
      const error = new Error("Not found");
      (error as { status: number }).status = 404;
      vi.mocked(api.api.getTrip).mockRejectedValue(error);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isExpired).toBe(true);
      expect(result.current.isActive).toBe(false);
      expect(result.current.error).toBe(null); // No error for expired trips
    });

    it("should show user-friendly error for network failures", async () => {
      const error = new EnhancedApiError("network", "Failed to fetch", 500);
      vi.mocked(api.api.getTrip).mockRejectedValue(error);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.isExpired).toBe(false);
      expect(result.current.isActive).toBe(true);
    });

    it("should show generic error for unknown errors", async () => {
      vi.mocked(api.api.getTrip).mockRejectedValue(new Error("Unknown error"));

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.isExpired).toBe(false);
    });
  });

  describe("refresh and stop", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should refresh trip data on demand", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      // Wait for initial fetch
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      const callCountAfterInitial = vi.mocked(api.api.getTrip).mock.calls.length;
      expect(callCountAfterInitial).toBeGreaterThan(0);

      // Refresh on demand
      await act(async () => {
        result.current.refresh();
        await vi.runOnlyPendingTimersAsync();
      });

      const callCountAfterRefresh = vi.mocked(api.api.getTrip).mock.calls.length;
      expect(callCountAfterRefresh).toBeGreaterThan(callCountAfterInitial);
    });

    it("should stop tracking and clear state", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      // Wait for trip data to load
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(result.current.trip).toBeTruthy();

      // Stop tracking
      act(() => {
        result.current.stop();
      });

      expect(result.current.isActive).toBe(false);
      expect(result.current.trip).toBe(null);
      expect(result.current.stops).toEqual([]);
    });

    it("should ignore stale fetch results after stop", async () => {
      let resolveFetch: (value: unknown) => void;
      const pendingFetch = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      vi.mocked(api.api.getTrip).mockReturnValue(pendingFetch as Promise<never>);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      // Stop before fetch completes
      act(() => {
        result.current.stop();
      });

      // Now resolve the fetch
      await act(async () => {
        resolveFetch!(mockTripData);
        await pendingFetch;
      });

      // State should remain cleared
      expect(result.current.isActive).toBe(false);
      expect(result.current.trip).toBe(null);
    });
  });

  describe("updatedAt timestamp", () => {
    it("should set updatedAt on successful fetch", async () => {
      vi.mocked(api.api.getTrip).mockResolvedValue(mockTripData);

      const beforeCreate = Date.now();
      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.updatedAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(result.current.updatedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("edge cases", () => {
    it("should handle trip with no arrival time at last stop", async () => {
      const tripWithoutEta = {
        ...mockTripData,
        stops: mockTripData.stops.map((s) => ({ ...s, arrivalTime: null })),
      };

      vi.mocked(api.api.getTrip).mockResolvedValue(tripWithoutEta);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.eta).toBe(null);
      expect(result.current.minutesToDestination).toBe(null);
    });

    it("should handle trip with zero progress", async () => {
      const tripNoProgress = {
        ...mockTripData,
        progressPercent: 0,
      };

      vi.mocked(api.api.getTrip).mockResolvedValue(tripNoProgress);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.progressPercent).toBe(0);
    });

    it("should handle all stops as passed when at last stop", async () => {
      const tripAtDestination = {
        ...mockTripData,
        currentStopIndex: 5, // Last stop
      };

      vi.mocked(api.api.getTrip).mockResolvedValue(tripAtDestination);

      const { result } = renderHook(() => useTripTracker("test-trip-123"));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const stops = result.current.stops;
      expect(stops[stops.length - 1]?.status).toBe("destination");
    });
  });
});
