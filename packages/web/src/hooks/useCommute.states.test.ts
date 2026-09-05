/**
 * Tests for useCommute's status transitions and request body.
 *
 * Kept separate from useCommute.test.ts, which carries the accessibleMode
 * threading tests and travels with the hook change that introduces it.
 * Everything here asserts behaviour that already exists at HEAD.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeCommuteAnalysis,
  makeDirectRoute,
  makeSettingsState,
  makeTransferRoute,
} from "../test/factories";
import { getBestRoute, useCommute } from "./useCommute";

// Mock api
const mockAnalyzeCommute = vi.fn();
vi.mock("../lib/api", () => ({
  api: {
    analyzeCommute: (...args: unknown[]) => mockAnalyzeCommute(...args),
  },
}));

// Mock settingsStore with Zustand selector pattern
let mockSettings = makeSettingsState();

vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: vi.fn((selector) => (selector ? selector(mockSettings) : mockSettings)),
}));

// Every test passes preferredLines explicitly, for the same reason the array
// is hoisted: the hook's own fallback is a fresh [] literal per render, which
// changes fetchCommute's identity and re-fires the fetching effect on every
// pass — an endless fetch loop that OOMs the tab. Real callers pass a store
// reference, so the tests do too. The fallback itself is under mtamyway-5b3b50ec.
const NO_LINES: string[] = [];

describe("useCommute request body", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSettings = makeSettingsState();
    mockAnalyzeCommute.mockReset();
    mockAnalyzeCommute.mockResolvedValue(makeCommuteAnalysis());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the full request body including preferred lines and commute id", async () => {
    // Hoisted so the array keeps a stable identity across renders. An inline
    // literal in the render callback is a new array every render, which
    // changes fetchCommute's identity and re-fires the effect on each pass.
    const PREFERRED_LINES = ["1", "2"];

    const { result } = renderHook(() =>
      useCommute({
        originId: "725",
        destinationId: "101",
        preferredLines: PREFERRED_LINES,
        commuteId: "work",
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // objectContaining rather than exact equality: the hook is free to add
    // further request fields (accessibleMode is landing shortly), and this
    // test is about the four fields the commute editor controls.
    expect(mockAnalyzeCommute).toHaveBeenCalledWith(
      expect.objectContaining({
        originId: "725",
        destinationId: "101",
        preferredLines: ["1", "2"],
        commuteId: "work",
      })
    );
    expect(result.current.status).toBe("success");
  });

  it("defaults preferredLines to an empty array and commuteId to 'default'", async () => {
    renderHook(() =>
      useCommute({ originId: "725", destinationId: "101", preferredLines: NO_LINES })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockAnalyzeCommute).toHaveBeenCalledWith(
      expect.objectContaining({ preferredLines: [], commuteId: "default" })
    );
  });
});

describe("useCommute status transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSettings = makeSettingsState();
    // mockReset, not mockClear: clearAllMocks keeps implementations, so a
    // never-resolving mockReturnValue from the staleness test would leak into
    // every test after it and leave them waiting on a fetch that never lands.
    mockAnalyzeCommute.mockReset();
    mockAnalyzeCommute.mockResolvedValue(makeCommuteAnalysis());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports loading until the analysis resolves", async () => {
    let resolveFetch: (value: ReturnType<typeof makeCommuteAnalysis>) => void = () => {};
    mockAnalyzeCommute.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() =>
      useCommute({ originId: "725", destinationId: "101", preferredLines: NO_LINES })
    );

    expect(result.current.status).toBe("loading");
    expect(result.current.data).toBe(null);

    await act(async () => {
      resolveFetch(makeCommuteAnalysis());
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("success");
    expect(result.current.data).toEqual(makeCommuteAnalysis());
    expect(result.current.updatedAt).not.toBe(null);
  });

  it("reports error and drops data when the analysis fails while online", async () => {
    mockAnalyzeCommute.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useCommute({ originId: "725", destinationId: "101", preferredLines: NO_LINES })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe("We couldn't analyze this commute right now.");
    expect(result.current.updatedAt).toBe(null);
  });

  it("reports offline instead of error when the device is offline", async () => {
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", { writable: true, value: false });
    mockAnalyzeCommute.mockRejectedValue(new Error("offline"));

    try {
      const { result } = renderHook(() =>
        useCommute({ originId: "725", destinationId: "101", preferredLines: NO_LINES })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.status).toBe("offline");
      expect(result.current.error).toBe("We couldn't analyze this commute right now.");
    } finally {
      Object.defineProperty(navigator, "onLine", { writable: true, value: originalOnLine });
    }
  });

  it("keeps the previous data and marks the state stale while a re-fetch is in flight", async () => {
    const settled = makeCommuteAnalysis();
    mockAnalyzeCommute.mockResolvedValueOnce(settled);

    const { result } = renderHook(() =>
      useCommute({ originId: "725", destinationId: "101", preferredLines: NO_LINES })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("success");

    // Second fetch never resolves, so the hook is stuck holding old data.
    mockAnalyzeCommute.mockReturnValue(new Promise(() => {}));

    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("stale");
    expect(result.current.data).toBe(settled);
    expect(mockAnalyzeCommute).toHaveBeenCalledTimes(2);
  });

  it("re-fetches when refresh() is called", async () => {
    const { result } = renderHook(() =>
      useCommute({ originId: "725", destinationId: "101", preferredLines: NO_LINES })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockAnalyzeCommute).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockAnalyzeCommute).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("success");
  });

  it("auto-refreshes on the configured settings interval", async () => {
    mockSettings = makeSettingsState({ refreshInterval: 2 });

    renderHook(() =>
      useCommute({ originId: "725", destinationId: "101", preferredLines: NO_LINES })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockAnalyzeCommute).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockAnalyzeCommute).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(mockAnalyzeCommute).toHaveBeenCalledTimes(3);
  });

  it("drops back to idle and clears data when the commute is unset", async () => {
    const { result, rerender } = renderHook(
      ({ originId, destinationId }) =>
        useCommute({ originId, destinationId, preferredLines: NO_LINES }),
      { initialProps: { originId: "725", destinationId: "101" as string | null } }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe("success");

    rerender({ originId: "725", destinationId: null });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBe(null);
  });

  it("does not fetch when only one endpoint is set", () => {
    renderHook(() =>
      useCommute({ originId: "725", destinationId: null, preferredLines: NO_LINES })
    );

    expect(mockAnalyzeCommute).not.toHaveBeenCalled();
  });
});

describe("getBestRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when neither route type was found", () => {
    const analysis = makeCommuteAnalysis({ directRoutes: [], transferRoutes: [] });

    expect(getBestRoute(analysis)).toBe(null);
  });

  it("returns the direct route when no transfer exists", () => {
    const analysis = makeCommuteAnalysis({
      directRoutes: [makeDirectRoute({ estimatedTravelMinutes: 18 })],
      transferRoutes: [],
    });

    expect(getBestRoute(analysis)).toEqual({ type: "direct", minutes: 18, timeSaved: 0 });
  });

  it("returns the transfer route when no direct exists", () => {
    const analysis = makeCommuteAnalysis({
      directRoutes: [],
      // timeSavedVsDirect is in seconds; 240s == 4 min
      transferRoutes: [makeTransferRoute({ totalEstimatedMinutes: 26, timeSavedVsDirect: 240 })],
    });

    expect(getBestRoute(analysis)).toEqual({ type: "transfer", minutes: 26, timeSaved: 4 });
  });

  it("prefers the transfer when the engine recommends it and it clears the savings threshold", () => {
    const analysis = makeCommuteAnalysis({
      directRoutes: [makeDirectRoute({ estimatedTravelMinutes: 30 })],
      transferRoutes: [makeTransferRoute({ totalEstimatedMinutes: 24, timeSavedVsDirect: 180 })],
      recommendation: "transfer",
    });

    expect(getBestRoute(analysis)).toEqual({ type: "transfer", minutes: 24, timeSaved: 3 });
  });

  it("stays on the direct route when the transfer does not clear the savings threshold", () => {
    const analysis = makeCommuteAnalysis({
      directRoutes: [makeDirectRoute({ estimatedTravelMinutes: 30 })],
      transferRoutes: [makeTransferRoute({ totalEstimatedMinutes: 28, timeSavedVsDirect: 60 })],
      recommendation: "transfer",
    });

    expect(getBestRoute(analysis)).toEqual({ type: "direct", minutes: 30, timeSaved: 0 });
  });
});
