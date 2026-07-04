/**
 * Tests for morning briefing push notification service.
 *
 * Tests briefing payload building, quiet hours handling,
 * and scheduling behavior.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildBriefingPayload, isQuietHours } from "./briefing.js";

// Mock the alerts-poller module
const mockGetAllAlerts = vi.fn(() => []);
vi.mock("../alerts-poller.js", () => ({
  getAllAlerts: () => mockGetAllAlerts(),
}));

// Mock the logger module
vi.mock("../observability/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock the sendPushNotification function
vi.mock("./sender.js", () => ({
  sendPushNotification: vi.fn(),
}));

// Mock the getAllSubscriptions function
vi.mock("./subscriptions.js", () => ({
  getAllSubscriptions: vi.fn(() => []),
}));

describe("push/briefing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T07:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isQuietHours", () => {
    it("returns false when quiet hours are disabled", () => {
      const config = { enabled: false, startHour: 22, endHour: 7 };
      expect(isQuietHours(config)).toBe(false);
    });

    it("returns true when current hour is within quiet hours (same day)", () => {
      const config = { enabled: true, startHour: 22, endHour: 7 };
      vi.setSystemTime(new Date("2024-01-15T22:30:00Z"));
      expect(isQuietHours(config)).toBe(true);
    });

    it("returns true when current hour is within quiet hours (overnight)", () => {
      const config = { enabled: true, startHour: 22, endHour: 7 };
      vi.setSystemTime(new Date("2024-01-15T03:00:00Z"));
      expect(isQuietHours(config)).toBe(true);
    });

    it("returns false when current hour is outside quiet hours", () => {
      const config = { enabled: true, startHour: 22, endHour: 7 };
      vi.setSystemTime(new Date("2024-01-15T10:00:00Z"));
      expect(isQuietHours(config)).toBe(false);
    });

    it("handles edge case at start hour", () => {
      const config = { enabled: true, startHour: 22, endHour: 7 };
      vi.setSystemTime(new Date("2024-01-15T22:00:00Z"));
      expect(isQuietHours(config)).toBe(true);
    });

    it("handles edge case at end hour", () => {
      const config = { enabled: true, startHour: 22, endHour: 7 };
      vi.setSystemTime(new Date("2024-01-15T07:00:00Z"));
      expect(isQuietHours(config)).toBe(false);
    });
  });

  describe("buildBriefingPayload", () => {
    it("returns null for empty favorites", () => {
      const payload = buildBriefingPayload([], {});
      expect(payload).toBeNull();
    });

    it("creates all-clear briefing when no alerts", () => {
      const favorites = [
        { id: "fav1", stationId: "101", lines: ["1", "2"], direction: "both" },
        { id: "fav2", stationId: "725", lines: ["A", "C"], direction: "northbound" },
      ];

      const payload = buildBriefingPayload(favorites, {});

      expect(payload).not.toBeNull();
      expect(payload?.title).toBe("Good morning! Subway status");
      expect(payload?.body).toContain("All clear");
      expect(payload?.severity).toBe("info");
      expect(payload?.lines).toContain("1");
      expect(payload?.lines).toContain("A");
    });

    it("sorts favorites by morning score", () => {
      const favorites = [
        { id: "fav1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav2", stationId: "725", lines: ["A"], direction: "northbound" },
        { id: "fav3", stationId: "726", lines: ["B"], direction: "southbound" },
      ];

      const morningScores = {
        fav2: 100,
        fav1: 50,
        fav3: 10,
      };

      const payload = buildBriefingPayload(favorites, morningScores);

      // Top favorites (fav2 with A line, fav1 with 1 line) should be mentioned prominently
      expect(payload?.body).toContain("(A)");
      expect(payload?.body).toContain("(1)");
    });

    it("handles case-insensitive line matching", () => {
      const favorites = [{ id: "fav1", stationId: "101", lines: ["1", "a"], direction: "both" }];

      const payload = buildBriefingPayload(favorites, {});

      expect(payload?.lines).toContain("1");
      expect(payload?.lines).toContain("A"); // Should be uppercased
    });

    it("deduplicates lines across favorites", () => {
      const favorites = [
        { id: "fav1", stationId: "101", lines: ["1", "2"], direction: "both" },
        { id: "fav2", stationId: "725", lines: ["1", "3"], direction: "northbound" },
        { id: "fav3", stationId: "726", lines: ["2", "3"], direction: "southbound" },
      ];

      const payload = buildBriefingPayload(favorites, {});

      expect(payload?.lines).toHaveLength(3);
      expect(new Set(payload?.lines).size).toBe(3);
    });

    it("creates alert briefing when there are matching alerts", () => {
      // Mock alerts to include some on the user's lines
      mockGetAllAlerts.mockReturnValueOnce([
        {
          id: "alert1",
          severity: "severe",
          source: "official",
          headline: "Delays",
          description: "Signal problems",
          affectedLines: ["1", "2"],
          activePeriod: { start: Date.now() / 1000 - 3600 },
          cause: "signal",
          effect: "delay",
        },
        {
          id: "alert2",
          severity: "warning",
          source: "official",
          headline: "Planned Work",
          description: "Maintenance",
          affectedLines: ["A"],
          activePeriod: { start: Date.now() / 1000 - 7200 },
          cause: "maintenance",
          effect: "modified_service",
        },
      ]);

      const favorites = [
        { id: "fav1", stationId: "101", lines: ["1", "2"], direction: "both" },
        { id: "fav2", stationId: "725", lines: ["A", "C"], direction: "northbound" },
      ];

      const morningScores = { fav1: 100, fav2: 50 };

      const payload = buildBriefingPayload(favorites, morningScores);

      expect(payload).not.toBeNull();
      expect(payload?.title).toBe("Good morning! Subway status");
      expect(payload?.body).toContain("Heads up");
      expect(payload?.body).toContain("(1)");
      expect(payload?.body).toContain("(2)");
      expect(payload?.body).toContain("(A)");
      expect(payload?.severity).toBe("severe");
    });

    it("prioritizes morning favorites in alert message", () => {
      // Create multiple alerts - one for top lines, one for others
      // For "morning lines" to appear, we need alerts on top lines AND alerts on non-top lines
      mockGetAllAlerts.mockReturnValueOnce([
        {
          id: "alert1",
          severity: "warning",
          source: "official",
          headline: "Delays",
          description: "Delays",
          affectedLines: ["1"], // Only line 1 (top morning line)
          activePeriod: { start: Date.now() / 1000 - 3600 },
          cause: "signal",
          effect: "delay",
        },
        {
          id: "alert2",
          severity: "warning",
          source: "official",
          headline: "Planned Work",
          description: "Maintenance",
          affectedLines: ["C"], // Line C not in top 3 favorites
          activePeriod: { start: Date.now() / 1000 - 7200 },
          cause: "maintenance",
          effect: "modified_service",
        },
      ]);

      const favorites = [
        { id: "fav1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav2", stationId: "725", lines: ["2", "3"], direction: "northbound" },
        { id: "fav3", stationId: "726", lines: ["A"], direction: "southbound" },
        { id: "fav4", stationId: "727", lines: ["C"], direction: "both" }, // 4th favorite
      ];

      const morningScores = { fav1: 100, fav2: 10, fav3: 5, fav4: 1 };

      const payload = buildBriefingPayload(favorites, morningScores);

      // fav1 (line 1) has highest morning score, should be mentioned first
      expect(payload?.body).toContain("morning lines");
      expect(payload?.body).toContain("(1)");
    });

    it("creates warning severity for non-severe alerts", () => {
      mockGetAllAlerts.mockReturnValueOnce([
        {
          id: "alert1",
          severity: "warning",
          source: "official",
          headline: "Delays",
          description: "Minor delays",
          affectedLines: ["1"],
          activePeriod: { start: Date.now() / 1000 - 3600 },
          cause: "signal",
          effect: "delay",
        },
      ]);

      const favorites = [{ id: "fav1", stationId: "101", lines: ["1"], direction: "both" }];

      const payload = buildBriefingPayload(favorites, {});

      expect(payload?.severity).toBe("warning");
    });

    it("ignores info-level alerts for briefing", () => {
      mockGetAllAlerts.mockReturnValueOnce([
        {
          id: "alert1",
          severity: "info",
          source: "official",
          headline: "Planned Work",
          description: "Weekend work",
          affectedLines: ["1"],
          activePeriod: { start: Date.now() / 1000 - 3600 },
          cause: "maintenance",
          effect: "modified_service",
        },
      ]);

      const favorites = [{ id: "fav1", stationId: "101", lines: ["1"], direction: "both" }];

      const payload = buildBriefingPayload(favorites, {});

      // Info alerts should be ignored, resulting in "all clear"
      expect(payload?.body).toContain("All clear");
      expect(payload?.severity).toBe("info");
    });

    it("includes all lines when there are more top favorites than total lines", () => {
      const favorites = [
        { id: "fav1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav2", stationId: "725", lines: ["2"], direction: "northbound" },
      ];

      const payload = buildBriefingPayload(favorites, {});

      expect(payload?.body).toContain("(1)");
      expect(payload?.body).toContain("(2)");
      // Should not have a separate "all lines" section since all are shown
    });

    it("handles empty morning scores gracefully", () => {
      const favorites = [
        { id: "fav1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav2", stationId: "725", lines: ["A"], direction: "northbound" },
      ];

      // Pass undefined or empty morning scores
      const payload = buildBriefingPayload(favorites, {});

      expect(payload).not.toBeNull();
      expect(payload?.lines).toContain("1");
      expect(payload?.lines).toContain("A");
    });

    it("handles malformed line data", () => {
      const favorites = [
        { id: "fav1", stationId: "101", lines: [], direction: "both" },
        { id: "fav2", stationId: "725", lines: ["1", ""], direction: "northbound" },
      ];

      const payload = buildBriefingPayload(favorites, {});

      // Should still create a payload with valid lines
      expect(payload).not.toBeNull();
      expect(payload?.lines).toContain("1");
    });

    it("includes timestamp in payload", () => {
      const favorites = [{ id: "fav1", stationId: "101", lines: ["1"], direction: "both" }];

      const beforeTime = Date.now();
      const payload = buildBriefingPayload(favorites, {});
      const afterTime = Date.now();

      expect(payload?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(payload?.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it("includes changeType in payload", () => {
      const favorites = [{ id: "fav1", stationId: "101", lines: ["1"], direction: "both" }];

      const payload = buildBriefingPayload(favorites, {});

      expect(payload?.changeType).toBe("new");
    });
  });
});
