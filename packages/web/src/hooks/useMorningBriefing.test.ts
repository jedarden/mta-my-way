/**
 * Tests for useMorningBriefing hook
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useMorningBriefing } from "./useMorningBriefing";

// Mock the favorites store
vi.mock("../stores/favoritesStore", () => ({
  useFavoritesStore: vi.fn(),
}));

const mockedUseFavoritesStore = vi.mocked(useFavoritesStore);

describe("useMorningBriefing", () => {
  const mockFavorites = [
    {
      id: "fav1",
      label: "Work",
      stationId: "725",
      stationName: "Times Square",
      lines: ["1", "2", "3"],
      pinned: true,
      sortOrder: 1,
    },
    {
      id: "fav2",
      label: "Home",
      stationId: "101",
      stationName: "South Ferry",
      lines: ["1"],
      pinned: false,
      sortOrder: 2,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T07:30:00Z")); // Friday 7:30 AM

    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: mockFavorites,
        tapHistory: [],
      };
      return selector ? selector(state) : state;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when insufficient tap history", () => {
    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: mockFavorites,
        tapHistory: [], // Empty tap history
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current).toBeNull();
  });

  it("returns null when no favorites exist", () => {
    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: [],
        tapHistory: Array(30).fill(null),
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current).toBeNull();
  });

  it("returns null when no morning taps recorded", () => {
    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: mockFavorites,
        tapHistory: Array(30)
          .fill(null)
          .map(() => ({
            favoriteId: "fav1",
            dayOfWeek: 1,
            hour: 14, // 2 PM - not morning
            timestamp: Date.now(),
          })),
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current).toBeNull();
  });

  it("returns briefing with morning favorites", () => {
    // Set time to 7:30 AM local time (within morning window)
    const morningDate = new Date();
    morningDate.setHours(7, 30, 0, 0);
    vi.setSystemTime(morningDate);

    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: mockFavorites,
        tapHistory: [
          // fav1: 15 morning taps
          ...Array(15)
            .fill(null)
            .map(() => ({
              favoriteId: "fav1",
              dayOfWeek: 1, // Monday
              hour: 8, // 8 AM
              timestamp: Date.now(),
            })),
          // fav2: 10 morning taps
          ...Array(10)
            .fill(null)
            .map(() => ({
              favoriteId: "fav2",
              dayOfWeek: 2, // Tuesday
              hour: 7, // 7 AM
              timestamp: Date.now(),
            })),
          // 5 non-morning taps (shouldn't affect morning score)
          ...Array(5)
            .fill(null)
            .map(() => ({
              favoriteId: "fav1",
              dayOfWeek: 3,
              hour: 14, // 2 PM
              timestamp: Date.now(),
            })),
        ],
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current).not.toBeNull();
    expect(result.current?.isMorning).toBe(true);
    expect(result.current?.entries).toHaveLength(2);
    expect(result.current?.entries[0].favorite.id).toBe("fav1"); // Higher score
    expect(result.current?.entries[1].favorite.id).toBe("fav2");
  });

  it("only counts weekday taps for morning score", () => {
    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: mockFavorites,
        tapHistory: [
          // Weekend taps (should not count)
          ...Array(20)
            .fill(null)
            .map(() => ({
              favoriteId: "fav1",
              dayOfWeek: 0, // Sunday
              hour: 8, // 8 AM
              timestamp: Date.now(),
            })),
          // Weekday taps (should count)
          ...Array(5)
            .fill(null)
            .map(() => ({
              favoriteId: "fav2",
              dayOfWeek: 1, // Monday
              hour: 8,
              timestamp: Date.now(),
            })),
        ],
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current).not.toBeNull();
    expect(result.current?.entries[0].favorite.id).toBe("fav2"); // fav2 has weekday taps
    expect(result.current?.entries).toHaveLength(1);
  });

  it("limits to top 3 favorites", () => {
    const manyFavorites = [
      ...mockFavorites,
      {
        id: "fav3",
        label: "Gym",
        stationId: "201",
        stationName: "Canal St",
        lines: ["1"],
        pinned: false,
        sortOrder: 3,
      },
      {
        id: "fav4",
        label: "Store",
        stationId: "202",
        stationName: "Houston St",
        lines: ["1"],
        pinned: false,
        sortOrder: 4,
      },
    ];

    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: manyFavorites,
        tapHistory: [
          // Give fav1: 10 taps, fav2: 8 taps, fav3: 6 taps, fav4: 4 taps
          // All should have score > 0, but only top 3 should be returned
          ...Array(10)
            .fill(null)
            .map(() => ({ favoriteId: "fav1", dayOfWeek: 1, hour: 8, timestamp: Date.now() })),
          ...Array(8)
            .fill(null)
            .map(() => ({ favoriteId: "fav2", dayOfWeek: 1, hour: 8, timestamp: Date.now() })),
          ...Array(6)
            .fill(null)
            .map(() => ({ favoriteId: "fav3", dayOfWeek: 1, hour: 8, timestamp: Date.now() })),
          ...Array(4)
            .fill(null)
            .map(() => ({ favoriteId: "fav4", dayOfWeek: 1, hour: 8, timestamp: Date.now() })),
        ],
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    // Should have exactly 3 entries (top 3 by score)
    expect(result.current?.entries).toHaveLength(3);
    // fav1 should be first (highest score: 10)
    expect(result.current?.entries[0].favorite.id).toBe("fav1");
    // fav4 should NOT be in the list (lowest score: 4)
    expect(result.current?.entries.every((e) => e.favorite.id !== "fav4")).toBe(true);
  });

  it("generates briefing text with station names and lines", () => {
    // Set local time to morning (7:30 AM) - create date in local timezone
    const morningDate = new Date();
    morningDate.setHours(7, 30, 0, 0);
    vi.setSystemTime(morningDate);

    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: mockFavorites,
        tapHistory: [
          ...Array(15)
            .fill(null)
            .map(() => ({
              favoriteId: "fav1",
              dayOfWeek: 1,
              hour: 8,
              timestamp: Date.now(),
            })),
          ...Array(10)
            .fill(null)
            .map(() => ({
              favoriteId: "fav2",
              dayOfWeek: 1,
              hour: 8,
              timestamp: Date.now(),
            })),
        ],
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current?.text).toContain("Good morning");
    expect(result.current?.text).toContain("Work");
    expect(result.current?.text).toContain("(1)");
  });

  it("indicates isMorning correctly based on current time", () => {
    // Test during morning hours (7 AM local time)
    // Create a date that will be 7 AM in the local timezone
    const morningDate = new Date();
    morningDate.setHours(7, 0, 0, 0);
    vi.setSystemTime(morningDate);

    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: mockFavorites,
        tapHistory: Array(30)
          .fill(null)
          .map(() => ({
            favoriteId: "fav1",
            dayOfWeek: 1,
            hour: 8,
            timestamp: Date.now(),
          })),
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current?.isMorning).toBe(true);
  });

  it("indicates not morning when outside morning window", () => {
    // Test at 11 AM (outside 6-10 AM window)
    const lateMorningDate = new Date();
    lateMorningDate.setHours(11, 0, 0, 0);
    vi.setSystemTime(lateMorningDate);

    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: mockFavorites,
        tapHistory: Array(30)
          .fill(null)
          .map(() => ({
            favoriteId: "fav1",
            dayOfWeek: 1,
            hour: 8,
            timestamp: Date.now(),
          })),
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current?.isMorning).toBe(false);
  });

  it("uses stationName when label is not available", () => {
    const noLabelFavorites = [
      {
        id: "fav1",
        label: null,
        stationId: "725",
        stationName: "Times Square",
        lines: ["1"],
        pinned: true,
        sortOrder: 1,
      },
    ];

    mockedUseFavoritesStore.mockImplementation((selector) => {
      const state = {
        favorites: noLabelFavorites,
        tapHistory: Array(30)
          .fill(null)
          .map(() => ({
            favoriteId: "fav1",
            dayOfWeek: 1,
            hour: 8,
            timestamp: Date.now(),
          })),
      };
      return selector ? selector(state) : state;
    });

    const { result } = renderHook(() => useMorningBriefing());

    expect(result.current?.text).toContain("Times Square");
  });
});
