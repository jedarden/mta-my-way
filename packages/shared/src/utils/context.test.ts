/**
 * Unit tests for context detection utilities
 */

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CONTEXT_STATE,
  calculatePatternConfidence,
  calculateTapFrequency,
  detectContext,
  getContextIcon,
  getContextLabel,
  getContextUIHints,
  getFrequentStationsAtCurrentTime,
  shouldTriggerUIRefresh,
} from "./context.js";

// Mock the time utilities for consistent testing
vi.mock("./time.js", () => ({
  getCurrentDayOfWeek: () => 3, // Wednesday
  getCurrentHour: () => 8, // 8 AM (commute hours)
}));

// Mock the patterns utilities
vi.mock("./patterns.js", () => ({
  getCurrentTimeBucket: () => "morning_rush",
  getCurrentDayCategory: () => "weekday",
}));

describe("context utilities", () => {
  describe("DEFAULT_CONTEXT_STATE", () => {
    it("has correct default values", () => {
      expect(DEFAULT_CONTEXT_STATE.context).toBe("idle");
      expect(DEFAULT_CONTEXT_STATE.confidence).toBe("low");
      expect(DEFAULT_CONTEXT_STATE.isManualOverride).toBe(false);
      expect(DEFAULT_CONTEXT_STATE.factors.location.nearStation).toBe(false);
      expect(DEFAULT_CONTEXT_STATE.factors.activity.currentScreen).toBe("home");
    });

    it("has detectedAt timestamp", () => {
      expect(DEFAULT_CONTEXT_STATE.detectedAt).toBeDefined();
      expect(new Date(DEFAULT_CONTEXT_STATE.detectedAt)).toBeInstanceOf(Date);
    });
  });

  describe("getContextUIHints", () => {
    it("returns hints for commuting context", () => {
      const hints = getContextUIHints("commuting");
      expect(hints.preferredScreen).toBe("home");
      expect(hints.showCommuteShortcuts).toBe(true);
      expect(hints.showFrequentStations).toBe(true);
      expect(hints.refreshPriority).toBe(10);
      expect(hints.themeVariant).toBe("prominent");
    });

    it("returns hints for planning context", () => {
      const hints = getContextUIHints("planning");
      expect(hints.preferredScreen).toBe("home");
      expect(hints.showCommuteShortcuts).toBe(true);
      expect(hints.refreshPriority).toBe(5);
      expect(hints.themeVariant).toBe("normal");
    });

    it("returns hints for reviewing context", () => {
      const hints = getContextUIHints("reviewing");
      expect(hints.preferredScreen).toBe("journal");
      expect(hints.showTripHistory).toBe(true);
      expect(hints.refreshPriority).toBe(2);
      expect(hints.themeVariant).toBe("subdued");
    });

    it("returns hints for at_station context", () => {
      const hints = getContextUIHints("at_station");
      expect(hints.refreshPriority).toBe(9);
      expect(hints.themeVariant).toBe("prominent");
    });

    it("returns hints for idle context", () => {
      const hints = getContextUIHints("idle");
      expect(hints.preferredScreen).toBe("home");
      expect(hints.showCommuteShortcuts).toBe(false);
      expect(hints.refreshPriority).toBe(3);
    });
  });

  describe("getContextLabel", () => {
    it("returns labels for each context", () => {
      expect(getContextLabel("commuting")).toBe("Commute");
      expect(getContextLabel("planning")).toBe("Planning");
      expect(getContextLabel("reviewing")).toBe("Reviewing");
      expect(getContextLabel("idle")).toBe("");
      expect(getContextLabel("at_station")).toBe("At Station");
    });
  });

  describe("getContextIcon", () => {
    it("returns icons for each context", () => {
      expect(getContextIcon("commuting")).toBe("train");
      expect(getContextIcon("planning")).toBe("map");
      expect(getContextIcon("reviewing")).toBe("clock");
      expect(getContextIcon("idle")).toBe("");
      expect(getContextIcon("at_station")).toBe("location");
    });
  });

  describe("calculateTapFrequency", () => {
    it("returns 0 for empty tap history", () => {
      const frequency = calculateTapFrequency("station-1", []);
      expect(frequency).toBe(0);
    });

    it("returns 0 when no taps match the favorite", () => {
      const tapHistory = [
        { favoriteId: "station-2", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
      ];
      const frequency = calculateTapFrequency("station-1", tapHistory);
      expect(frequency).toBe(0);
    });

    it("calculates frequency for matching taps", () => {
      const tapHistory = [
        { favoriteId: "station-1", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
        { favoriteId: "station-1", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
      ];
      const frequency = calculateTapFrequency("station-1", tapHistory);
      expect(frequency).toBeGreaterThan(0);
      expect(frequency).toBeLessThanOrEqual(1);
    });

    it("caps frequency at 1 (10 taps for max score)", () => {
      const tapHistory = Array.from({ length: 20 }, (_, i) => ({
        favoriteId: "station-1",
        dayOfWeek: 3,
        hour: 8,
        timestamp: Date.now() - i * 1000,
      }));
      const frequency = calculateTapFrequency("station-1", tapHistory);
      expect(frequency).toBe(1);
    });

    it("considers day type (weekday vs weekend)", () => {
      // Current time is Wednesday (weekday)
      const weekdayTaps = [
        { favoriteId: "station-1", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
      ];
      const weekendTaps = [
        { favoriteId: "station-1", dayOfWeek: 0, hour: 8, timestamp: Date.now() },
      ];

      const weekdayFrequency = calculateTapFrequency("station-1", weekdayTaps);
      const weekendFrequency = calculateTapFrequency("station-1", weekendTaps);

      expect(weekdayFrequency).toBeGreaterThan(0);
      expect(weekendFrequency).toBe(0); // Weekend tap doesn't count on weekday
    });
  });

  describe("getFrequentStationsAtCurrentTime", () => {
    it("returns empty array for empty tap history", () => {
      const stations = getFrequentStationsAtCurrentTime([], 0.2);
      expect(stations).toEqual([]);
    });

    it("returns stations above minimum frequency", () => {
      const tapHistory = [
        { favoriteId: "station-1", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
        { favoriteId: "station-1", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
        { favoriteId: "station-2", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
      ];

      const stations = getFrequentStationsAtCurrentTime(tapHistory, 0.1);
      expect(stations.length).toBeGreaterThan(0);
      expect(stations).toContain("station-1");
    });

    it("sorts stations by frequency (highest first)", () => {
      const tapHistory = [
        { favoriteId: "station-2", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
        { favoriteId: "station-1", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
        { favoriteId: "station-1", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
        { favoriteId: "station-1", dayOfWeek: 3, hour: 8, timestamp: Date.now() },
      ];

      const stations = getFrequentStationsAtCurrentTime(tapHistory, 0.1);
      expect(stations[0]).toBe("station-1"); // Highest frequency
    });
  });

  describe("calculatePatternConfidence", () => {
    it("returns no patterns for insufficient data", () => {
      const result = calculatePatternConfidence([]);
      expect(result.hasPatterns).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it("returns no patterns for minimal data", () => {
      const tapHistory = Array.from({ length: 5 }, (_, i) => ({
        favoriteId: `station-${i}`,
        dayOfWeek: 3,
        hour: 8,
        timestamp: Date.now() - i * 1000,
      }));

      const result = calculatePatternConfidence(tapHistory);
      expect(result.hasPatterns).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it("detects patterns with consistent station usage", () => {
      // Same station, same day, similar times = strong pattern
      const tapHistory = Array.from({ length: 15 }, (_, i) => ({
        favoriteId: "station-1",
        dayOfWeek: 3,
        hour: 8 + (i % 2), // 8 or 9 AM
        timestamp: Date.now() - i * 1000000,
      }));

      const result = calculatePatternConfidence(tapHistory);
      expect(result.hasPatterns).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it("detects weak or no patterns with random usage", () => {
      const tapHistory = Array.from({ length: 20 }, (_, i) => ({
        favoriteId: `station-${i % 5}`, // 5 different stations with 4 taps each
        dayOfWeek: (i * 3) % 7, // Spread across different days
        hour: (i * 5) % 24, // Spread across different hours
        timestamp: Date.now() - i * 1000000,
      }));

      const result = calculatePatternConfidence(tapHistory);
      // With varied stations, days, and hours, patterns should be weak or non-existent
      // Since each station will have more diverse day/hour combinations, confidence should be lower
      expect(result.confidence).toBeLessThan(0.8);
    });
  });

  describe("detectContext", () => {
    it("returns idle for no specific context", () => {
      const result = detectContext({
        nearStation: false,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      expect(result.context).toBe("idle");
      expect(result.confidence).toBe("low");
    });

    it("detects at_station when near station", () => {
      const result = detectContext({
        nearStation: true,
        nearStationId: "station-1",
        distanceToStation: 50,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });

      expect(result.context).toBe("at_station");
      expect(result.confidence).toBe("high");
      expect(result.factors.location.nearStation).toBe(true);
      expect(result.factors.location.stationId).toBe("station-1");
      expect(result.factors.location.distance).toBe(50);
    });

    it("uses manual override when provided", () => {
      const result = detectContext({
        nearStation: false,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
        manualOverride: "commuting",
      });

      expect(result.context).toBe("commuting");
      expect(result.confidence).toBe("high");
      expect(result.isManualOverride).toBe(true);
    });

    it("detects reviewing context on journal screen", () => {
      const result = detectContext({
        nearStation: false,
        tapHistory: [],
        currentScreen: "journal",
        screenTime: 15,
        recentActions: [],
      });

      expect(result.context).toBe("reviewing");
      expect(result.confidence).toBe("high");
    });

    it("detects planning context with search action", () => {
      const result = detectContext({
        nearStation: false,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 10,
        recentActions: ["search_station"],
      });

      expect(result.context).toBe("planning");
      expect(result.confidence).toBe("medium");
    });

    it("includes detected timestamp", () => {
      const before = Date.now();
      const result = detectContext({
        nearStation: false,
        tapHistory: [],
        currentScreen: "home",
        screenTime: 0,
        recentActions: [],
      });
      const after = Date.now();

      expect(result.detectedAt).toBeDefined();
      const detectedTime = new Date(result.detectedAt).getTime();
      expect(detectedTime).toBeGreaterThanOrEqual(before);
      expect(detectedTime).toBeLessThanOrEqual(after);
    });
  });

  describe("shouldTriggerUIRefresh", () => {
    it("returns true for significant transitions", () => {
      expect(shouldTriggerUIRefresh("idle", "commuting")).toBe(true);
      expect(shouldTriggerUIRefresh("idle", "at_station")).toBe(true);
      expect(shouldTriggerUIRefresh("commuting", "at_station")).toBe(true);
    });

    it("returns false for minor transitions", () => {
      expect(shouldTriggerUIRefresh("idle", "idle")).toBe(false);
      expect(shouldTriggerUIRefresh("planning", "planning")).toBe(false);
    });

    it("returns true for bidirectional significant transitions", () => {
      expect(shouldTriggerUIRefresh("idle", "commuting")).toBe(true);
      expect(shouldTriggerUIRefresh("commuting", "idle")).toBe(true);
    });
  });
});
