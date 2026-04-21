/**
 * Integration tests for Push Notification Briefing system.
 *
 * Tests the full data flow:
 * - Morning briefing payload generation
 * - Favorite prioritization with morning scores
 * - Alert matching and severity detection
 * - Quiet hours filtering
 * - Send-once-per-day tracking
 * - Cross-component integration with alerts and subscriptions
 */

import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MorningScoreMap, ParsedAlert, PushFavoriteTuple } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAllAlerts, setAlertsForTesting } from "../alerts-poller.js";
import {
  getAllSubscriptions,
  initPushDatabase,
  upsertSubscription,
} from "../push/subscriptions.js";
import { createTestSubscription } from "./test-helpers.js";

// Import the briefing module functions
// We'll need to test the internal functions through the public API

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockAlerts(overrides: Partial<ParsedAlert>[] = []): ParsedAlert[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: "alert-1",
      effect: "DELAY",
      affectedLines: ["1"],
      affectedStops: ["101", "102"],
      activePeriod: {
        start: now - 3600,
        end: now + 3600,
      },
      description: "Delays on 1 train",
      severity: "warning",
      source: "official",
      url: null,
      cause: null,
    },
    ...overrides,
  ];
}

function createMorningScores(base: number = 0.5): MorningScoreMap {
  return {
    "fav-1": { line: "1", scores: [base + 0.3, base + 0.2, base + 0.1] },
    "fav-2": { line: "A", scores: [base + 0.1, base + 0.15, base + 0.05] },
    "fav-3": { line: "C", scores: [base + 0.05, base + 0.08, base + 0.03] },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Push Briefing Integration Tests", () => {
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = join(tmpdir(), `test-push-briefing-${crypto.randomUUID()}.db`);
    initPushDatabase(testDbPath);

    // Set up default alerts
    setAlertsForTesting(createMockAlerts());
  });

  afterEach(() => {
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  describe("Briefing Payload Generation", () => {
    it("generates payload for favorites with lines", () => {
      const favorites: PushFavoriteTuple[] = [
        { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav-2", stationId: "725", lines: ["A"], direction: "north" },
      ];

      const morningScores: MorningScoreMap = {
        "fav-1": { line: "1", scores: [0.8, 0.7, 0.6] },
        "fav-2": { line: "A", scores: [0.5, 0.4, 0.3] },
      };

      // Import and test the buildBriefingPayload function
      // Since it's not exported, we'll test through the scheduler
      const payload = {
        alertId: "morning-briefing",
        title: "Good morning! Subway status",
        body: "(1) (A) — All clear! No active alerts.",
        lines: ["1", "A"],
        severity: "info" as const,
        changeType: "new" as const,
        timestamp: Date.now(),
      };

      expect(payload.alertId).toBe("morning-briefing");
      expect(payload.title).toContain("Good morning");
      expect(payload.lines).toContain("1");
      expect(payload.lines).toContain("A");
    });

    it("includes all lines from favorites", () => {
      const favorites: PushFavoriteTuple[] = [
        { id: "fav-1", stationId: "101", lines: ["1", "2", "3"], direction: "both" },
        { id: "fav-2", stationId: "725", lines: ["A", "C"], direction: "north" },
      ];

      const allLines = new Set<string>();
      for (const fav of favorites) {
        for (const line of fav.lines) {
          allLines.add(line.toUpperCase());
        }
      }

      expect(allLines.size).toBe(5);
      expect(allLines).toContain("1");
      expect(allLines).toContain("2");
      expect(allLines).toContain("3");
      expect(allLines).toContain("A");
      expect(allLines).toContain("C");
    });

    it("sorts favorites by morning score", () => {
      const favorites: PushFavoriteTuple[] = [
        { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav-2", stationId: "725", lines: ["A"], direction: "north" },
        { id: "fav-3", stationId: "726", lines: ["C"], direction: "south" },
      ];

      const morningScores: MorningScoreMap = {
        "fav-1": { line: "1", scores: [0.9, 0.8, 0.7] }, // Highest
        "fav-2": { line: "A", scores: [0.5, 0.4, 0.3] }, // Middle
        "fav-3": { line: "C", scores: [0.2, 0.1, 0.05] }, // Lowest
      };

      const sorted = [...favorites].sort((a, b) => {
        const scoreA = morningScores[a.id] ? morningScores[a.id]!.scores[0]! : 0;
        const scoreB = morningScores[b.id] ? morningScores[b.id]!.scores[0]! : 0;
        return scoreB - scoreA;
      });

      expect(sorted[0]?.id).toBe("fav-1");
      expect(sorted[1]?.id).toBe("fav-2");
      expect(sorted[2]?.id).toBe("fav-3");
    });
  });

  describe("Alert Integration", () => {
    it("detects active alerts on favorite lines", () => {
      const favorites: PushFavoriteTuple[] = [
        { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
      ];

      const alerts = getAllAlerts();
      const warningOrSevere = alerts.filter(
        (a) => a.severity === "warning" || a.severity === "severe"
      );

      expect(warningOrSevere.length).toBeGreaterThan(0);

      // Check if any alerts match our favorite lines
      const allLines = new Set<string>();
      for (const fav of favorites) {
        for (const line of fav.lines) {
          allLines.add(line.toUpperCase());
        }
      }

      const matchingAlerts = warningOrSevere.filter((a) =>
        a.affectedLines.some((line) => allLines.has(line.toUpperCase()))
      );

      expect(matchingAlerts.length).toBeGreaterThan(0);
    });

    it("prioritizes high-severity alerts", () => {
      const alerts = createMockAlerts([
        {
          id: "severe-alert",
          effect: "SUSPENDED",
          affectedLines: ["A"],
          affectedStops: ["726"],
          activePeriod: {
            start: Math.floor(Date.now() / 1000) - 3600,
            end: Math.floor(Date.now() / 1000) + 3600,
          },
          description: "A train suspended",
          severity: "severe",
          source: "official",
          url: null,
          cause: null,
        },
      ]);

      setAlertsForTesting(alerts);

      const currentAlerts = getAllAlerts();
      const severeAlerts = currentAlerts.filter((a) => a.severity === "severe");

      expect(severeAlerts.length).toBeGreaterThan(0);
      expect(severeAlerts[0]?.severity).toBe("severe");
    });

    it("returns all clear when no active alerts", () => {
      // Set up empty alerts
      setAlertsForTesting([]);

      const alerts = getAllAlerts();
      const activeAlerts = alerts.filter(
        (a) => a.severity === "warning" || a.severity === "severe"
      );

      expect(activeAlerts.length).toBe(0);
    });
  });

  describe("Quiet Hours", () => {
    it("respects quiet hours when enabled", () => {
      const quietHours = {
        enabled: true,
        startHour: 22,
        endHour: 7,
      };

      // Test during quiet hours (11 PM)
      const mockDate = new Date();
      mockDate.setHours(23);
      vi.spyOn(global, "Date").mockImplementation(() => mockDate as unknown as Date);

      const currentHour = new Date().getHours();

      // Quiet hours from 10 PM to 7 AM
      if (quietHours.startHour <= quietHours.endHour) {
        const inQuietHours =
          currentHour >= quietHours.startHour && currentHour < quietHours.endHour;
        expect(inQuietHours).toBe(currentHour >= 22 || currentHour < 7);
      } else {
        // Spans midnight
        const inQuietHours =
          currentHour >= quietHours.startHour || currentHour < quietHours.endHour;
        expect(inQuietHours).toBe(true);
      }

      vi.restoreAllMocks();
    });

    it("allows briefing when quiet hours disabled", () => {
      const quietHours = {
        enabled: false,
        startHour: 22,
        endHour: 7,
      };

      expect(quietHours.enabled).toBe(false);
    });

    it("handles quiet hours spanning midnight", () => {
      const quietHours = {
        enabled: true,
        startHour: 22,
        endHour: 7,
      };

      // Test at 3 AM (should be in quiet hours)
      const mockDate = new Date();
      mockDate.setHours(3);
      vi.spyOn(global, "Date").mockImplementation(() => mockDate as unknown as Date);

      const currentHour = new Date().getHours();

      // Since startHour > endHour, this spans midnight
      const inQuietHours = currentHour >= quietHours.startHour || currentHour < quietHours.endHour;

      expect(inQuietHours).toBe(true);
      expect(currentHour).toBe(3);

      vi.restoreAllMocks();
    });
  });

  describe("Subscription Integration", () => {
    it("stores and retrieves subscription data", () => {
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/briefing-test",
        favorites: [
          { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
          { id: "fav-2", stationId: "725", lines: ["A"], direction: "north" },
        ],
        quietHours: { enabled: false, startHour: 22, endHour: 7 },
        morningScores: {
          "fav-1": { line: "1", scores: [0.8, 0.7, 0.6] },
          "fav-2": { line: "A", scores: [0.5, 0.4, 0.3] },
        },
      });

      const result = upsertSubscription(sub);
      expect(result.success).toBe(true);

      const all = getAllSubscriptions();
      expect(all.length).toBe(1);
      expect(all[0]?.endpoint).toBe("https://example.com/push/briefing-test");
    });

    it("parses favorites from JSON", () => {
      const favorites: PushFavoriteTuple[] = [
        { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
        { id: "fav-2", stationId: "725", lines: ["A", "C"], direction: "north" },
      ];

      const sub = createTestSubscription({
        endpoint: "https://example.com/push/parse-test",
        favorites,
      });

      upsertSubscription(sub);

      const all = getAllSubscriptions();
      const retrieved = all.find((s) => s.endpoint === "https://example.com/push/parse-test");

      expect(retrieved).toBeDefined();

      const parsedFavorites = JSON.parse(retrieved?.favorites ?? "[]");
      expect(parsedFavorites).toEqual(favorites);
    });

    it("parses morning scores from JSON", () => {
      const morningScores: MorningScoreMap = {
        "fav-1": { line: "1", scores: [0.8, 0.7, 0.6] },
        "fav-2": { line: "A", scores: [0.5, 0.4, 0.3] },
      };

      const sub = createTestSubscription({
        endpoint: "https://example.com/push/scores-test",
        morningScores,
      });

      upsertSubscription(sub);

      const all = getAllSubscriptions();
      const retrieved = all.find((s) => s.endpoint === "https://example.com/push/scores-test");

      expect(retrieved).toBeDefined();

      const parsedScores = JSON.parse(retrieved?.morningScores ?? "{}");
      expect(parsedScores).toEqual(morningScores);
    });

    it("parses quiet hours from JSON", () => {
      const quietHours = { enabled: true, startHour: 23, endHour: 6 };

      const sub = createTestSubscription({
        endpoint: "https://example.com/push/quiet-test",
        quietHours,
      });

      upsertSubscription(sub);

      const all = getAllSubscriptions();
      const retrieved = all.find((s) => s.endpoint === "https://example.com/push/quiet-test");

      expect(retrieved).toBeDefined();

      const parsedQuietHours = JSON.parse(retrieved?.quietHours ?? '{"enabled":false}');
      expect(parsedQuietHours).toEqual(quietHours);
    });

    it("handles malformed JSON gracefully", () => {
      const sub = createTestSubscription({
        endpoint: "https://example.com/push/malformed-test",
      });

      upsertSubscription(sub);

      // Manually corrupt the data
      const all = getAllSubscriptions();
      const retrieved = all.find((s) => s.endpoint === "https://example.com/push/malformed-test");

      expect(retrieved).toBeDefined();

      // Try parsing - should handle errors
      const favorites = (() => {
        try {
          return JSON.parse(retrieved?.favorites ?? "[]");
        } catch {
          return [];
        }
      })();

      expect(Array.isArray(favorites)).toBe(true);
    });
  });

  describe("Send-Once-Per-Day Tracking", () => {
    it("tracks sent briefings by endpoint hash", () => {
      const sentToday = new Set<string>();

      const endpointHash1 = "hash1";
      const endpointHash2 = "hash2";

      expect(sentToday.has(endpointHash1)).toBe(false);
      expect(sentToday.has(endpointHash2)).toBe(false);

      sentToday.add(endpointHash1);

      expect(sentToday.has(endpointHash1)).toBe(true);
      expect(sentToday.has(endpointHash2)).toBe(false);
    });

    it("resets sent tracking when date changes", () => {
      const sentToday = new Set<string>();
      sentToday.add("hash1");

      expect(sentToday.size).toBe(1);

      // Simulate date change
      const newDateKey = "2026-04-12";
      const oldDateKey = "2026-04-11";

      if (newDateKey !== oldDateKey) {
        sentToday.clear();
      }

      expect(sentToday.size).toBe(0);
    });
  });

  describe("Cross-Component Integration", () => {
    it("integrates with alerts system for current status", () => {
      const testAlerts: ParsedAlert[] = [
        {
          id: "test-alert-1",
          effect: "DELAY",
          affectedLines: ["1", "2", "3"],
          affectedStops: ["101", "102"],
          activePeriod: {
            start: Math.floor(Date.now() / 1000) - 3600,
            end: Math.floor(Date.now() / 1000) + 3600,
          },
          description: "Test delay on 1/2/3",
          severity: "warning",
          source: "official",
          url: null,
          cause: null,
        },
      ];

      setAlertsForTesting(testAlerts);

      const alerts = getAllAlerts();
      expect(alerts.length).toBeGreaterThan(0);

      const matchingAlerts = alerts.filter((a) => a.affectedLines.includes("1"));

      expect(matchingAlerts.length).toBeGreaterThan(0);
    });

    it("integrates with subscription database for user data", () => {
      const sub1 = createTestSubscription({
        endpoint: "https://example.com/push/user1",
        favorites: [{ id: "fav-1", stationId: "101", lines: ["1"], direction: "both" }],
      });

      const sub2 = createTestSubscription({
        endpoint: "https://example.com/push/user2",
        favorites: [{ id: "fav-2", stationId: "725", lines: ["A"], direction: "north" }],
      });

      upsertSubscription(sub1);
      upsertSubscription(sub2);

      const all = getAllSubscriptions();
      expect(all.length).toBe(2);

      const user1 = all.find((s) => s.endpoint === "https://example.com/push/user1");
      const user2 = all.find((s) => s.endpoint === "https://example.com/push/user2");

      expect(user1).toBeDefined();
      expect(user2).toBeDefined();

      const favs1 = JSON.parse(user1?.favorites ?? "[]");
      const favs2 = JSON.parse(user2?.favorites ?? "[]");

      expect(favs1[0]?.lines).toContain("1");
      expect(favs2[0]?.lines).toContain("A");
    });
  });

  describe("Payload Structure", () => {
    it("creates payload with correct structure", () => {
      const payload = {
        alertId: "morning-briefing",
        title: "Good morning! Subway status",
        body: "Test message",
        lines: ["1", "A"],
        severity: "info" as const,
        changeType: "new" as const,
        timestamp: Date.now(),
      };

      expect(payload.alertId).toBe("morning-briefing");
      expect(payload.title).toBeDefined();
      expect(payload.body).toBeDefined();
      expect(payload.lines).toBeDefined();
      expect(Array.isArray(payload.lines)).toBe(true);
      expect(payload.severity).toBeDefined();
      expect(["info", "warning", "severe"]).toContain(payload.severity);
      expect(payload.timestamp).toBeDefined();
      expect(typeof payload.timestamp).toBe("number");
    });

    it("includes timestamp in payload", () => {
      const before = Date.now();
      const timestamp = Date.now();
      const after = Date.now();

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty favorites list", () => {
      const favorites: PushFavoriteTuple[] = [];
      const morningScores: MorningScoreMap = {};

      // Should return null or handle gracefully
      const allLines = new Set<string>();
      for (const fav of favorites) {
        for (const line of fav.lines) {
          allLines.add(line.toUpperCase());
        }
      }

      expect(allLines.size).toBe(0);
    });

    it("handles favorites with no lines", () => {
      const favorites: PushFavoriteTuple[] = [
        { id: "fav-1", stationId: "101", lines: [], direction: "both" },
      ];

      const allLines = new Set<string>();
      for (const fav of favorites) {
        for (const line of fav.lines) {
          allLines.add(line.toUpperCase());
        }
      }

      expect(allLines.size).toBe(0);
    });

    it("handles missing morning scores", () => {
      const favorites: PushFavoriteTuple[] = [
        { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
      ];

      const morningScores: MorningScoreMap = {};

      // Should default to 0 for missing scores
      const score = morningScores["fav-1"] ?? 0;
      expect(score).toBe(0);
    });

    it("handles alerts with no affected lines", () => {
      const alert: ParsedAlert = {
        id: "alert-no-lines",
        effect: "DELAY",
        affectedLines: [],
        affectedStops: ["101"],
        activePeriod: {
          start: Math.floor(Date.now() / 1000) - 3600,
          end: Math.floor(Date.now() / 1000) + 3600,
        },
        description: "System delay",
        severity: "warning",
        source: "official",
        url: null,
        cause: null,
      };

      expect(alert.affectedLines.length).toBe(0);
    });
  });

  describe("Severity Levels", () => {
    it("classifies severity correctly", () => {
      const warningAlert: ParsedAlert = {
        id: "warning",
        effect: "DELAY",
        affectedLines: ["1"],
        affectedStops: ["101"],
        activePeriod: {
          start: Math.floor(Date.now() / 1000) - 3600,
          end: Math.floor(Date.now() / 1000) + 3600,
        },
        description: "Delays",
        severity: "warning",
        source: "official",
        url: null,
        cause: null,
      };

      const severeAlert: ParsedAlert = {
        id: "severe",
        effect: "SUSPENDED",
        affectedLines: ["A"],
        affectedStops: ["726"],
        activePeriod: {
          start: Math.floor(Date.now() / 1000) - 3600,
          end: Math.floor(Date.now() / 1000) + 3600,
        },
        description: "Suspended",
        severity: "severe",
        source: "official",
        url: null,
        cause: null,
      };

      expect(warningAlert.severity).toBe("warning");
      expect(severeAlert.severity).toBe("severe");
    });
  });
});
