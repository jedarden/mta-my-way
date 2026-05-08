/**
 * Unit tests for journalStore
 *
 * Tests commute journal with anomaly detection and stats computation.
 */

import type { CommuteStats, TripRecord } from "@mta-my-way/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the migration module
vi.mock("./migration", () => ({
  createSafeMigration: vi.fn(() => (state: unknown, _version: number) => state),
  setMigrationFailed: vi.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

/** Helper to create a complete TripRecord with required fields defaulted */
function makeTripRecord(
  overrides: Partial<TripRecord> & Pick<TripRecord, "id" | "date" | "actualDurationMinutes">
): TripRecord {
  return {
    origin: { stationId: "A27", stationName: "Times Sq-42 St" },
    destination: { stationId: "631", stationName: "Grand Central-42 St" },
    line: "7",
    departureTime: 1700000000000,
    arrivalTime: 1700000600000,
    source: "manual" as const,
    ...overrides,
  };
}

describe("journalStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    // Reset the module to get a fresh store
    vi.resetModules();
  });

  describe("initial state", () => {
    it("initializes with empty stats", async () => {
      const { useJournalStore } = await import("./journalStore");
      const state = useJournalStore.getState();

      expect(state.stats).toEqual({});
      expect(state.dayOfWeekStats).toEqual({});
      expect(state.lastStationVisit).toBeNull();
    });
  });

  describe("setCommuteStats", () => {
    it("sets stats for a commute", async () => {
      const { useJournalStore } = await import("./journalStore");

      const stats: CommuteStats = {
        commuteId: "work",
        averageDurationMinutes: 30,
        medianDurationMinutes: 29,
        stdDevMinutes: 5,
        totalTrips: 10,
        tripsThisWeek: 2,
        trend: 5,
        averageDelayMinutes: 2,
        maxDelayMinutes: 10,
        onTimePercentage: 80,
        records: [],
      };

      useJournalStore.getState().setCommuteStats("work", stats);

      const state = useJournalStore.getState();
      expect(state.stats["work"]!).toEqual(stats);
    });

    it("computes day-of-week stats from records", async () => {
      const { useJournalStore } = await import("./journalStore");

      const now = new Date();
      const records: TripRecord[] = [
        makeTripRecord({
          id: "1",
          date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          actualDurationMinutes: 30,
          scheduledDurationMinutes: 28,
        }),
        makeTripRecord({
          id: "2",
          date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
          actualDurationMinutes: 32,
          scheduledDurationMinutes: 30,
        }),
      ];

      const stats: CommuteStats = {
        commuteId: "work",
        averageDurationMinutes: 31,
        medianDurationMinutes: 31,
        stdDevMinutes: 1,
        totalTrips: 2,
        tripsThisWeek: 2,
        trend: 0,
        averageDelayMinutes: 2,
        maxDelayMinutes: 2,
        onTimePercentage: 100,
        records,
      };

      useJournalStore.getState().setCommuteStats("work", stats);

      const state = useJournalStore.getState();
      expect(state.dayOfWeekStats["work"]).toBeDefined();
    });
  });

  describe("addTripRecord", () => {
    it("adds a trip record to a commute", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
        scheduledDurationMinutes: 28,
      });

      useJournalStore.getState().addTripRecord("work", record);

      const state = useJournalStore.getState();
      expect(state.stats["work"]!).toBeDefined();
      expect(state.stats["work"]!.records).toHaveLength(1);
      expect(state.stats["work"]!.records[0]).toEqual(record);
    });

    it("computes stats from records", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
        scheduledDurationMinutes: 28,
      });

      useJournalStore.getState().addTripRecord("work", record);

      const state = useJournalStore.getState();
      const stats = state.stats["work"]!;

      expect(stats.averageDurationMinutes).toBe(30);
      expect(stats.medianDurationMinutes).toBe(30);
      expect(stats.totalTrips).toBe(1);
    });

    it("enforces FIFO cap on records", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add more than MAX_RECORDS_PER_COMMUTE entries
      for (let i = 0; i < 510; i++) {
        const record = makeTripRecord({
          id: `trip-${i}`,
          date: new Date().toISOString(),
          actualDurationMinutes: 30,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      const state = useJournalStore.getState();
      // Should be capped at 500
      expect(state.stats["work"]!.records.length).toBeLessThanOrEqual(500);
    });

    it("computes day-of-week stats", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
      });

      useJournalStore.getState().addTripRecord("work", record);

      const state = useJournalStore.getState();
      expect(state.dayOfWeekStats["work"]).toBeDefined();
    });
  });

  describe("updateTripRecord", () => {
    it("updates an existing trip record", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
        scheduledDurationMinutes: 28,
      });

      useJournalStore.getState().addTripRecord("work", record);

      useJournalStore.getState().updateTripRecord("work", "trip-1", {
        actualDurationMinutes: 35,
      });

      const state = useJournalStore.getState();
      const updatedRecord = state.stats["work"]!.records.find((r) => r.id === "trip-1");

      expect(updatedRecord?.actualDurationMinutes).toBe(35);
    });

    it("recalculates stats after update", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
        scheduledDurationMinutes: 28,
      });

      useJournalStore.getState().addTripRecord("work", record);

      useJournalStore.getState().updateTripRecord("work", "trip-1", {
        actualDurationMinutes: 40,
      });

      const afterState = useJournalStore.getState();
      expect(afterState.stats["work"]!.averageDurationMinutes).toBe(40);
    });

    it("does nothing if record not found", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
      });

      useJournalStore.getState().addTripRecord("work", record);

      const beforeState = JSON.stringify(useJournalStore.getState().stats["work"]);

      useJournalStore.getState().updateTripRecord("work", "nonexistent", {
        actualDurationMinutes: 40,
      });

      const afterState = JSON.stringify(useJournalStore.getState().stats["work"]);
      expect(beforeState).toBe(afterState);
    });
  });

  describe("removeTripRecord", () => {
    it("removes a trip record", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
      });

      useJournalStore.getState().addTripRecord("work", record);
      expect(useJournalStore.getState().stats["work"]!.records).toHaveLength(1);

      useJournalStore.getState().removeTripRecord("work", "trip-1");

      const state = useJournalStore.getState();
      expect(state.stats["work"]!.records).toHaveLength(0);
    });

    it("recalculates stats after removal", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record1 = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
      });

      const record2 = makeTripRecord({
        id: "trip-2",
        date: new Date().toISOString(),
        actualDurationMinutes: 40,
      });

      useJournalStore.getState().addTripRecord("work", record1);
      useJournalStore.getState().addTripRecord("work", record2);

      expect(useJournalStore.getState().stats["work"]!.averageDurationMinutes).toBe(35);

      useJournalStore.getState().removeTripRecord("work", "trip-1");

      const state = useJournalStore.getState();
      expect(state.stats["work"]!.averageDurationMinutes).toBe(40);
    });
  });

  describe("removeCommuteStats", () => {
    it("removes stats for a commute", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
      });

      useJournalStore.getState().addTripRecord("work", record);
      expect(useJournalStore.getState().stats["work"]).toBeDefined();

      useJournalStore.getState().removeCommuteStats("work");

      const state = useJournalStore.getState();
      expect(state.stats["work"]).toBeUndefined();
      expect(state.dayOfWeekStats["work"]).toBeUndefined();
    });
  });

  describe("clearJournal", () => {
    it("clears all stats", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
      });

      useJournalStore.getState().addTripRecord("work", record);
      expect(Object.keys(useJournalStore.getState().stats).length).toBeGreaterThan(0);

      useJournalStore.getState().clearJournal();

      const state = useJournalStore.getState();
      expect(state.stats).toEqual({});
      expect(state.dayOfWeekStats).toEqual({});
      expect(state.lastStationVisit).toBeNull();
    });
  });

  describe("detectAnomaly", () => {
    it("returns null for commute with no records", async () => {
      const { useJournalStore } = await import("./journalStore");

      const result = useJournalStore.getState().detectAnomaly("work", 45);

      expect(result).toBeNull();
    });

    it("returns null for commute with insufficient records", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add only 2 records (less than MIN_SAMPLES_FOR_ANOMALY)
      for (let i = 0; i < 2; i++) {
        const record = makeTripRecord({
          id: `trip-${i}`,
          date: new Date().toISOString(),
          actualDurationMinutes: 30,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      const result = useJournalStore.getState().detectAnomaly("work", 45);

      expect(result).toBeNull();
    });

    it("detects anomaly when duration exceeds threshold", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add records with average around 30 minutes, low std dev
      for (let i = 0; i < 5; i++) {
        const record = makeTripRecord({
          id: `trip-${i}`,
          date: new Date().toISOString(),
          actualDurationMinutes: 30 + i * 2, // 30, 32, 34, 36, 38
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      // A duration of 60 minutes should be anomalous
      const result = useJournalStore.getState().detectAnomaly("work", 60);

      expect(result).not.toBeNull();
      expect(result?.isAnomaly).toBe(true);
      expect(result?.deviationMinutes).toBeGreaterThan(0);
    });

    it("does not detect anomaly for normal duration", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add records with some variance around 30 minutes
      const durations = [28, 29, 30, 31, 32]; // average = 30
      for (let i = 0; i < durations.length; i++) {
        const record = makeTripRecord({
          id: `trip-${i}`,
          date: new Date().toISOString(),
          actualDurationMinutes: durations[i]!,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      // A duration of 31 minutes should not be anomalous (within normal variance)
      const result = useJournalStore.getState().detectAnomaly("work", 31);

      expect(result?.isAnomaly).toBe(false);
    });

    it("uses day-of-week stats when available", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add records for Monday (day 1)
      const monday = new Date();
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + 1); // Set to Monday

      for (let i = 0; i < 5; i++) {
        const recordDate = new Date(monday);
        recordDate.setDate(recordDate.getDate() - i * 7); // Previous Mondays

        const record = makeTripRecord({
          id: `trip-${i}`,
          date: recordDate.toISOString(),
          actualDurationMinutes: 30,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      // Check anomaly for Monday
      const result = useJournalStore.getState().detectAnomaly("work", 45, 1);

      expect(result).not.toBeNull();
    });
  });

  describe("getDayOfWeekStats", () => {
    it("returns null for non-existent commute", async () => {
      const { useJournalStore } = await import("./journalStore");

      const result = useJournalStore.getState().getDayOfWeekStats("work", 1);

      expect(result).toBeNull();
    });

    it("returns null for commute with no day-of-week stats", async () => {
      const { useJournalStore } = await import("./journalStore");

      const record = makeTripRecord({
        id: "trip-1",
        date: new Date().toISOString(),
        actualDurationMinutes: 30,
      });

      useJournalStore.getState().addTripRecord("work", record);

      // Day 6 (Saturday) might not have stats
      const result = useJournalStore.getState().getDayOfWeekStats("work", 6);

      // Result could be null or have sampleCount of 0
      expect(result === null || result?.sampleCount === 0).toBe(true);
    });

    it("returns stats for specific day of week", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add records for the same day of week
      const now = new Date();
      const dayOfWeek = now.getDay();

      for (let i = 0; i < 3; i++) {
        const recordDate = new Date(now);
        recordDate.setDate(recordDate.getDate() - i * 7); // Same day, previous weeks

        const record = makeTripRecord({
          id: `trip-${i}`,
          date: recordDate.toISOString(),
          actualDurationMinutes: 30,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      const result = useJournalStore.getState().getDayOfWeekStats("work", dayOfWeek);

      expect(result).not.toBeNull();
      expect(result?.sampleCount).toBeGreaterThanOrEqual(3);
      expect(result?.averageDurationMinutes).toBeDefined();
    });
  });

  describe("station visit tracking", () => {
    it("records station visit", async () => {
      const { useJournalStore } = await import("./journalStore");

      useJournalStore.getState().recordStationVisit("101", "South Ferry", ["1"]);

      const state = useJournalStore.getState();
      expect(state.lastStationVisit).toEqual({
        stationId: "101",
        stationName: "South Ferry",
        lines: ["1"],
        timestamp: expect.any(Number),
      });
    });

    it("returns previous visit when recording new one", async () => {
      const { useJournalStore } = await import("./journalStore");

      useJournalStore.getState().recordStationVisit("101", "South Ferry", ["1"]);

      const previousVisit = useJournalStore
        .getState()
        .recordStationVisit("102", "Rector St", ["1"]);

      expect(previousVisit).toEqual({
        stationId: "101",
        stationName: "South Ferry",
        lines: ["1"],
        timestamp: expect.any(Number),
      });
    });

    it("returns null on first visit", async () => {
      const { useJournalStore } = await import("./journalStore");

      const visit = useJournalStore.getState().recordStationVisit("101", "South Ferry", ["1"]);

      expect(visit).toBeNull();
    });

    it("gets last station visit", async () => {
      const { useJournalStore } = await import("./journalStore");

      useJournalStore.getState().recordStationVisit("101", "South Ferry", ["1"]);

      const visit = useJournalStore.getState().getLastStationVisit();

      expect(visit).toEqual({
        stationId: "101",
        stationName: "South Ferry",
        lines: ["1"],
        timestamp: expect.any(Number),
      });
    });

    it("clears last station visit", async () => {
      const { useJournalStore } = await import("./journalStore");

      useJournalStore.getState().recordStationVisit("101", "South Ferry", ["1"]);
      expect(useJournalStore.getState().lastStationVisit).not.toBeNull();

      useJournalStore.getState().clearLastStationVisit();

      expect(useJournalStore.getState().lastStationVisit).toBeNull();
    });
  });

  describe("stats computation", () => {
    it("calculates median correctly", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add records with durations: 20, 30, 40, 50, 60
      const durations = [20, 30, 40, 50, 60];
      for (const duration of durations) {
        const record = makeTripRecord({
          id: `trip-${duration}`,
          date: new Date().toISOString(),
          actualDurationMinutes: duration,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      const state = useJournalStore.getState();
      // Median of [20, 30, 40, 50, 60] is 40
      expect(state.stats["work"]!.medianDurationMinutes).toBe(40);
    });

    it("calculates median for even number of records", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add records with durations: 20, 30, 40, 50
      const durations = [20, 30, 40, 50];
      for (const duration of durations) {
        const record = makeTripRecord({
          id: `trip-${duration}`,
          date: new Date().toISOString(),
          actualDurationMinutes: duration,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      const state = useJournalStore.getState();
      // Median of [20, 30, 40, 50] is (30 + 40) / 2 = 35
      expect(state.stats["work"]!.medianDurationMinutes).toBe(35);
    });

    it("counts trips this week correctly", async () => {
      const { useJournalStore } = await import("./journalStore");

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);

      // Add a trip from today (should count)
      const todayRecord = makeTripRecord({
        id: "trip-today",
        date: now.toISOString(),
        actualDurationMinutes: 30,
      });
      useJournalStore.getState().addTripRecord("work", todayRecord);

      // Add a trip from last week (should not count)
      const lastWeekRecord = makeTripRecord({
        id: "trip-lastweek",
        date: new Date(weekStart.getTime() - 1000).toISOString(),
        actualDurationMinutes: 30,
      });
      useJournalStore.getState().addTripRecord("work", lastWeekRecord);

      const state = useJournalStore.getState();
      expect(state.stats["work"]!.tripsThisWeek).toBe(1);
    });

    it("calculates trend correctly", async () => {
      const { useJournalStore } = await import("./journalStore");

      const now = new Date();

      // Add older records (slower)
      for (let i = 0; i < 5; i++) {
        const recordDate = new Date(now);
        recordDate.setDate(recordDate.getDate() - 30 - i); // ~30 days ago

        const record = makeTripRecord({
          id: `trip-old-${i}`,
          date: recordDate.toISOString(),
          actualDurationMinutes: 40,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      // Add recent records (faster)
      for (let i = 0; i < 5; i++) {
        const recordDate = new Date(now);
        recordDate.setDate(recordDate.getDate() - i); // Recent days

        const record = makeTripRecord({
          id: `trip-new-${i}`,
          date: recordDate.toISOString(),
          actualDurationMinutes: 25,
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      const state = useJournalStore.getState();
      // Trend should be negative (getting faster)
      expect(state.stats["work"]!.trend).toBeLessThan(0);
    });

    it("calculates delay statistics", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add records with scheduled times
      for (let i = 0; i < 5; i++) {
        const record = makeTripRecord({
          id: `trip-${i}`,
          date: new Date().toISOString(),
          actualDurationMinutes: 32,
          scheduledDurationMinutes: 30, // 2 minute delay
        });
        useJournalStore.getState().addTripRecord("work", record);
      }

      const state = useJournalStore.getState();
      expect(state.stats["work"]!.averageDelayMinutes).toBe(2);
      expect(state.stats["work"]!.maxDelayMinutes).toBe(2);
      expect(state.stats["work"]!.onTimePercentage).toBe(100); // Within 2 min
    });

    it("calculates on-time percentage correctly", async () => {
      const { useJournalStore } = await import("./journalStore");

      // Add some on-time, some delayed
      const records: TripRecord[] = [
        makeTripRecord({
          id: "trip-1",
          date: new Date().toISOString(),
          actualDurationMinutes: 30,
          scheduledDurationMinutes: 30, // On time
        }),
        makeTripRecord({
          id: "trip-2",
          date: new Date().toISOString(),
          actualDurationMinutes: 31,
          scheduledDurationMinutes: 30, // 1 min late - on time
        }),
        makeTripRecord({
          id: "trip-3",
          date: new Date().toISOString(),
          actualDurationMinutes: 33,
          scheduledDurationMinutes: 30, // 3 min late - late
        }),
      ];

      for (const record of records) {
        useJournalStore.getState().addTripRecord("work", record);
      }

      const state = useJournalStore.getState();
      // 2 out of 3 on time = 67%
      expect(state.stats["work"]!.onTimePercentage).toBe(67);
    });
  });
});
