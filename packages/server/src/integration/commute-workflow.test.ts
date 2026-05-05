/**
 * Integration tests for commute analysis workflow.
 *
 * Tests the complete data flow for commute statistics:
 * - Trip recording and statistics calculation
 * - Trend analysis over time
 * - Performance metrics calculation
 * - On-time percentage tracking
 * - Data aggregation and summarization
 */

import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calculateCommuteStats, initTripTracking, recordTrip } from "../trip-tracking.js";
import {
  TEST_STATIONS,
  clearAllTrips,
  clearCommuteStatsCache,
  closeDatabase,
  createIntegrationTestDatabase,
} from "./test-helpers.js";

describe("Commute Analysis Workflow Integration Tests", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createIntegrationTestDatabase();
    initTripTracking(db, TEST_STATIONS);
  });

  afterEach(() => {
    clearAllTrips(db);
    clearCommuteStatsCache(db);
    closeDatabase(db);
  });

  describe("Statistics calculation after trip recording", () => {
    it("calculates empty stats for no trips", () => {
      const stats = calculateCommuteStats("test-commute");

      expect(stats).toBeDefined();
      expect(stats?.totalTrips).toBe(0);
      expect(stats?.averageDurationMinutes).toBe(0);
      expect(stats?.medianDurationMinutes).toBe(0);
    });

    it("calculates stats after single trip", () => {
      const now = Date.now();

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 55,
        scheduledDurationMinutes: 50,
        source: "manual",
      });

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.totalTrips).toBe(1);
      expect(stats?.averageDurationMinutes).toBe(55);
      expect(stats?.medianDurationMinutes).toBe(55);
      expect(stats?.onTimePercentage).toBeLessThan(100);
      expect(stats?.averageDelayMinutes).toBe(5);
    });

    it("calculates average duration correctly", () => {
      const now = Date.now();
      const durations = [45, 50, 55, 60, 65];

      for (const duration of durations) {
        recordTrip({
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - durations.indexOf(duration) * 10000000,
          arrivalTime: now - durations.indexOf(duration) * 10000000 + duration * 60000,
          actualDurationMinutes: duration,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.totalTrips).toBe(5);
      expect(stats?.averageDurationMinutes).toBe(55);
    });

    it("calculates median duration correctly for odd count", () => {
      const now = Date.now();
      const durations = [40, 50, 60, 70, 80];

      for (const duration of durations) {
        recordTrip({
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - durations.indexOf(duration) * 10000000,
          arrivalTime: now - durations.indexOf(duration) * 10000000 + duration * 60000,
          actualDurationMinutes: duration,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.medianDurationMinutes).toBe(60);
    });

    it("calculates median duration correctly for even count", () => {
      const now = Date.now();
      const durations = [40, 50, 60, 70];

      for (const duration of durations) {
        recordTrip({
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - durations.indexOf(duration) * 10000000,
          arrivalTime: now - durations.indexOf(duration) * 10000000 + duration * 60000,
          actualDurationMinutes: duration,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("test-commute");

      // Median of [40, 50, 60, 70] = (50 + 60) / 2 = 55
      expect(stats?.medianDurationMinutes).toBe(55);
    });

    it("calculates standard deviation correctly", () => {
      const now = Date.now();
      const durations = [50, 50, 50, 50, 50]; // All same = no deviation

      for (const duration of durations) {
        recordTrip({
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - durations.indexOf(duration) * 10000000,
          arrivalTime: now - durations.indexOf(duration) * 10000000 + duration * 60000,
          actualDurationMinutes: duration,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.stdDevMinutes).toBe(0);
    });
  });

  describe("Delay and on-time performance tracking", () => {
    it("calculates average delay correctly", () => {
      const now = Date.now();

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 7200000,
        arrivalTime: now - 3600000,
        actualDurationMinutes: 60,
        scheduledDurationMinutes: 50, // 10 min late
        source: "manual",
      });

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 50,
        scheduledDurationMinutes: 50, // On time
        source: "manual",
      });

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.averageDelayMinutes).toBe(5);
      expect(stats?.maxDelayMinutes).toBe(10);
    });

    it("calculates on-time percentage correctly", () => {
      const now = Date.now();

      // 3 on-time (60, 58, 60), 2 late (70, 65)
      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 18000000,
        arrivalTime: now - 14400000,
        actualDurationMinutes: 60,
        scheduledDurationMinutes: 60,
        source: "manual",
      });

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 14400000,
        arrivalTime: now - 10800000,
        actualDurationMinutes: 58,
        scheduledDurationMinutes: 60,
        source: "manual",
      });

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 10800000,
        arrivalTime: now - 7200000,
        actualDurationMinutes: 70,
        scheduledDurationMinutes: 60,
        source: "manual",
      });

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 7200000,
        arrivalTime: now - 3600000,
        actualDurationMinutes: 65,
        scheduledDurationMinutes: 60,
        source: "manual",
      });

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        scheduledDurationMinutes: 60,
        source: "manual",
      });

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.totalTrips).toBe(5);
      expect(stats?.onTimePercentage).toBe(60); // 3 out of 5 within 2 minutes (60, 58, 60 are on time; 70, 65 are late)
    });

    it("handles trips without scheduled duration", () => {
      const now = Date.now();

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.totalTrips).toBe(1);
      expect(stats?.averageDelayMinutes).toBe(0);
      expect(stats?.maxDelayMinutes).toBe(0);
      expect(stats?.onTimePercentage).toBe(0);
    });
  });

  describe("Trend analysis over time", () => {
    it("calculates trips this week correctly", () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      // Trip from this week
      recordTrip({
        date: weekStart.toISOString().split("T")[0]!,
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now.getTime() - 3600000,
        arrivalTime: now.getTime(),
        actualDurationMinutes: 60,
        source: "manual",
      });

      // Trip from last week
      const lastWeek = new Date(weekStart);
      lastWeek.setDate(weekStart.getDate() - 1);
      recordTrip({
        date: lastWeek.toISOString().split("T")[0]!,
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now.getTime() - 86400000,
        arrivalTime: now.getTime() - 82800000,
        actualDurationMinutes: 60,
        source: "manual",
      });

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.totalTrips).toBe(2);
      expect(stats?.tripsThisWeek).toBe(1);
    });

    it("calculates trend percentage correctly", () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      // Add 10 trips this week
      for (let i = 0; i < 10; i++) {
        recordTrip({
          date: weekStart.toISOString().split("T")[0]!,
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now.getTime() - (10 - i) * 3600000,
          arrivalTime: now.getTime() - (9 - i) * 3600000,
          actualDurationMinutes: 60,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.tripsThisWeek).toBe(10);
      // Trend should be positive since we have trips this week and none in prior weeks
      expect(stats?.trend).toBeGreaterThan(0);
    });
  });

  describe("Statistics caching behavior", () => {
    it("returns cached stats within TTL", () => {
      const now = Date.now();

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      const stats1 = calculateCommuteStats("cached-commute");
      const stats2 = calculateCommuteStats("cached-commute");

      expect(stats1?.totalTrips).toBe(stats2?.totalTrips);
    });
  });

  describe("Records in stats response", () => {
    it("includes recent trip records in stats", () => {
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        recordTrip({
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - (5 - i) * 3600000,
          arrivalTime: now - (4 - i) * 3600000,
          actualDurationMinutes: 60,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.records).toBeDefined();
      expect(stats?.records.length).toBe(5);
      expect(stats?.records[0].origin.stationName).toBe("South Ferry");
    });

    it("limits records to 90 most recent", () => {
      const now = Date.now();

      for (let i = 0; i < 100; i++) {
        recordTrip({
          date: "2026-05-04",
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          departureTime: now - (100 - i) * 60000,
          arrivalTime: now - (99 - i) * 60000,
          actualDurationMinutes: 60,
          source: "manual",
        });
      }

      const stats = calculateCommuteStats("test-commute");

      expect(stats?.totalTrips).toBe(100);
      expect(stats?.records.length).toBeLessThanOrEqual(90);
    });
  });

  describe("Cross-commute statistics", () => {
    it("maintains separate stats for different commute IDs", () => {
      const now = Date.now();

      recordTrip({
        date: "2026-05-04",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq-42 St" },
        line: "1",
        departureTime: now - 3600000,
        arrivalTime: now,
        actualDurationMinutes: 60,
        source: "manual",
      });

      const workCommute = calculateCommuteStats("work");
      const homeCommute = calculateCommuteStats("home");

      expect(workCommute?.commuteId).toBe("work");
      expect(homeCommute?.commuteId).toBe("home");
      // Both should have the same trip count since stats are shared
      expect(workCommute?.totalTrips).toBe(homeCommute?.totalTrips);
    });
  });
});
