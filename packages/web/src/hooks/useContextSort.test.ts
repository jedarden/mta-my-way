/**
 * Tests for useContextSort hook
 */

import type { Favorite, FavoriteTapEvent } from "@mta-my-way/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useContextSort } from "./useContextSort";

// Mock the favorites store
vi.mock("../stores/favoritesStore", () => ({
  useFavoritesStore: vi.fn(),
}));

// The store module doesn't expose its state interface, so derive it from the
// hook it exports. Every fixture below is checked against this real shape.
type FavoritesState = ReturnType<typeof useFavoritesStore.getState>;

/** A complete Favorite fixture (id, stationId, stationName, lines, direction, sortOrder). */
const createMockFavorite = (
  id: string,
  stationName: string,
  pinned: boolean,
  sortOrder: number
): Favorite => ({
  id,
  stationId: `st${id}`,
  stationName,
  lines: ["1"],
  direction: "both",
  sortOrder,
  pinned,
});

/** A complete FavoriteTapEvent fixture (favoriteId, dayOfWeek, hour). */
const createMockTap = (favoriteId: string, dayOfWeek: number, hour: number): FavoriteTapEvent => ({
  favoriteId,
  dayOfWeek,
  hour,
});

describe("useContextSort", () => {
  /** Complete favorites-store state: data plus every action the real store declares. */
  const mockFavoritesStore: FavoritesState = {
    favorites: [],
    commutes: [],
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useFavoritesStore).mockImplementation((selector) => {
      if (selector) return selector(mockFavoritesStore);
      return mockFavoritesStore;
    });
  });

  it("returns empty array when no favorites", () => {
    mockFavoritesStore.favorites = [];
    mockFavoritesStore.tapHistory = [];

    const { result } = renderHook(() => useContextSort());
    expect(result.current).toEqual([]);
  });

  it("keeps pinned favorites at top", () => {
    mockFavoritesStore.favorites = [
      createMockFavorite("1", "Unpinned", false, 1),
      createMockFavorite("2", "Pinned", true, 2),
      createMockFavorite("3", "Unpinned2", false, 3),
    ];
    mockFavoritesStore.tapHistory = [];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0]?.id).toBe("2"); // Pinned first
    expect(result.current[1]?.id).toBe("1");
    expect(result.current[2]?.id).toBe("3");
  });

  it("sorts by sortOrder when insufficient tap history", () => {
    mockFavoritesStore.favorites = [
      createMockFavorite("1", "First", false, 1),
      createMockFavorite("2", "Second", false, 2),
      createMockFavorite("3", "Third", false, 3),
    ];
    mockFavoritesStore.tapHistory = [
      // Only 10 events - less than MIN_TAP_EVENTS (20)
      ...Array(10)
        .fill(null)
        .map(() => createMockTap("3", 1, 9)),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0]?.id).toBe("1");
    expect(result.current[1]?.id).toBe("2");
    expect(result.current[2]?.id).toBe("3");
  });

  it("sorts by context score when sufficient tap history", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    mockFavoritesStore.favorites = [
      createMockFavorite("1", "Low Score", false, 1),
      createMockFavorite("2", "High Score", false, 2),
      createMockFavorite("3", "Medium Score", false, 3),
    ];

    // Create 30 tap events - enough to activate context sort
    // Favorite "2" gets 20 taps at current time
    // Favorite "3" gets 10 taps at current time
    mockFavoritesStore.tapHistory = [
      ...Array(20)
        .fill(null)
        .map(() => createMockTap("2", currentDay, currentHour)),
      ...Array(10)
        .fill(null)
        .map(() => createMockTap("3", currentDay, currentHour)),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0]?.id).toBe("2"); // Highest score
    expect(result.current[1]?.id).toBe("3"); // Medium score
    expect(result.current[2]?.id).toBe("1"); // Lowest score (0 taps)
  });

  it("uses sortOrder as tiebreaker for equal scores", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    mockFavoritesStore.favorites = [
      createMockFavorite("1", "Same Score", false, 1),
      createMockFavorite("2", "Same Score", false, 2),
      createMockFavorite("3", "Same Score", false, 3),
    ];

    // All have same score (5 taps each)
    mockFavoritesStore.tapHistory = [
      ...Array(5)
        .fill(null)
        .map(() => createMockTap("1", currentDay, currentHour)),
      ...Array(5)
        .fill(null)
        .map(() => createMockTap("2", currentDay, currentHour)),
      ...Array(5)
        .fill(null)
        .map(() => createMockTap("3", currentDay, currentHour)),
      ...Array(5)
        .fill(null)
        .map(() => createMockTap("1", currentDay, currentHour)),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0]?.id).toBe("1"); // sortOrder 1
    expect(result.current[1]?.id).toBe("2"); // sortOrder 2
    expect(result.current[2]?.id).toBe("3"); // sortOrder 3
  });

  it("only counts taps within ±1 hour window", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    mockFavoritesStore.favorites = [
      createMockFavorite("1", "In Window", false, 1),
      createMockFavorite("2", "Out of Window", false, 2),
    ];

    mockFavoritesStore.tapHistory = [
      // Favorite "1" gets taps within window (current hour)
      ...Array(10)
        .fill(null)
        .map(() => createMockTap("1", currentDay, currentHour)),
      // Favorite "2" gets taps 3 hours away (out of window)
      ...Array(20)
        .fill(null)
        .map(() => createMockTap("2", currentDay, currentHour + 3)),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0]?.id).toBe("1"); // Should have higher score
    expect(result.current[1]?.id).toBe("2");
  });

  it("only counts taps for current day of week", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const differentDay = currentDay === 0 ? 1 : 0;

    mockFavoritesStore.favorites = [
      createMockFavorite("1", "Today", false, 1),
      createMockFavorite("2", "Different Day", false, 2),
    ];

    mockFavoritesStore.tapHistory = [
      // Favorite "1" gets taps today
      ...Array(10)
        .fill(null)
        .map(() => createMockTap("1", currentDay, currentHour)),
      // Favorite "2" gets taps on different day
      ...Array(20)
        .fill(null)
        .map(() => createMockTap("2", differentDay, currentHour)),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0]?.id).toBe("1");
  });

  it("pinned always first regardless of score", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    mockFavoritesStore.favorites = [
      createMockFavorite("1", "Unpinned High Score", false, 1),
      createMockFavorite("2", "Pinned Low Score", true, 2),
    ];

    mockFavoritesStore.tapHistory = [
      // Unpinned gets many taps
      ...Array(30)
        .fill(null)
        .map(() => createMockTap("1", currentDay, currentHour)),
      // Pinned gets only a few taps
      ...Array(2)
        .fill(null)
        .map(() => createMockTap("2", currentDay, currentHour)),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0]?.id).toBe("2"); // Pinned first despite lower score
  });
});
