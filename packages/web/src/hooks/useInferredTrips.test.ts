/**
 * Tests for useInferredTrips hook
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInferredTrips, useStationVisitTracker } from "./useInferredTrips";

// Mock the stores before importing the module
const mockAddTripRecord = vi.fn();
const mockAddRideLogEntry = vi.fn();

vi.mock("../stores/favoritesStore", () => ({
  useFavoritesStore: vi.fn(),
}));

vi.mock("../stores/journalStore", () => ({
  useJournalStore: vi.fn(),
}));

vi.mock("../stores/fareStore", () => ({
  useFareStore: vi.fn(),
}));

import { useFareStore } from "../stores/fareStore";
// Import after mocking
import { useFavoritesStore } from "../stores/favoritesStore";
import { useJournalStore } from "../stores/journalStore";

describe("useInferredTrips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());

    vi.mocked(useFavoritesStore).mockImplementation((selector) => {
      const state = {
        commutes: [
          {
            id: "commute1",
            origin: { stationId: "101", stationName: "South Ferry" },
            destination: { stationId: "725", stationName: "Times Square" },
            preferredLines: ["1"],
          },
        ],
        favorites: [],
      };
      return selector ? selector(state) : state;
    });

    vi.mocked(useJournalStore).mockImplementation((selector) => {
      const state = {
        addTripRecord: mockAddTripRecord,
      };
      return selector ? selector(state) : state;
    });

    vi.mocked(useFareStore).mockImplementation((selector) => {
      const state = {
        addRideLogEntry: mockAddRideLogEntry,
      };
      return selector ? selector(state) : state;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when currentStationId is null", () => {
    const { result } = renderHook(() => useInferredTrips(null, "Times Square", ["1"]));

    expect(mockAddTripRecord).not.toHaveBeenCalled();
    expect(mockAddRideLogEntry).not.toHaveBeenCalled();
  });

  it("does nothing when station has no lines", () => {
    const { result } = renderHook(() => useInferredTrips("725", "Times Square", []));

    expect(mockAddTripRecord).not.toHaveBeenCalled();
  });

  it("records first station visit", () => {
    const { rerender } = renderHook(
      ({ stationId, name, lines }) => useInferredTrips(stationId, name, lines),
      {
        initialProps: {
          stationId: "101",
          name: "South Ferry",
          lines: ["1"],
        },
      }
    );

    expect(mockAddTripRecord).not.toHaveBeenCalled();
  });

  it("infers trip when visiting second station within time window", () => {
    const { rerender } = renderHook(
      ({ stationId, name, lines }) => useInferredTrips(stationId, name, lines),
      {
        initialProps: {
          stationId: "101",
          name: "South Ferry",
          lines: ["1"],
        },
      }
    );

    // Advance time by 30 minutes
    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    rerender({
      stationId: "725",
      name: "Times Square",
      lines: ["1"],
    });

    expect(mockAddTripRecord).toHaveBeenCalledWith(
      "commute1",
      expect.objectContaining({
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Square" },
        source: "inferred",
        line: "1",
        actualDurationMinutes: 30,
      })
    );

    expect(mockAddRideLogEntry).toHaveBeenCalled();
  });

  it("does not infer trip if time between visits is too short (< 5 min)", () => {
    const { rerender } = renderHook(
      ({ stationId, name, lines }) => useInferredTrips(stationId, name, lines),
      {
        initialProps: {
          stationId: "101",
          name: "South Ferry",
          lines: ["1"],
        },
      }
    );

    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1000); // Only 3 minutes
    });

    rerender({
      stationId: "725",
      name: "Times Square",
      lines: ["1"],
    });

    expect(mockAddTripRecord).not.toHaveBeenCalled();
  });

  it("does not infer trip if time between visits is too long (> 90 min)", () => {
    const { rerender } = renderHook(
      ({ stationId, name, lines }) => useInferredTrips(stationId, name, lines),
      {
        initialProps: {
          stationId: "101",
          name: "South Ferry",
          lines: ["1"],
        },
      }
    );

    act(() => {
      vi.advanceTimersByTime(100 * 60 * 1000); // 100 minutes
    });

    rerender({
      stationId: "725",
      name: "Times Square",
      lines: ["1"],
    });

    expect(mockAddTripRecord).not.toHaveBeenCalled();
  });

  it("does not infer trip if stations have no common lines", () => {
    const { rerender } = renderHook(
      ({ stationId, name, lines }) => useInferredTrips(stationId, name, lines),
      {
        initialProps: {
          stationId: "101",
          name: "South Ferry",
          lines: ["1"],
        },
      }
    );

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    rerender({
      stationId: "726",
      name: "Port Authority",
      lines: ["A", "C", "E"],
    });

    expect(mockAddTripRecord).not.toHaveBeenCalled();
  });

  it("does not infer trip if no matching commute found", () => {
    vi.mocked(useFavoritesStore).mockImplementation((selector) => {
      const state = {
        commutes: [], // No commutes
        favorites: [],
      };
      return selector ? selector(state) : state;
    });

    const { rerender } = renderHook(
      ({ stationId, name, lines }) => useInferredTrips(stationId, name, lines),
      {
        initialProps: {
          stationId: "101",
          name: "South Ferry",
          lines: ["1"],
        },
      }
    );

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    rerender({
      stationId: "725",
      name: "Times Square",
      lines: ["1"],
    });

    expect(mockAddTripRecord).not.toHaveBeenCalled();
  });

  it("uses first common line for inferred trip", () => {
    const { rerender } = renderHook(
      ({ stationId, name, lines }) => useInferredTrips(stationId, name, lines),
      {
        initialProps: {
          stationId: "101",
          name: "South Ferry",
          lines: ["1", "2", "3"],
        },
      }
    );

    act(() => {
      vi.advanceTimersByTime(30 * 60 * 1000);
    });

    rerender({
      stationId: "725",
      name: "Times Square",
      lines: ["1", "2", "3"],
    });

    expect(mockAddTripRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        line: "1", // First common line
      })
    );
  });
});

describe("useStationVisitTracker", () => {
  it("reports station visits", () => {
    const { result } = renderHook(() => useStationVisitTracker());

    act(() => {
      result.current.reportVisit("101", "South Ferry", ["1"]);
    });

    const lastVisit = result.current.getLastVisit();
    expect(lastVisit).toEqual({
      stationId: "101",
      stationName: "South Ferry",
      lines: ["1"],
      timestamp: expect.any(Number),
    });
  });

  it("returns null when no visit recorded", () => {
    const { result } = renderHook(() => useStationVisitTracker());

    expect(result.current.getLastVisit()).toBeNull();
  });

  it("overwrites previous visit", () => {
    const { result } = renderHook(() => useStationVisitTracker());

    act(() => {
      result.current.reportVisit("101", "South Ferry", ["1"]);
    });

    act(() => {
      result.current.reportVisit("725", "Times Square", ["1", "2", "3"]);
    });

    const lastVisit = result.current.getLastVisit();
    expect(lastVisit?.stationId).toBe("725");
  });
});
