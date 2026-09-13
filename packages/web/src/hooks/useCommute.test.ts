/**
 * Tests for useCommute hook
 *
 * Tests the commute analysis fetching hook including:
 * - Data fetching and status transitions
 * - Accessible mode threading from settings to the API request
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCommuteAnalysis, makeSettingsState } from "../test/factories";
import { useCommute } from "./useCommute";

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

describe("useCommute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockSettings = makeSettingsState();
    mockAnalyzeCommute.mockResolvedValue(makeCommuteAnalysis());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns idle status when no commute is configured", () => {
    const { result } = renderHook(() => useCommute({ originId: null, destinationId: null }));

    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBe(null);
    expect(mockAnalyzeCommute).not.toHaveBeenCalled();
  });

  it("sends accessibleMode false by default", async () => {
    const { result } = renderHook(() => useCommute({ originId: "101", destinationId: "725" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("success");
    expect(mockAnalyzeCommute).toHaveBeenCalledWith(
      expect.objectContaining({ originId: "101", destinationId: "725", accessibleMode: false })
    );
  });

  it("sends accessibleMode true when the settings toggle is on", async () => {
    mockSettings = makeSettingsState({ accessibleMode: true });

    const { result } = renderHook(() => useCommute({ originId: "101", destinationId: "725" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("success");
    expect(mockAnalyzeCommute).toHaveBeenCalledWith(
      expect.objectContaining({ originId: "101", destinationId: "725", accessibleMode: true })
    );
  });

  it("re-fetches with the new value when the toggle flips", async () => {
    const { result, rerender } = renderHook(() =>
      useCommute({ originId: "101", destinationId: "725" })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockAnalyzeCommute).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessibleMode: false })
    );

    mockSettings = makeSettingsState({ accessibleMode: true });
    rerender();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockAnalyzeCommute).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessibleMode: true })
    );
    expect(mockAnalyzeCommute).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("success");
  });
});
