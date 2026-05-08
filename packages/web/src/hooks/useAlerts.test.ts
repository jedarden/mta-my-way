/**
 * Tests for useAlerts hook
 *
 * Tests the alerts data fetching hook including:
 * - Alert fetching and sorting
 * - Filtering by user's lines
 * - Severity filtering
 * - Badge count calculation
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAlerts, useAlertsForStation } from "./useAlerts";

// Mock apiEnhanced
const mockGetAlerts = vi.fn();
vi.mock("../lib/apiEnhanced", () => ({
  EnhancedApiError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "EnhancedApiError";
    }
  },
  apiEnhanced: {
    getAlerts: (...args: unknown[]) => mockGetAlerts(...args),
  },
}));

// Mock favoritesStore with Zustand selector pattern
const mockFavorites = [
  { id: "fav1", stationId: "101", lines: ["1", "2"], direction: "both" as const },
  { id: "fav2", stationId: "102", lines: ["A"], direction: "both" as const },
];
const mockCommutes = [
  {
    id: "commute1",
    name: "Work",
    originId: "101",
    destinationId: "726",
    preferredLines: ["1", "2", "3"],
  },
];

const mockFavoritesState = (overrides = {}) => ({
  favorites: mockFavorites,
  commutes: mockCommutes,
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
  ...overrides,
});

vi.mock("../stores/favoritesStore", () => ({
  useFavoritesStore: vi.fn((selector) => {
    const state = mockFavoritesState();
    return selector ? selector(state) : state;
  }),
}));

// Mock settingsStore with Zustand selector pattern
let mockAlertSeverityFilter: "all" | "delays" | "major" = "all";

// Create a fresh state object each time - reads from current mockAlertSeverityFilter
const createMockSettingsState = (overrides = {}) => ({
  theme: "system" as const,
  showUnassignedTrips: false,
  refreshInterval: 30,
  alertSeverityFilter: mockAlertSeverityFilter,
  hapticFeedback: false,
  accessibleMode: false,
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
  setTheme: vi.fn(),
  setShowUnassignedTrips: vi.fn(),
  setRefreshInterval: vi.fn(),
  setAlertSeverityFilter: vi.fn(),
  setHapticFeedback: vi.fn(),
  setAccessibleMode: vi.fn(),
  setQuietHours: vi.fn(),
  ...overrides,
});

// Import the actual module to allow re-assigning the mock
import { useSettingsStore as actualUseSettingsStore } from "../stores/settingsStore";

// Create a dynamic selector handler that properly applies the selector
const mockUseSettingsStore = vi.fn((selector) => {
  // Always create fresh state to capture current mockAlertSeverityFilter
  const state = createMockSettingsState();
  // Properly apply selector if provided
  return selector ? selector(state) : state;
});

vi.mock("../stores/settingsStore", () => ({
  useSettingsStore: (...args: unknown[]) => mockUseSettingsStore(...args),
}));

// Export reference to mock for tests to use
export { mockUseSettingsStore };

// Export helper to update filter in tests
export function setMockAlertSeverityFilter(value: "all" | "delays" | "major") {
  mockAlertSeverityFilter = value;
}

describe("useAlerts", () => {
  let originalMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockAlertSeverityFilter = "all";

    // Reset favoritesStore mock to default values
    const { useFavoritesStore } = await import("../stores/favoritesStore");
    originalMock = vi.mocked(useFavoritesStore);
    originalMock.mockImplementation((selector) => {
      const state = mockFavoritesState();
      return selector ? selector(state) : state;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockAlerts = [
    {
      id: "alert1",
      severity: "severe" as const,
      source: "official" as const,
      headline: "Major Delay",
      description: "Significant delays",
      affectedLines: ["1", "2", "3"],
      activePeriod: { start: Date.now() / 1000 - 3600 },
      cause: "signal",
      effect: "delay",
    },
    {
      id: "alert2",
      severity: "warning" as const,
      source: "official" as const,
      headline: "Minor Delay",
      description: "Minor delays",
      affectedLines: ["A"],
      activePeriod: { start: Date.now() / 1000 - 7200 },
      cause: "maintenance",
      effect: "delay",
    },
    {
      id: "alert3",
      severity: "info" as const,
      source: "official" as const,
      headline: "Planned Work",
      description: "Planned work",
      affectedLines: ["B", "C"],
      activePeriod: { start: Date.now() / 1000 - 1000 },
      cause: "construction",
      effect: "modified_service",
    },
  ];

  it("fetches alerts on mount", async () => {
    mockGetAlerts.mockResolvedValueOnce({
      alerts: mockAlerts,
      meta: {
        count: 3,
        lastUpdatedAt: new Date().toISOString(),
        matchRate: 1,
      },
    });

    const { result } = renderHook(() => useAlerts());

    expect(result.current.status).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("success");
    expect(mockGetAlerts).toHaveBeenCalled();
    // Default filter mode is "mine", so only alerts for user's lines (1, 2, 3, A)
    // alert1 affects 1, 2, 3 - included
    // alert2 affects A - included
    // alert3 affects B, C - NOT included
    expect(result.current.alerts).toHaveLength(2);
    expect(result.current.myAlerts).toHaveLength(2);
  });

  it("sorts alerts by severity (severe first)", async () => {
    mockGetAlerts.mockResolvedValueOnce({
      alerts: mockAlerts,
      meta: { count: 3, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Default filter mode is "mine" - only alerts for user's lines
    // Severe (alert1) should be first, then warning (alert2)
    expect(result.current.alerts).toHaveLength(2);
    expect(result.current.alerts[0].severity).toBe("severe");
    expect(result.current.alerts[1].severity).toBe("warning");
  });

  it("filters alerts to user's favorite lines", async () => {
    mockGetAlerts.mockResolvedValueOnce({
      alerts: mockAlerts,
      meta: { count: 3, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // User's lines: 1, 2, 3, A (from favorites and commutes)
    // alert1 affects 1, 2, 3 - should match
    // alert2 affects A - should match
    // alert3 affects B, C - should not match
    expect(result.current.myAlerts).toHaveLength(2);
    expect(result.current.myAlertsCount).toBe(2);
    expect(
      result.current.myAlerts.every((a) =>
        a.affectedLines.some((l) => ["1", "2", "3", "A"].includes(l))
      )
    ).toBe(true);
  });

  it("handles empty favorites", async () => {
    const { useFavoritesStore } = await import("../stores/favoritesStore");
    vi.mocked(useFavoritesStore).mockImplementation((selector) => {
      const state = mockFavoritesState({ favorites: [], commutes: [] });
      return selector ? selector(state) : state;
    });

    mockGetAlerts.mockResolvedValueOnce({
      alerts: mockAlerts,
      meta: { count: 3, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // No user lines means no "my alerts"
    expect(result.current.myAlerts).toHaveLength(0);
    expect(result.current.myAlertsCount).toBe(0);
  });

  it("filters by severity when setting is 'major'", async () => {
    // Set the filter BEFORE rendering the hook
    mockAlertSeverityFilter = "major";

    mockGetAlerts.mockResolvedValue({
      alerts: mockAlerts,
      meta: { count: 3, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Debug: check what we got
    console.log("DEBUG: result.current.alerts:", result.current.alerts);
    console.log("DEBUG: result.current.myAlerts:", result.current.myAlerts);
    console.log("DEBUG: result.current.filterMode:", result.current.filterMode);

    // Only severe alerts when filter is "major" AND "mine" filter applies
    // alert1 is severe and affects user's lines (1, 2, 3)
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].severity).toBe("severe");
  });

  it("filters by severity when setting is 'delays'", async () => {
    // Set the filter BEFORE rendering the hook
    mockAlertSeverityFilter = "delays";

    mockGetAlerts.mockResolvedValue({
      alerts: mockAlerts,
      meta: { count: 3, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Severe and warning, but not info - AND "mine" filter applies
    // alert1 (severe) affects user's lines, alert2 (warning) affects A
    expect(result.current.alerts).toHaveLength(2);
    expect(result.current.alerts.every((a) => ["severe", "warning"].includes(a.severity))).toBe(
      true
    );
  });

  it("toggles filter mode between mine and all", async () => {
    mockGetAlerts.mockResolvedValue({
      alerts: mockAlerts,
      meta: { count: 3, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Default is "mine"
    expect(result.current.filterMode).toBe("mine");
    expect(result.current.alerts).toEqual(result.current.myAlerts);

    // Switch to "all" - wrap in act for state update
    await act(async () => {
      result.current.setFilterMode("all");
    });

    expect(result.current.filterMode).toBe("all");
    // When filter is "all", shows all alerts (severity filter is "all" by default)
    expect(result.current.alerts).toHaveLength(3); // All alerts

    // Switch back to "mine"
    await act(async () => {
      result.current.setFilterMode("mine");
    });

    expect(result.current.filterMode).toBe("mine");
    expect(result.current.alerts).toHaveLength(2); // Only my alerts
  });

  it("refreshes alerts manually", async () => {
    mockGetAlerts.mockResolvedValue({
      alerts: mockAlerts,
      meta: { count: 3, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetAlerts).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetAlerts).toHaveBeenCalledTimes(2);
  });

  it("auto-refreshes every 60 seconds", async () => {
    mockGetAlerts.mockResolvedValue({
      alerts: mockAlerts,
      meta: { count: 3, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("success");
    expect(mockGetAlerts).toHaveBeenCalledTimes(1);

    // Fast-forward 60 seconds
    await act(async () => {
      vi.advanceTimersByTime(60000);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetAlerts).toHaveBeenCalledTimes(2);
  });

  it("handles fetch errors", async () => {
    mockGetAlerts.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("Network error");
  });

  it("includes metadata in response", async () => {
    const mockMeta = {
      count: 5,
      lastUpdatedAt: "2024-01-01T00:00:00Z",
      matchRate: 0.95,
    };

    mockGetAlerts.mockResolvedValueOnce({
      alerts: mockAlerts,
      meta: mockMeta,
    });

    const { result } = renderHook(() => useAlerts());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.meta).toEqual(mockMeta);
  });
});

describe("useAlertsForStation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockAlerts = [
    {
      id: "alert1",
      severity: "severe" as const,
      source: "official" as const,
      headline: "1 Line Delay",
      description: "Delays on 1 line",
      affectedLines: ["1"],
      activePeriod: { start: Date.now() / 1000 },
      cause: "signal",
      effect: "delay",
    },
    {
      id: "alert2",
      severity: "warning" as const,
      source: "official" as const,
      headline: "A Line Delay",
      description: "Delays on A line",
      affectedLines: ["A"],
      activePeriod: { start: Date.now() / 1000 },
      cause: "maintenance",
      effect: "delay",
    },
  ];

  it("fetches all alerts and filters to station lines", async () => {
    mockGetAlerts.mockResolvedValueOnce({
      alerts: mockAlerts,
      meta: { count: 2, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlertsForStation("101", ["1", "2"]));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Should only include alerts affecting lines 1 or 2
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.alerts[0].affectedLines).toContain("1");
  });

  it("returns empty array when station has no lines", async () => {
    mockGetAlerts.mockResolvedValueOnce({
      alerts: mockAlerts,
      meta: { count: 2, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlertsForStation("101", []));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.alerts).toHaveLength(0);
  });

  it("returns idle status when stationId is null", () => {
    const { result } = renderHook(() => useAlertsForStation(null, ["1"]));

    expect(result.current.status).toBe("idle");
    expect(result.current.alerts).toHaveLength(0);
  });

  it("refreshes alerts manually", async () => {
    mockGetAlerts.mockResolvedValue({
      alerts: mockAlerts,
      meta: { count: 2, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlertsForStation("101", ["1"]));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetAlerts).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.refresh();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetAlerts).toHaveBeenCalledTimes(2);
  });

  it("auto-refreshes every 60 seconds", async () => {
    mockGetAlerts.mockResolvedValue({
      alerts: mockAlerts,
      meta: { count: 2, lastUpdatedAt: null, matchRate: 1 },
    });

    const { result } = renderHook(() => useAlertsForStation("101", ["1"]));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetAlerts).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(60000);
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockGetAlerts).toHaveBeenCalledTimes(2);
  });
});
