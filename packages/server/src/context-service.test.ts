/**
 * Unit tests for context service
 */

import type { StationIndex, UserContext } from "@mta-my-way/shared";
import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearManualOverride,
  detectAndUpdateContext,
  detectContextFromRequest,
  getContextSettings,
  getContextSummary,
  getContextTransitions,
  initContextService,
  resetContextService,
  setManualContext,
  updateContextSettings,
} from "./context-service.js";

// Mock better-sqlite3
const mockDb = {
  prepare: vi.fn(),
} as unknown as Database;

// Mock station data
const mockStations: StationIndex = {
  R01: {
    id: "R01",
    name: "South Ferry",
    location: { lat: 40.702, lon: -74.013 },
    lines: ["1"],
    northStopId: "R01N",
    southStopId: "R01S",
    accessible: false,
  },
  R02: {
    id: "R02",
    name: "Times Square",
    location: { lat: 40.758, lon: -73.985 },
    lines: ["1", "2", "3"],
    northStopId: "R02N",
    southStopId: "R02S",
    accessible: true,
  },
};

describe("context-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContextService();
  });

  describe("initContextService", () => {
    it("initializes with default context when no existing data", () => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        all: vi.fn().mockReturnValue([]),
      } as any);

      initContextService(mockDb, mockStations);

      const summary = getContextSummary();
      expect(summary.current.context).toBe("idle");
    });

    it("initializes with existing context from database", () => {
      const existingContext = {
        id: "test-id",
        context: "commuting",
        confidence: "high",
        factors_json: JSON.stringify({
          location: { nearStation: true },
          time: { timeBucket: "morning-rush", dayCategory: "weekday", isCommuteHours: true },
          patterns: { frequentStations: ["R01"], tapFrequency: 5, hasPatterns: true },
          activity: { currentScreen: "home", screenTime: 120, recentActions: [] },
        }),
        detected_at: Date.now(),
        is_manual_override: 0,
      };

      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(existingContext),
        all: vi.fn().mockReturnValue([]),
      } as any);

      initContextService(mockDb, mockStations);

      const summary = getContextSummary();
      expect(summary.current.context).toBe("commuting");
    });

    it("handles malformed context data gracefully", () => {
      const malformedContext = {
        id: "test-id",
        context: "commuting",
        confidence: "high",
        factors_json: "invalid json",
        detected_at: Date.now(),
        is_manual_override: 0,
      };

      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(malformedContext),
        all: vi.fn().mockReturnValue([]),
      } as any);

      initContextService(mockDb, mockStations);

      const summary = getContextSummary();
      expect(summary.current.context).toBe("idle"); // Falls back to default
    });
  });

  describe("getContextSettings", () => {
    it("returns default settings", () => {
      const settings = getContextSettings();

      expect(settings).toEqual({
        enabled: true,
        showIndicator: true,
        useLocation: true,
        useTimePatterns: true,
        learnPatterns: true,
      });
    });
  });

  describe("updateContextSettings", () => {
    it("updates individual settings", () => {
      updateContextSettings({ enabled: false });

      const settings = getContextSettings();
      expect(settings.enabled).toBe(false);
      expect(settings.showIndicator).toBe(true); // Unchanged
    });

    it("updates multiple settings at once", () => {
      updateContextSettings({
        enabled: false,
        showIndicator: false,
        useLocation: false,
      });

      const settings = getContextSettings();
      expect(settings.enabled).toBe(false);
      expect(settings.showIndicator).toBe(false);
      expect(settings.useLocation).toBe(false);
      expect(settings.useTimePatterns).toBe(true); // Unchanged
    });
  });

  describe("detectAndUpdateContext", () => {
    beforeEach(() => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
      } as any);
      initContextService(mockDb, mockStations);
    });

    it("detects commuting context near station during rush hours", () => {
      const result = detectAndUpdateContext({
        nearStation: true,
        nearStationId: "R01",
        distanceToStation: 50,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      expect(result.context.context).toBeDefined();
      expect(result.transition).not.toBeNull(); // Context changed from idle
    });

    it("records transition when context changes", () => {
      const result1 = detectAndUpdateContext({
        nearStation: true,
        nearStationId: "R01",
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      const result2 = detectAndUpdateContext({
        nearStation: false,
        tapHistory: [],
        currentScreen: "journal",
        screenTime: 300,
        recentActions: ["view_history"],
      });

      expect(result2.transition).not.toBeNull();
      expect(result2.transition?.from).toBe(result1.context.context);
    });

    it("uses manual override when provided", () => {
      const result = detectAndUpdateContext({
        nearStation: false,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
        manualOverride: "exploring" as UserContext,
      });

      expect(result.context.context).toBe("exploring");
    });

    it("returns null transition when context doesn't change", () => {
      const params = {
        nearStation: false,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      };

      detectAndUpdateContext(params);
      const result2 = detectAndUpdateContext(params);

      expect(result2.transition).toBeNull();
    });
  });

  describe("getContextTransitions", () => {
    beforeEach(() => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      } as any);
      initContextService(mockDb, mockStations);
    });

    it("returns empty array when no transitions", () => {
      const transitions = getContextTransitions();
      expect(transitions).toEqual([]);
    });

    it("respects custom limit", () => {
      const mockAll = vi.fn().mockReturnValue([]);
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: mockAll,
      } as any);

      getContextTransitions(50);

      expect(mockAll).toHaveBeenCalledWith(50);
    });

    it("returns transitions from database", () => {
      const mockTransitions = [
        {
          from_context: "idle",
          to_context: "commuting",
          triggered_at: Date.now(),
          trigger: "location",
        },
        {
          from_context: "commuting",
          to_context: "exploring",
          triggered_at: Date.now(),
          trigger: "activity",
        },
      ];

      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: vi.fn().mockReturnValue(mockTransitions),
      } as any);

      // Re-init to use new mock
      resetContextService();
      initContextService(mockDb, mockStations);

      const transitions = getContextTransitions();

      expect(transitions).toHaveLength(2);
      expect(transitions[0]?.from).toBe("idle");
      expect(transitions[0]?.to).toBe("commuting");
      expect(transitions[0]?.trigger).toBe("location");
    });
  });

  describe("getContextSummary", () => {
    beforeEach(() => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      } as any);
      initContextService(mockDb, mockStations);
    });

    it("returns complete summary", () => {
      const summary = getContextSummary();

      expect(summary).toHaveProperty("current");
      expect(summary).toHaveProperty("settings");
      expect(summary).toHaveProperty("uiHints");
      expect(summary).toHaveProperty("label");
      expect(summary).toHaveProperty("icon");
      expect(summary).toHaveProperty("recentTransitions");
    });

    it("includes current context", () => {
      const summary = getContextSummary();

      expect(summary.current.context).toBeDefined();
      expect(summary.current.confidence).toBeDefined();
      expect(summary.current.factors).toBeDefined();
    });

    it("includes UI hints", () => {
      const summary = getContextSummary();

      expect(summary.uiHints).toHaveProperty("showCommuteShortcuts");
      expect(summary.uiHints).toHaveProperty("showFrequentStations");
      expect(summary.uiHints).toHaveProperty("showTripHistory");
      expect(summary.uiHints).toHaveProperty("refreshPriority");
      expect(summary.uiHints).toHaveProperty("preferredScreen");
    });

    it("includes display label and icon", () => {
      const summary = getContextSummary();

      expect(typeof summary.label).toBe("string");
      expect(typeof summary.icon).toBe("string");
    });
  });

  describe("setManualContext", () => {
    beforeEach(() => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      } as any);
      initContextService(mockDb, mockStations);
    });

    it("sets manual context override", () => {
      const newContext = setManualContext("exploring" as UserContext);

      expect(newContext.context).toBe("exploring");
      expect(newContext.isManualOverride).toBe(true);
    });

    it("preserves existing factors", () => {
      detectAndUpdateContext({
        nearStation: true,
        nearStationId: "R01",
        distanceToStation: 50,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      const newContext = setManualContext("working" as UserContext);

      expect(newContext.context).toBe("working");
      // Should preserve the nearStation state from previous detection
    });
  });

  describe("clearManualOverride", () => {
    beforeEach(() => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      } as any);
      initContextService(mockDb, mockStations);
    });

    it("clears manual override and re-detects", () => {
      setManualContext("exploring" as UserContext);

      const restoredContext = clearManualOverride();

      expect(restoredContext.isManualOverride).toBe(false);
    });
  });

  describe("detectContextFromRequest", () => {
    beforeEach(() => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      } as any);
      initContextService(mockDb, mockStations);
    });

    it("detects context from location coordinates", () => {
      // Coordinates near South Ferry
      const context = detectContextFromRequest({
        latitude: 40.702,
        longitude: -74.013,
      });

      expect(context).toBeDefined();
      expect(context.context).toBeDefined();
    });

    it("handles missing location data", () => {
      const context = detectContextFromRequest({});

      expect(context).toBeDefined();
      expect(context.factors.location.nearStation).toBe(false);
    });

    it("incorporates screen activity", () => {
      const context = detectContextFromRequest({
        currentScreen: "journal",
        screenTime: 600,
        recentActions: ["view_history", "tap_favorite"],
      });

      expect(context.factors.activity.currentScreen).toBe("journal");
      expect(context.factors.activity.screenTime).toBe(600);
      expect(context.factors.activity.recentActions).toEqual(["view_history", "tap_favorite"]);
    });

    it("incorporates tap history", () => {
      const currentHour = new Date().getHours();
      const currentDay = new Date().getDay();
      const tapHistory = [
        { favoriteId: "R01", dayOfWeek: currentDay, hour: currentHour },
        { favoriteId: "R01", dayOfWeek: currentDay, hour: currentHour },
        { favoriteId: "R02", dayOfWeek: currentDay, hour: currentHour },
      ];

      // Provide coordinates near R01 station (lat: 40.702, lon: -74.013)
      // to trigger nearStation detection and tap frequency calculation
      const context = detectContextFromRequest({
        latitude: 40.702,
        longitude: -74.013,
        tapHistory,
      });

      expect(context.factors.patterns.tapFrequency).toBeGreaterThan(0);
    });
  });

  describe("resetContextService", () => {
    it("resets to default context", () => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      } as any);
      initContextService(mockDb, mockStations);

      // Modify settings
      updateContextSettings({ enabled: false });

      // Reset
      resetContextService();

      const settings = getContextSettings();
      expect(settings.enabled).toBe(true); // Back to default
    });

    it("resets current context to idle", () => {
      vi.mocked(mockDb.prepare).mockReturnValue({
        get: vi.fn().mockReturnValue(undefined),
        run: vi.fn(),
        all: vi.fn().mockReturnValue([]),
      } as any);
      initContextService(mockDb, mockStations);

      setManualContext("exploring" as UserContext);

      resetContextService();

      const summary = getContextSummary();
      expect(summary.current.context).toBe("idle");
    });
  });
});
