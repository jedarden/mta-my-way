/**
 * Tests for the useContextAware hook.
 *
 * Covers:
 * - The returned shape (context, confidence, label, UI hints, settings)
 * - Context detection from the geofence, the route and recorded actions
 * - The 30 second re-detection interval and its cleanup
 * - The mta:context-changed window event on significant transitions
 * - The enabled toggle and the manual override
 * - The favorites tap-history bridge that feeds frequency scoring
 */

import type { FavoriteTapEvent } from "@mta-my-way/shared";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContextStore } from "../stores/contextStore";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useContextAware, useRecordAction } from "./useContextAware";

// Mutable inputs backing the two modules mocked below. vi.hoisted keeps them
// available to the hoisted vi.mock factories.
const mocks = vi.hoisted(() => ({
  pathname: "/home",
  geofenceEvent: null as { stationId: string; stationName: string; distanceM: number } | null,
  useGeofence: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mocks.pathname, search: "", hash: "", key: "test", state: null }),
}));

vi.mock("./useGeofence", () => ({
  useGeofence: mocks.useGeofence,
}));

const DEFAULT_SETTINGS = {
  enabled: true,
  showIndicator: true,
  useLocation: true,
  useTimePatterns: true,
  learnPatterns: true,
};

/** A geofence hit for a station whose tap history the fixtures below create. */
const geofenceHit = () => ({
  stationId: "123",
  stationName: "Times Sq-42 St",
  distanceM: 45,
});

const makeTap = (favoriteId: string, dayOfWeek: number, hour: number): FavoriteTapEvent => ({
  favoriteId,
  dayOfWeek,
  hour,
});

const contextChangedListeners: EventListener[] = [];

function onContextChanged(listener: EventListener): void {
  contextChangedListeners.push(listener);
  window.addEventListener("mta:context-changed", listener);
}

/** Renders the hook, plus useRecordAction when the test wants the recorder. */
function renderContextAware() {
  return renderHook(() => useContextAware());
}

beforeEach(() => {
  mocks.pathname = "/home";
  mocks.geofenceEvent = null;
  mocks.useGeofence.mockReset();
  mocks.useGeofence.mockImplementation(() => ({
    isWatching: mocks.geofenceEvent !== null,
    lastEvent: mocks.geofenceEvent,
    gpsFailureCount: 0,
  }));

  useContextStore.setState({
    currentContext: {
      context: "idle",
      confidence: "low",
      factors: {
        location: { nearStation: false },
        time: { timeBucket: "midday", dayCategory: "weekday", isCommuteHours: false },
        patterns: { frequentStations: [], tapFrequency: 0, hasPatterns: false },
        activity: { currentScreen: "home", screenTime: 0, recentActions: [] },
      },
      detectedAt: new Date().toISOString(),
      isManualOverride: false,
    },
    settings: { ...DEFAULT_SETTINGS },
    transitionHistory: [],
  });

  useFavoritesStore.setState({ tapHistory: [] });
  delete window.__mta_tap_history;
  delete window.__mta_record_action;
  localStorage.clear();
});

afterEach(() => {
  for (const listener of contextChangedListeners.splice(0)) {
    window.removeEventListener("mta:context-changed", listener);
  }
  delete window.__mta_tap_history;
  delete window.__mta_record_action;
  vi.useRealTimers();
});

describe("useContextAware", () => {
  it("reports the idle context with context awareness enabled", () => {
    const { result } = renderContextAware();

    expect(result.current.context).toBe("idle");
    expect(result.current.confidence).toBe("low");
    expect(result.current.contextLabel).toBe("");
    expect(result.current.enabled).toBe(true);
    expect(result.current.showIndicator).toBe(true);
    expect(result.current.manualOverride).toBeUndefined();
    expect(result.current.uiHints).toMatchObject({
      preferredScreen: "home",
      showTripHistory: false,
      refreshPriority: 3,
      themeVariant: "normal",
    });
  });

  it("watches the geofence at the 200m radius", () => {
    renderContextAware();

    expect(mocks.useGeofence).toHaveBeenCalledWith({ enabled: true, radius: 200 });
  });

  describe("context detection", () => {
    it("detects at_station from a geofence hit", () => {
      mocks.geofenceEvent = geofenceHit();

      const { result } = renderContextAware();

      expect(result.current.context).toBe("at_station");
      expect(result.current.confidence).toBe("high");
      expect(result.current.contextLabel).toBe("At Station");
      // Near real-time refresh priority while at a station.
      expect(result.current.uiHints.refreshPriority).toBe(9);
      expect(useContextStore.getState().currentContext.factors.location).toEqual({
        nearStation: true,
        stationId: "123",
        distance: 45,
      });
    });

    it("detects reviewing from the journal route", () => {
      mocks.pathname = "/journal";

      const { result } = renderContextAware();

      expect(result.current.context).toBe("reviewing");
      // screenTime is ~0 on the first pass, so confidence is only medium.
      expect(result.current.confidence).toBe("medium");
      expect(result.current.contextLabel).toBe("Reviewing");
      expect(result.current.uiHints.showTripHistory).toBe(true);
    });

    it("derives the screen name from the route", () => {
      mocks.pathname = "/station/123";

      renderContextAware();

      expect(useContextStore.getState().currentContext.factors.activity.currentScreen).toBe(
        "station"
      );
    });

    it("re-detects when the route changes", () => {
      const { result, rerender } = renderContextAware();
      expect(result.current.context).toBe("idle");

      mocks.pathname = "/journal";
      rerender();

      expect(result.current.context).toBe("reviewing");
    });

    it("re-detects on the 30 second interval, picking up recorded actions", () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => {
        useContextAware();
        return useRecordAction();
      });
      expect(typeof window.__mta_record_action).toBe("function");

      act(() => result.current("search_station"));
      expect(useContextStore.getState().currentContext.context).toBe("idle");

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      const { currentContext } = useContextStore.getState();

      expect(currentContext.factors.activity.recentActions).toContain("search_station");
      expect(currentContext.context).toBe("planning");
    });

    it("clears the re-detection interval on unmount", () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      const { unmount } = renderContextAware();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("mta:context-changed", () => {
    it("fires on a significant transition", () => {
      const listener = vi.fn();
      onContextChanged(listener);
      mocks.geofenceEvent = geofenceHit();

      renderContextAware();

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0]?.[0] as CustomEvent<{
        from: string;
        to: string;
      }>;
      expect(event.detail).toEqual({ from: "idle", to: "at_station" });
    });

    it("does not fire on a minor transition", () => {
      const listener = vi.fn();
      onContextChanged(listener);
      mocks.pathname = "/journal";

      renderContextAware();

      expect(useContextStore.getState().currentContext.context).toBe("reviewing");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("enabled toggle", () => {
    it("stops detecting while disabled", () => {
      const { result, rerender } = renderContextAware();

      act(() => result.current.setSettings({ enabled: false }));

      expect(result.current.enabled).toBe(false);
      // The geofence is released along with detection.
      expect(mocks.useGeofence).toHaveBeenLastCalledWith({ enabled: false, radius: 200 });

      mocks.geofenceEvent = geofenceHit();
      rerender();

      expect(useContextStore.getState().currentContext.context).toBe("idle");
      expect(useContextStore.getState().transitionHistory).toEqual([]);
    });

    it("resumes detecting when re-enabled", () => {
      const { result } = renderContextAware();

      act(() => result.current.setSettings({ enabled: false }));
      mocks.geofenceEvent = geofenceHit();
      act(() => result.current.setSettings({ enabled: true }));

      expect(result.current.enabled).toBe(true);
      expect(useContextStore.getState().currentContext.context).toBe("at_station");
    });

    it("toggles the indicator without touching the rest of the settings", () => {
      const { result } = renderContextAware();

      act(() => result.current.setSettings({ showIndicator: false }));

      expect(result.current.showIndicator).toBe(false);
      expect(result.current.enabled).toBe(true);
    });
  });

  describe("manual override", () => {
    it("applies the override on the next detection pass", () => {
      const { result, rerender } = renderContextAware();

      act(() => result.current.setManualOverride("commuting"));
      expect(result.current.manualOverride).toBe("commuting");
      // The override is read on the next pass, so nudge the route.
      mocks.pathname = "/commute";
      rerender();

      expect(result.current.context).toBe("commuting");
      expect(useContextStore.getState().currentContext.isManualOverride).toBe(true);
    });

    it("wins over a geofence hit", () => {
      mocks.geofenceEvent = geofenceHit();
      const { result, rerender } = renderContextAware();
      expect(result.current.context).toBe("at_station");

      act(() => result.current.setManualOverride("reviewing"));
      // Nudge the route so detection re-runs while the geofence still reports
      // a station — the override has to win over it.
      mocks.pathname = "/station/123";
      rerender();

      expect(result.current.context).toBe("reviewing");
      expect(useContextStore.getState().currentContext.isManualOverride).toBe(true);
    });

    it("returns to detection when cleared", () => {
      const { result, rerender } = renderContextAware();

      act(() => result.current.setManualOverride("reviewing"));
      mocks.pathname = "/journal";
      rerender();
      expect(result.current.context).toBe("reviewing");

      act(() => result.current.setManualOverride(undefined));
      mocks.pathname = "/home";
      rerender();

      expect(result.current.manualOverride).toBeUndefined();
      expect(result.current.context).toBe("idle");
      expect(useContextStore.getState().currentContext.isManualOverride).toBe(false);
    });
  });

  describe("tap history bridge", () => {
    it("bridges the favorites tap history into the detection signal", () => {
      const taps = [makeTap("123", 3, 8)];
      useFavoritesStore.setState({ tapHistory: taps });

      renderContextAware();

      expect(window.__mta_tap_history).toEqual(taps);
    });

    it("upgrades at_station to commuting during commute hours for a frequent station", () => {
      // Wednesday 08:05 local — morning rush.
      vi.useFakeTimers({ now: new Date(2026, 8, 2, 8, 5, 0) });
      useFavoritesStore.setState({
        tapHistory: Array.from({ length: 12 }, () => makeTap("123", 3, 8)),
      });
      mocks.geofenceEvent = geofenceHit();

      const { result } = renderContextAware();

      expect(result.current.context).toBe("commuting");
      expect(useContextStore.getState().currentContext.factors.patterns).toMatchObject({
        tapFrequency: 1,
        frequentStations: ["123"],
        hasPatterns: true,
      });
    });

    it("stays at_station when the tap history is for another time of day", () => {
      // Same morning rush, but this station's taps all happened in the evening.
      vi.useFakeTimers({ now: new Date(2026, 8, 2, 8, 5, 0) });
      useFavoritesStore.setState({
        tapHistory: Array.from({ length: 12 }, () => makeTap("123", 3, 20)),
      });
      mocks.geofenceEvent = geofenceHit();

      const { result } = renderContextAware();

      expect(result.current.context).toBe("at_station");
      expect(useContextStore.getState().currentContext.factors.patterns.tapFrequency).toBe(0);
    });

    it("rebridges whenever the favorites tap history changes", () => {
      const { rerender } = renderContextAware();
      expect(window.__mta_tap_history).toEqual([]);

      const taps = [makeTap("456", 4, 18)];
      act(() => useFavoritesStore.setState({ tapHistory: taps }));

      rerender();

      expect(window.__mta_tap_history).toEqual(taps);
    });
  });
});

describe("useRecordAction", () => {
  it("returns a stable recorder", () => {
    const { result, rerender } = renderHook(() => useRecordAction());

    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });

  it("no-ops when no hook has installed the window bridge", () => {
    const { result } = renderHook(() => useRecordAction());

    expect(() => result.current("search_station")).not.toThrow();
    expect(useContextStore.getState().currentContext.factors.activity.recentActions).toEqual([]);
  });
});
