/**
 * Tests for usePositions hook
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { makeLineDiagram, makeTrainPosition } from "../test/factories";
import { getTrainOverallProgress, usePositions } from "./usePositions";

// Mock the API module
vi.mock("../lib/api", () => ({
  api: {
    getPositions: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

describe("usePositions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Set up system time
    vi.setSystemTime(Date.now());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns idle state when lineId is null", () => {
    const { result } = renderHook(() => usePositions(null));

    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeNull();
  });

  it("fetches positions when lineId is provided", async () => {
    const mockData = makeLineDiagram({
      trains: [
        makeTrainPosition({
          tripId: "trip1",
          routeId: "1",
          direction: "N",
          lastStopId: "101",
          nextStopId: "102",
          progress: 0.5,
          isAssigned: true,
          isRerouted: false,
        }),
      ],
      stops: [
        { stopId: "101", stopName: "South Ferry", isTerminal: false, isTransferStation: false },
        { stopId: "102", stopName: "Rector St", isTerminal: false, isTransferStation: false },
      ],
    });

    mockedApi.getPositions.mockResolvedValue(mockData);

    const { result } = renderHook(() => usePositions("1"));

    expect(result.current.status).toBe("loading");

    // Run only the pending promise (not the interval)
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("success");
    expect(mockedApi.getPositions).toHaveBeenCalledWith("1");
    expect(result.current.data).toEqual(mockData);
    expect(result.current.updatedAt).toBeGreaterThan(0);
  }, 10000);

  it("returns error state on fetch failure", async () => {
    mockedApi.getPositions.mockRejectedValue(new Error("Network error"));

    // Simulate online state
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: true,
    });

    const { result } = renderHook(() => usePositions("1"));

    // Run only pending timers
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Network error");
  }, 10000);

  it("returns offline state when offline and no cache", async () => {
    mockedApi.getPositions.mockRejectedValue(new Error("Offline"));

    // Simulate offline state
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });

    const { result } = renderHook(() => usePositions("1"));

    // Run only pending timers
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("offline");
    expect(result.current.error).toBe("Offline");
  }, 10000);

  it("uses cached data on subsequent fetches", async () => {
    const mockData = makeLineDiagram({
      trains: [
        makeTrainPosition({
          tripId: "trip1",
          routeId: "1",
          direction: "N",
          lastStopId: "101",
          nextStopId: "102",
          progress: 0.5,
          isAssigned: true,
          isRerouted: false,
        }),
      ],
      stops: [
        { stopId: "101", stopName: "South Ferry", isTerminal: false, isTransferStation: false },
        { stopId: "102", stopName: "Rector St", isTerminal: false, isTransferStation: false },
      ],
    });

    mockedApi.getPositions.mockResolvedValue(mockData);

    const { result, rerender } = renderHook(({ lineId }) => usePositions(lineId), {
      initialProps: { lineId: "1" },
    });

    // Run only pending timers
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("success");

    // Clear mock
    mockedApi.getPositions.mockClear();

    // Re-render with same lineId - should use cache
    rerender({ lineId: "1" });

    // Should have cached data immediately
    expect(result.current.status).toBe("success");
    expect(result.current.data).toEqual(mockData);
  }, 10000);

  it("auto-refreshes every 30 seconds", async () => {
    const mockData = makeLineDiagram({
      trains: [],
      stops: [],
    });

    mockedApi.getPositions.mockResolvedValue(mockData);

    const { result } = renderHook(() => usePositions("1"));

    // Run only the initial fetch
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("success");

    const initialCallCount = mockedApi.getPositions.mock.calls.length;

    // Advance 30 seconds and run only pending timers (not all timers)
    await act(async () => {
      vi.advanceTimersByTimeAsync(30000);
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockedApi.getPositions.mock.calls.length).toBeGreaterThan(initialCallCount);
  }, 10000);

  it("clears interval on unmount", async () => {
    const mockData = makeLineDiagram({
      trains: [],
      stops: [],
    });

    mockedApi.getPositions.mockResolvedValue(mockData);

    const { result, unmount } = renderHook(() => usePositions("1"));

    // Run only the initial fetch
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("success");

    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  }, 10000);

  it("triggers haptic on manual refresh when available", async () => {
    const mockVibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", {
      writable: true,
      value: mockVibrate,
    });

    const mockData = makeLineDiagram({
      trains: [],
      stops: [],
    });

    mockedApi.getPositions.mockResolvedValue(mockData);

    const { result } = renderHook(() => usePositions("1"));

    // Run only the initial fetch
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("success");

    await act(async () => {
      result.current.refresh();
    });

    expect(mockVibrate).toHaveBeenCalledWith(10);
  }, 10000);

  it("handles lineId changes", async () => {
    const mockData1 = makeLineDiagram({
      trains: [
        makeTrainPosition({
          tripId: "trip1",
          routeId: "1",
          direction: "N",
          lastStopId: "101",
          nextStopId: "102",
          progress: 0.5,
          isAssigned: true,
          isRerouted: false,
        }),
      ],
      stops: [
        { stopId: "101", stopName: "South Ferry", isTerminal: false, isTransferStation: false },
      ],
    });

    const mockData2 = makeLineDiagram({
      trains: [
        makeTrainPosition({
          tripId: "trip2",
          routeId: "2",
          direction: "S",
          lastStopId: "201",
          nextStopId: "202",
          progress: 0.3,
          isAssigned: true,
          isRerouted: false,
        }),
      ],
      stops: [
        { stopId: "201", stopName: "Times Square", isTerminal: false, isTransferStation: false },
      ],
    });

    // Set up initial mock for line 1
    mockedApi.getPositions.mockResolvedValue(mockData1);

    const { result, rerender } = renderHook(({ lineId }) => usePositions(lineId), {
      initialProps: { lineId: "1" },
    });

    // Run only the initial fetch
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("success");
    expect(result.current.data?.trains[0]?.routeId).toBe("1");

    // Change mock for line 2
    mockedApi.getPositions.mockResolvedValue(mockData2);

    rerender({ lineId: "2" });

    // Run only pending timers - may trigger both the effect fetch and interval
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(result.current.status).toBe("success");
    expect(result.current.data?.trains[0]?.routeId).toBe("2");
  }, 10000);

  it("sets status to stale when refetching with existing data", async () => {
    // Use real timers for this test since we need setTimeout to work
    vi.useRealTimers();

    const mockData = makeLineDiagram({
      trains: [],
      stops: [],
    });

    // Track fetch calls
    let fetchCallCount = 0;

    mockedApi.getPositions.mockImplementation(() => {
      fetchCallCount++;
      // Return a promise that resolves after a short delay
      return new Promise((resolve) => {
        setTimeout(() => resolve(mockData), 10);
      });
    });

    const { result } = renderHook(() => usePositions("1"));

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(fetchCallCount).toBeGreaterThan(0);

    // Get the initial fetch count
    const initialFetchCount = fetchCallCount;

    // Trigger a refresh
    act(() => {
      result.current.refresh();
    });

    // After refresh is triggered, status should be stale while fetching
    // because we have existing data
    await waitFor(
      () => {
        expect(result.current.status).toBe("stale");
      },
      { timeout: 100 }
    );

    expect(fetchCallCount).toBeGreaterThan(initialFetchCount);

    // Wait for the fetch to complete and status to return to success
    await waitFor(
      () => {
        expect(result.current.status).toBe("success");
      },
      { timeout: 200 }
    );

    // Restore fake timers for other tests
    vi.useFakeTimers();
  }, 15000);
});

describe("getTrainOverallProgress", () => {
  it("calculates progress based on stop positions", () => {
    const train = makeTrainPosition({
      tripId: "trip1",
      routeId: "1",
      direction: "N",
      lastStopId: "101",
      nextStopId: "103",
      progress: 0.5,
      isAssigned: true,
      isRerouted: false,
    });

    const stops = [
      { stopId: "101", stopName: "South Ferry", isTerminal: false, isTransferStation: false },
      { stopId: "102", stopName: "Rector St", isTerminal: false, isTransferStation: false },
      { stopId: "103", stopName: "WTC", isTerminal: false, isTransferStation: false },
      { stopId: "104", stopName: "Chambers", isTerminal: false, isTransferStation: false },
    ];

    const progress = getTrainOverallProgress(train, stops);

    // Train is at stop 101 (index 0), going to 103 (index 2)
    // With 50% progress between them
    // Stop progress: 0/3 = 0
    // Inter-stop progress: (2/3) * 0.5 = 0.333
    // Total: 0.333
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(1);
  });

  it("returns 0 when last stop not found", () => {
    const train = makeTrainPosition({
      tripId: "trip1",
      routeId: "1",
      direction: "N",
      lastStopId: "999",
      nextStopId: "103",
      progress: 0.5,
      isAssigned: true,
      isRerouted: false,
    });

    const stops = [
      { stopId: "101", stopName: "South Ferry", isTerminal: false, isTransferStation: false },
      { stopId: "103", stopName: "WTC", isTerminal: false, isTransferStation: false },
    ];

    const progress = getTrainOverallProgress(train, stops);
    expect(progress).toBe(0);
  });

  it("returns 0 when next stop not found", () => {
    const train = makeTrainPosition({
      tripId: "trip1",
      routeId: "1",
      direction: "N",
      lastStopId: "101",
      nextStopId: "999",
      progress: 0.5,
      isAssigned: true,
      isRerouted: false,
    });

    const stops = [
      { stopId: "101", stopName: "South Ferry", isTerminal: false, isTransferStation: false },
      { stopId: "103", stopName: "WTC", isTerminal: false, isTransferStation: false },
    ];

    const progress = getTrainOverallProgress(train, stops);
    expect(progress).toBe(0);
  });

  it("handles single stop", () => {
    const train = makeTrainPosition({
      tripId: "trip1",
      routeId: "1",
      direction: "N",
      lastStopId: "101",
      nextStopId: "101",
      progress: 0,
      isAssigned: true,
      isRerouted: false,
    });

    const stops = [
      { stopId: "101", stopName: "South Ferry", isTerminal: false, isTransferStation: false },
    ];

    const progress = getTrainOverallProgress(train, stops);
    expect(progress).toBe(0);
  });
});
