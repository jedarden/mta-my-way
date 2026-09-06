/**
 * Tests for the context store.
 *
 * Covers:
 * - Default state and settings
 * - updateContext: detection wiring, transition history and the enabled toggle
 * - Manual override
 * - The favorites tap-history bridge that feeds frequency scoring
 * - Versioned persistence: v1 round-trip, v0 migration path, corrupt payload
 */

import type { ContextSettings, FavoriteTapEvent } from "@mta-my-way/shared";
import { DEFAULT_CONTEXT_STATE } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeTapHistoryBridge, useContextStore } from "./contextStore";

const DEFAULT_SETTINGS: ContextSettings = {
  enabled: true,
  showIndicator: true,
  useLocation: true,
  useTimePatterns: true,
  learnPatterns: true,
};

const STORAGE_KEY = "mta-context";
const BACKUP_KEY = "_mta_backup_context_v0";

/** A complete FavoriteTapEvent fixture (favoriteId, dayOfWeek, hour). */
const makeTap = (favoriteId: string, dayOfWeek: number, hour: number): FavoriteTapEvent => ({
  favoriteId,
  dayOfWeek,
  hour,
});

/** Reset the singleton store to its defaults (the store is shared across tests). */
function resetStore(): void {
  useContextStore.setState({
    currentContext: { ...DEFAULT_CONTEXT_STATE, detectedAt: new Date().toISOString() },
    settings: { ...DEFAULT_SETTINGS },
    transitionHistory: [],
  });
}

/** Seed a persisted payload in the shape zustand persist writes ({ state, version }). */
function seedStorage(state: unknown, version: number): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ state, version }));
}

/** Re-import the store module so it rehydrates from the current localStorage. */
async function importFreshStore() {
  vi.resetModules();
  return import("./contextStore");
}

type UpdateContextParams = Parameters<
  ReturnType<typeof useContextStore.getState>["updateContext"]
>[0];

/** The params updateContext needs for a user sitting on the given screen. */
const screenParams = (overrides: Partial<UpdateContextParams> = {}): UpdateContextParams => ({
  nearStation: false,
  currentScreen: "home",
  screenTime: 0,
  recentActions: [],
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  resetStore();
  delete window.__mta_tap_history;
});

describe("contextStore", () => {
  describe("initial state", () => {
    it("starts idle with context awareness enabled", () => {
      const state = useContextStore.getState();

      expect(state.currentContext.context).toBe("idle");
      expect(state.currentContext.confidence).toBe("low");
      expect(state.currentContext.isManualOverride).toBe(false);
      expect(state.transitionHistory).toEqual([]);
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("updateContext", () => {
    it("detects at_station from a geofence hit and records a location transition", () => {
      useContextStore.getState().updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 42,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      const state = useContextStore.getState();

      expect(state.currentContext.context).toBe("at_station");
      expect(state.currentContext.confidence).toBe("high");
      expect(state.currentContext.factors.location).toEqual({
        nearStation: true,
        stationId: "123",
        distance: 42,
      });
      expect(state.transitionHistory).toEqual([
        {
          from: "idle",
          to: "at_station",
          at: state.currentContext.detectedAt,
          trigger: "location",
        },
      ]);
    });

    it("does not append a transition when the context is unchanged", () => {
      const update = () =>
        useContextStore.getState().updateContext({
          nearStation: true,
          nearStationId: "123",
          distanceToStation: 42,
          currentScreen: "home",
          screenTime: 1,
          recentActions: [],
        });

      update();
      update();

      expect(useContextStore.getState().transitionHistory).toHaveLength(1);
    });

    it("detects reviewing from the journal screen", () => {
      useContextStore
        .getState()
        .updateContext(screenParams({ currentScreen: "journal", screenTime: 30 }));

      const state = useContextStore.getState();

      expect(state.currentContext.context).toBe("reviewing");
      expect(state.currentContext.confidence).toBe("high");
      expect(state.currentContext.factors.activity.currentScreen).toBe("journal");
    });

    it("detects planning from a recent search action", () => {
      useContextStore
        .getState()
        .updateContext(screenParams({ screenTime: 10, recentActions: ["search_station"] }));

      const state = useContextStore.getState();

      expect(state.currentContext.context).toBe("planning");
      expect(state.currentContext.confidence).toBe("medium");
      expect(state.currentContext.factors.activity.recentActions).toEqual(["search_station"]);
    });

    it("stays idle with nothing salient and records no transition", () => {
      useContextStore.getState().updateContext(screenParams());

      const state = useContextStore.getState();

      expect(state.currentContext.context).toBe("idle");
      expect(state.currentContext.confidence).toBe("low");
      expect(state.transitionHistory).toEqual([]);
    });

    it("keeps the transition history capped at 50 entries", () => {
      const { updateContext } = useContextStore.getState();

      for (let i = 0; i < 30; i++) {
        updateContext({
          nearStation: true,
          nearStationId: "123",
          distanceToStation: 10,
          currentScreen: "home",
          screenTime: i,
          recentActions: [],
        });
        updateContext(screenParams({ currentScreen: "journal", screenTime: 30 }));
      }

      const history = useContextStore.getState().transitionHistory;

      expect(history).toHaveLength(50);
      // The oldest entries were dropped, including the very first idle -> at_station.
      expect(history.some((transition) => transition.from === "idle")).toBe(false);
      expect(history[0]).toMatchObject({ from: "reviewing", to: "at_station" });
      expect(history[49]).toMatchObject({ to: "reviewing" });
    });
  });

  describe("enabled toggle", () => {
    it("ignores updates while disabled", () => {
      useContextStore.getState().setSettings({ enabled: false });
      const before = useContextStore.getState().currentContext;

      useContextStore.getState().updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 42,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      expect(useContextStore.getState().currentContext).toBe(before);
      expect(useContextStore.getState().transitionHistory).toEqual([]);
    });

    it("resumes detecting once re-enabled", () => {
      const { setSettings, updateContext } = useContextStore.getState();

      setSettings({ enabled: false });
      updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 42,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });
      expect(useContextStore.getState().currentContext.context).toBe("idle");

      setSettings({ enabled: true });
      updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 42,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      expect(useContextStore.getState().currentContext.context).toBe("at_station");
    });

    it("merges partial settings without dropping the rest", () => {
      useContextStore.getState().setSettings({ showIndicator: false });

      const settings = useContextStore.getState().settings;

      expect(settings.showIndicator).toBe(false);
      expect(settings.enabled).toBe(true);
      expect(settings.useLocation).toBe(true);
      expect(settings.useTimePatterns).toBe(true);
      expect(settings.learnPatterns).toBe(true);
    });
  });

  describe("manual override", () => {
    it("honours a manual override over detection", () => {
      useContextStore.getState().setManualOverride("commuting");
      expect(useContextStore.getState().settings.manualOverride).toBe("commuting");

      // A geofence hit would otherwise resolve to at_station.
      useContextStore.getState().updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 42,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      const state = useContextStore.getState();

      expect(state.currentContext.context).toBe("commuting");
      expect(state.currentContext.isManualOverride).toBe(true);
      expect(state.transitionHistory[0]).toMatchObject({
        from: "idle",
        to: "commuting",
        trigger: "manual",
      });
    });

    it("returns to detection when the override is cleared", () => {
      const { setManualOverride, updateContext } = useContextStore.getState();

      setManualOverride("commuting");
      updateContext({
        nearStation: false,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      setManualOverride(undefined);
      updateContext(screenParams());

      const state = useContextStore.getState();

      expect(state.settings.manualOverride).toBeUndefined();
      expect(state.currentContext.context).toBe("idle");
      expect(state.currentContext.isManualOverride).toBe(false);
    });
  });

  describe("tap history bridge", () => {
    // Each test installs its own fake clock; re-faking over an already fake
    // clock keeps the old time, so restore real timers around every test.
    beforeEach(() => {
      vi.useRealTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("publishes the favorites tap history for detectContext to read", () => {
      const taps = [makeTap("123", 3, 8)];

      initializeTapHistoryBridge(taps);

      expect(window.__mta_tap_history).toBe(taps);
    });

    it("scores a station as frequent and upgrades to commuting during commute hours", () => {
      // Wednesday 08:05 local — morning rush.
      vi.useFakeTimers({ now: new Date(2026, 8, 2, 8, 5, 0) });
      initializeTapHistoryBridge(Array.from({ length: 12 }, () => makeTap("123", 3, 8)));

      useContextStore.getState().updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 50,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      const { context, factors } = useContextStore.getState().currentContext;

      expect(factors.patterns.tapFrequency).toBe(1);
      expect(factors.patterns.frequentStations).toEqual(["123"]);
      expect(factors.patterns.hasPatterns).toBe(true);
      expect(context).toBe("commuting");
    });

    it("stays at_station when the tap history is for a different time of day", () => {
      // Same commute hour, but the taps happened in the evening.
      vi.useFakeTimers({ now: new Date(2026, 8, 2, 8, 5, 0) });
      initializeTapHistoryBridge(Array.from({ length: 12 }, () => makeTap("123", 3, 20)));

      useContextStore.getState().updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 50,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      const { context, factors } = useContextStore.getState().currentContext;

      expect(factors.patterns.tapFrequency).toBe(0);
      expect(context).toBe("at_station");
    });

    it("stays at_station outside commute hours even with a frequent station", () => {
      // Wednesday 13:05 local — midday, outside both rush windows.
      vi.useFakeTimers({ now: new Date(2026, 8, 2, 13, 5, 0) });
      initializeTapHistoryBridge(Array.from({ length: 12 }, () => makeTap("123", 3, 13)));

      useContextStore.getState().updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 50,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      const { context, factors } = useContextStore.getState().currentContext;

      expect(factors.patterns.tapFrequency).toBe(1);
      expect(factors.time.isCommuteHours).toBe(false);
      expect(context).toBe("at_station");
    });
  });

  describe("clearTransitionHistory", () => {
    it("empties the transition history", () => {
      useContextStore.getState().updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 42,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });
      expect(useContextStore.getState().transitionHistory).toHaveLength(1);

      useContextStore.getState().clearTransitionHistory();

      expect(useContextStore.getState().transitionHistory).toEqual([]);
    });
  });

  describe("persistence", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("writes a versioned payload without the action functions", async () => {
      const { useContextStore: fresh } = await importFreshStore();

      fresh.getState().setSettings({ showIndicator: false });

      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();

      const parsed = JSON.parse(raw as string) as {
        version: number;
        state: Record<string, unknown>;
      };

      expect(parsed.version).toBe(1);
      expect(parsed.state.settings).toMatchObject({ showIndicator: false });
      expect(parsed.state.transitionHistory).toEqual([]);
      expect(Object.keys(parsed.state).sort()).toEqual([
        "currentContext",
        "settings",
        "transitionHistory",
      ]);
    });

    it("rehydrates a v1 payload as-is", async () => {
      seedStorage(
        {
          currentContext: {
            ...DEFAULT_CONTEXT_STATE,
            context: "at_station",
            confidence: "high",
          },
          settings: { ...DEFAULT_SETTINGS, enabled: false, showIndicator: false },
          transitionHistory: [
            { from: "idle", to: "at_station", at: "2026-09-01T08:00:00.000Z", trigger: "location" },
          ],
        },
        1
      );

      const { useContextStore: fresh } = await importFreshStore();
      const state = fresh.getState();

      expect(state.settings.enabled).toBe(false);
      expect(state.settings.showIndicator).toBe(false);
      expect(state.currentContext.context).toBe("at_station");
      expect(state.transitionHistory).toHaveLength(1);
      // The actions survive rehydration.
      expect(typeof state.updateContext).toBe("function");
      // No version gap, so no migration backup was written.
      expect(localStorage.getItem(BACKUP_KEY)).toBeNull();
    });

    it("keeps detecting after rehydration", async () => {
      seedStorage(
        {
          currentContext: DEFAULT_CONTEXT_STATE,
          settings: { ...DEFAULT_SETTINGS, enabled: true },
          transitionHistory: [],
        },
        1
      );

      const { useContextStore: fresh } = await importFreshStore();

      fresh.getState().updateContext({
        nearStation: true,
        nearStationId: "123",
        distanceToStation: 42,
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      expect(fresh.getState().currentContext.context).toBe("at_station");
    });

    it("backs up and migrates a v0 payload", async () => {
      seedStorage({ settings: { ...DEFAULT_SETTINGS, enabled: false, showIndicator: false } }, 0);

      const { useContextStore: fresh } = await importFreshStore();
      const state = fresh.getState();

      // The persisted settings survived the version bump.
      expect(state.settings.enabled).toBe(false);
      expect(state.settings.showIndicator).toBe(false);
      // Fields the old version did not carry fall back to the defaults.
      expect(state.currentContext.context).toBe("idle");
      expect(state.transitionHistory).toEqual([]);

      const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) as string) as {
        settings?: ContextSettings;
      };
      expect(backup.settings?.enabled).toBe(false);
    });

    it("keeps the defaults when the stored payload is corrupt", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      localStorage.setItem(STORAGE_KEY, "not-json{{{");

      const { useContextStore: fresh } = await importFreshStore();
      const { hasMigrationFailed } = await import("./migration");

      expect(fresh.getState().settings).toEqual(DEFAULT_SETTINGS);
      expect(fresh.getState().currentContext.context).toBe("idle");
      expect(hasMigrationFailed()).toBe(true);

      consoleError.mockRestore();
    });
  });
});
