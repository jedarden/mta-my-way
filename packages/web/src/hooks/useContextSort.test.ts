/**
 * Tests for useContextSort hook
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useContextSort } from "./useContextSort";

// Mock the favorites store
vi.mock("../stores/favoritesStore", () => ({
  useFavoritesStore: vi.fn(),
}));

describe("useContextSort", () => {
  const mockFavoritesStore = {
    favorites: [],
    tapHistory: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useFavoritesStore as any).mockImplementation((selector) => {
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
      { id: "1", name: "Unpinned", pinned: false, sortOrder: 1 },
      { id: "2", name: "Pinned", pinned: true, sortOrder: 2 },
      { id: "3", name: "Unpinned2", pinned: false, sortOrder: 3 },
    ];
    mockFavoritesStore.tapHistory = [];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0].id).toBe("2"); // Pinned first
    expect(result.current[1].id).toBe("1");
    expect(result.current[2].id).toBe("3");
  });

  it("sorts by sortOrder when insufficient tap history", () => {
    mockFavoritesStore.favorites = [
      { id: "1", name: "First", pinned: false, sortOrder: 1 },
      { id: "2", name: "Second", pinned: false, sortOrder: 2 },
      { id: "3", name: "Third", pinned: false, sortOrder: 3 },
    ];
    mockFavoritesStore.tapHistory = [
      // Only 10 events - less than MIN_TAP_EVENTS (20)
      ...Array(10)
        .fill(null)
        .map((_, i) => ({
          favoriteId: "3",
          dayOfWeek: 1,
          hour: 9,
          timestamp: Date.now() - i * 1000,
        })),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0].id).toBe("1");
    expect(result.current[1].id).toBe("2");
    expect(result.current[2].id).toBe("3");
  });

  it("sorts by context score when sufficient tap history", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    mockFavoritesStore.favorites = [
      { id: "1", name: "Low Score", pinned: false, sortOrder: 1 },
      { id: "2", name: "High Score", pinned: false, sortOrder: 2 },
      { id: "3", name: "Medium Score", pinned: false, sortOrder: 3 },
    ];

    // Create 30 tap events - enough to activate context sort
    // Favorite "2" gets 20 taps at current time
    // Favorite "3" gets 10 taps at current time
    mockFavoritesStore.tapHistory = [
      ...Array(20)
        .fill(null)
        .map(() => ({
          favoriteId: "2",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
      ...Array(10)
        .fill(null)
        .map(() => ({
          favoriteId: "3",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0].id).toBe("2"); // Highest score
    expect(result.current[1].id).toBe("3"); // Medium score
    expect(result.current[2].id).toBe("1"); // Lowest score (0 taps)
  });

  it("uses sortOrder as tiebreaker for equal scores", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    mockFavoritesStore.favorites = [
      { id: "1", name: "Same Score", pinned: false, sortOrder: 1 },
      { id: "2", name: "Same Score", pinned: false, sortOrder: 2 },
      { id: "3", name: "Same Score", pinned: false, sortOrder: 3 },
    ];

    // All have same score (5 taps each)
    mockFavoritesStore.tapHistory = [
      ...Array(5)
        .fill(null)
        .map(() => ({
          favoriteId: "1",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
      ...Array(5)
        .fill(null)
        .map(() => ({
          favoriteId: "2",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
      ...Array(5)
        .fill(null)
        .map(() => ({
          favoriteId: "3",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
      ...Array(5)
        .fill(null)
        .map(() => ({
          favoriteId: "1",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0].id).toBe("1"); // sortOrder 1
    expect(result.current[1].id).toBe("2"); // sortOrder 2
    expect(result.current[2].id).toBe("3"); // sortOrder 3
  });

  it("only counts taps within ±1 hour window", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    mockFavoritesStore.favorites = [
      { id: "1", name: "In Window", pinned: false, sortOrder: 1 },
      { id: "2", name: "Out of Window", pinned: false, sortOrder: 2 },
    ];

    mockFavoritesStore.tapHistory = [
      // Favorite "1" gets taps within window (current hour)
      ...Array(10)
        .fill(null)
        .map(() => ({
          favoriteId: "1",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
      // Favorite "2" gets taps 3 hours away (out of window)
      ...Array(20)
        .fill(null)
        .map(() => ({
          favoriteId: "2",
          dayOfWeek: currentDay,
          hour: currentHour + 3,
          timestamp: Date.now(),
        })),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0].id).toBe("1"); // Should have higher score
    expect(result.current[1].id).toBe("2");
  });

  it("only counts taps for current day of week", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();
    const differentDay = currentDay === 0 ? 1 : 0;

    mockFavoritesStore.favorites = [
      { id: "1", name: "Today", pinned: false, sortOrder: 1 },
      { id: "2", name: "Different Day", pinned: false, sortOrder: 2 },
    ];

    mockFavoritesStore.tapHistory = [
      // Favorite "1" gets taps today
      ...Array(10)
        .fill(null)
        .map(() => ({
          favoriteId: "1",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
      // Favorite "2" gets taps on different day
      ...Array(20)
        .fill(null)
        .map(() => ({
          favoriteId: "2",
          dayOfWeek: differentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0].id).toBe("1");
  });

  it("pinned always first regardless of score", () => {
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    mockFavoritesStore.favorites = [
      { id: "1", name: "Unpinned High Score", pinned: false, sortOrder: 1 },
      { id: "2", name: "Pinned Low Score", pinned: true, sortOrder: 2 },
    ];

    mockFavoritesStore.tapHistory = [
      // Unpinned gets many taps
      ...Array(30)
        .fill(null)
        .map(() => ({
          favoriteId: "1",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
      // Pinned gets only a few taps
      ...Array(2)
        .fill(null)
        .map(() => ({
          favoriteId: "2",
          dayOfWeek: currentDay,
          hour: currentHour,
          timestamp: Date.now(),
        })),
    ];

    const { result } = renderHook(() => useContextSort());
    expect(result.current[0].id).toBe("2"); // Pinned first despite lower score
  });
});
