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

// The journal and fare stores don't export their state interfaces, so derive
// them from the stores themselves. Every fixture below is checked against
// these real shapes.
type FavoritesState = ReturnType<typeof useFavoritesStore.getState>;
type JournalState = ReturnType<typeof useJournalStore.getState>;
type FareState = ReturnType<typeof useFareStore.getState>;

/** Complete favorites-store state, with the commute the tests match against. */
const createMockFavoritesState = (overrides: Partial<FavoritesState> = {}): FavoritesState => ({
  favorites: [],
  commutes: [
    {
      id: "commute1",
      name: "Work",
      origin: { stationId: "101", stationName: "South Ferry" },
      destination: { stationId: "725", stationName: "Times Square" },
      preferredLines: ["1"],
      enableTransferSuggestions: false,
    },
  ],
  tapHistory: [],
  onboardingComplete: false,
  addFavorite: vi.fn(),
  updateFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  reorderFavorites: vi.fn(),
  togglePin: vi.fn(),
  addCommute: vi.fn(),
  updateCommute: vi.fn(),
  removeCommute: vi.fn(),
  toggleCommutePin: vi.fn(),
  recordTap: vi.fn(),
  completeOnboarding: vi.fn(),
  replaceFromSync: vi.fn(),
  clearLocalData: vi.fn(),
  ...overrides,
});

/** Complete journal-store state: data plus every action the real store declares. */
const createMockJournalState = (overrides: Partial<JournalState> = {}): JournalState => ({
  stats: {},
  dayOfWeekStats: {},
  lastStationVisit: null,
  setCommuteStats: vi.fn(),
  addTripRecord: mockAddTripRecord,
  updateTripRecord: vi.fn(),
  removeTripRecord: vi.fn(),
  removeCommuteStats: vi.fn(),
  clearJournal: vi.fn(),
  detectAnomaly: vi.fn(),
  getDayOfWeekStats: vi.fn(),
  recordStationVisit: vi.fn(),
  getLastStationVisit: vi.fn(),
  clearLastStationVisit: vi.fn(),
  ...overrides,
});

/** Complete fare-store state: tracking data plus every action the real store declares. */
const createMockFareState = (overrides: Partial<FareState> = {}): FareState => ({
  tracking: {
    weeklyRides: 0,
    weekStartDate: "",
    monthlyRides: 0,
    monthStartDate: "",
    rideLog: [],
    currentFare: 2.9,
    unlimitedPassPrice: 132,
  },
  addRideLogEntry: mockAddRideLogEntry,
  setCurrentFare: vi.fn(),
  setUnlimitedPassPrice: vi.fn(),
  resetWeek: vi.fn(),
  resetMonth: vi.fn(),
  updateTracking: vi.fn(),
  clearFareData: vi.fn(),
  getCapStatus: vi.fn(),
  ...overrides,
});

describe("useInferredTrips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());

    vi.mocked(useFavoritesStore).mockImplementation((selector) => {
      const state = createMockFavoritesState();
      return selector ? selector(state) : state;
    });

    vi.mocked(useJournalStore).mockImplementation((selector) => {
      const state = createMockJournalState();
      return selector ? selector(state) : state;
    });

    vi.mocked(useFareStore).mockImplementation((selector) => {
      const state = createMockFareState();
      return selector ? selector(state) : state;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when currentStationId is null", () => {
    renderHook(() => useInferredTrips(null, "Times Square", ["1"]));

    expect(mockAddTripRecord).not.toHaveBeenCalled();
    expect(mockAddRideLogEntry).not.toHaveBeenCalled();
  });

  it("does nothing when station has no lines", () => {
    renderHook(() => useInferredTrips("725", "Times Square", []));

    expect(mockAddTripRecord).not.toHaveBeenCalled();
  });

  it("records first station visit", () => {
    renderHook(({ stationId, name, lines }) => useInferredTrips(stationId, name, lines), {
      initialProps: {
        stationId: "101",
        name: "South Ferry",
        lines: ["1"],
      },
    });

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
      const state = createMockFavoritesState({ commutes: [] }); // No commutes
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
