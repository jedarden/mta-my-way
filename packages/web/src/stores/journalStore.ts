import type { CommuteStats, TripRecord } from "@mta-my-way/shared";
/**
 * journalStore — Commute journal with anomaly detection
 *
 * Stores trip records per commute with automatic stats computation.
 * - Rolling statistics: average, median, stdDev
 * - Day-of-week segmented stats
 * - Anomaly detection: duration > mean + 1.5*stdDev
 *
 * Persisted key: "mta-journal"
 */
import { create } from "zustand";
import { type PersistOptions, createJSONStorage, persist } from "zustand/middleware";
import { createSafeMigration, setMigrationFailed } from "./migration";

/** Stats segmented by day of week (0 = Sunday, 6 = Saturday) */
export interface DayOfWeekStats {
  averageDurationMinutes: number;
  medianDurationMinutes: number;
  stdDevMinutes: number;
  sampleCount: number;
}

/** Anomaly detection result */
export interface AnomalyResult {
  isAnomaly: boolean;
  deviationMinutes: number;
  baselineMinutes: number;
  thresholdMinutes: number;
}

/** Station visit for inferred trip detection */
export interface StationVisit {
  stationId: string;
  stationName: string;
  lines: string[];
  timestamp: number;
}

interface JournalState {
  /** Trip records keyed by commuteId, with computed stats */
  stats: Record<string, CommuteStats>;
  /** Day-of-week segmented stats for finer-grained anomaly detection */
  dayOfWeekStats: Record<string, Record<number, DayOfWeekStats>>;
  /** Last station visit for inferred trip detection (not persisted) */
  lastStationVisit: StationVisit | null;

  // Actions
  setCommuteStats: (commuteId: string, stats: CommuteStats) => void;
  addTripRecord: (commuteId: string, record: TripRecord) => void;
  updateTripRecord: (commuteId: string, recordId: string, updates: Partial<TripRecord>) => void;
  removeTripRecord: (commuteId: string, recordId: string) => void;
  removeCommuteStats: (commuteId: string) => void;
  clearJournal: () => void;

  // Anomaly detection
  detectAnomaly: (
    commuteId: string,
    durationMinutes: number,
    dayOfWeek?: number
  ) => AnomalyResult | null;
  getDayOfWeekStats: (commuteId: string, dayOfWeek: number) => DayOfWeekStats | null;

  // Station visit tracking
  recordStationVisit: (
    stationId: string,
    stationName: string,
    lines: string[]
  ) => StationVisit | null;
  getLastStationVisit: () => StationVisit | null;
  clearLastStationVisit: () => void;
}

/** Maximum trip records per commute (FIFO cap, last 90 days) */
const MAX_RECORDS_PER_COMMUTE = 500;

/** Anomaly threshold multiplier (duration > mean + ANOMALY_THRESHOLD * stdDev) */
const ANOMALY_THRESHOLD = 1.5;

/** Minimum samples needed before anomaly detection kicks in */
const MIN_SAMPLES_FOR_ANOMALY = 3;

// ---------------------------------------------------------------------------
// Stats computation helpers
// ---------------------------------------------------------------------------

function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function calculateStdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
}

/** Compute stats from trip records */
function computeStats(records: TripRecord[]): {
  average: number;
  median: number;
  stdDev: number;
  tripsThisWeek: number;
  trend: number;
  averageDelayMinutes: number;
  maxDelayMinutes: number;
  onTimePercentage: number;
} {
  if (records.length === 0) {
    return {
      average: 0,
      median: 0,
      stdDev: 0,
      tripsThisWeek: 0,
      trend: 0,
      averageDelayMinutes: 0,
      maxDelayMinutes: 0,
      onTimePercentage: 0,
    };
  }

  const durations = records.map((r) => r.actualDurationMinutes);
  const average = calculateMean(durations);
  const median = calculateMedian(durations);
  const stdDev = calculateStdDev(durations, average);

  // Count trips this week
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Start of this week (Sunday)
  weekStart.setHours(0, 0, 0, 0);
  const weekStartTs = weekStart.getTime();

  const tripsThisWeek = records.filter((r) => new Date(r.date).getTime() >= weekStartTs).length;

  // Calculate trend: % change vs prior 4-week average
  let trend = 0;
  const fourWeeksAgo = new Date(now);
  fourWeeksAgo.setDate(now.getDate() - 28);
  fourWeeksAgo.setHours(0, 0, 0, 0);
  const fourWeeksAgoTs = fourWeeksAgo.getTime();

  const recentRecords = records.filter((r) => new Date(r.date).getTime() >= fourWeeksAgoTs);
  const olderRecords = records.filter((r) => new Date(r.date).getTime() < fourWeeksAgoTs);

  if (olderRecords.length >= 3 && recentRecords.length >= 3) {
    const recentAvg = calculateMean(recentRecords.map((r) => r.actualDurationMinutes));
    const olderAvg = calculateMean(olderRecords.map((r) => r.actualDurationMinutes));
    if (olderAvg > 0) {
      trend = Math.round(((recentAvg - olderAvg) / olderAvg) * 100);
    }
  }

  // Calculate delay statistics
  const recordsWithSchedule = records.filter((r) => r.scheduledDurationMinutes !== undefined);
  const delays = recordsWithSchedule.map(
    (r) => r.actualDurationMinutes - (r.scheduledDurationMinutes ?? 0)
  );
  const averageDelayMinutes = delays.length > 0 ? calculateMean(delays) : 0;
  const maxDelayMinutes = delays.length > 0 ? Math.max(...delays) : 0;

  // On-time percentage (within 2 minutes of schedule)
  const onTimeCount = delays.filter((d) => Math.abs(d) <= 2).length;
  const onTimePercentage =
    recordsWithSchedule.length > 0
      ? Math.round((onTimeCount / recordsWithSchedule.length) * 100)
      : 0;

  return {
    average,
    median,
    stdDev,
    tripsThisWeek,
    trend,
    averageDelayMinutes,
    maxDelayMinutes,
    onTimePercentage,
  };
}

/** Compute day-of-week segmented stats */
function computeDayOfWeekStats(records: TripRecord[]): Record<number, DayOfWeekStats> {
  const byDay: Record<number, number[]> = {};
  for (let i = 0; i <= 6; i++) byDay[i] = [];

  for (const record of records) {
    const dow = new Date(record.date).getDay();
    byDay[dow]?.push(record.actualDurationMinutes);
  }

  const result: Record<number, DayOfWeekStats> = {};
  for (let i = 0; i <= 6; i++) {
    const durations = byDay[i] ?? [];
    const average = calculateMean(durations);
    result[i] = {
      averageDurationMinutes: average,
      medianDurationMinutes: calculateMedian(durations),
      stdDevMinutes: calculateStdDev(durations, average),
      sampleCount: durations.length,
    };
  }

  return result;
}

/** Detect if a duration is anomalous for the given commute */
function detectAnomalyImpl(
  stats: CommuteStats | undefined,
  dayStats: Record<number, DayOfWeekStats> | undefined,
  durationMinutes: number,
  dayOfWeek?: number
): AnomalyResult | null {
  if (!stats || stats.records.length < MIN_SAMPLES_FOR_ANOMALY) {
    return null;
  }

  // Try day-of-week specific stats first, fall back to overall stats
  let baseline: number;
  let threshold: number;

  if (
    dayOfWeek !== undefined &&
    dayStats?.[dayOfWeek] &&
    dayStats[dayOfWeek].sampleCount >= MIN_SAMPLES_FOR_ANOMALY
  ) {
    const dow = dayStats[dayOfWeek]!;
    baseline = dow.averageDurationMinutes;
    threshold = baseline + ANOMALY_THRESHOLD * dow.stdDevMinutes;
  } else {
    baseline = stats.averageDurationMinutes;
    threshold = baseline + ANOMALY_THRESHOLD * stats.stdDevMinutes;
  }

  const deviationMinutes = durationMinutes - baseline;
  const isAnomaly = durationMinutes > threshold;

  return {
    isAnomaly,
    deviationMinutes: Math.round(deviationMinutes),
    baselineMinutes: Math.round(baseline),
    thresholdMinutes: Math.round(threshold),
  };
}

/** Current schema version for this store */
const STORE_VERSION = 3;

/** Migration functions keyed by target version */
const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
  // Version 2: Add dayOfWeekStats field and recompute stats for existing records
  [
    2,
    (state: unknown): JournalState => {
      const prev = state as Partial<JournalState>;
      const dayOfWeekStats: Record<string, Record<number, DayOfWeekStats>> = {};

      // Recompute stats for each commute with updated calculations
      if (prev.stats) {
        for (const [commuteId, commuteStats] of Object.entries(prev.stats)) {
          if (commuteStats?.records?.length) {
            dayOfWeekStats[commuteId] = computeDayOfWeekStats(commuteStats.records);

            // Update stats with new computation
            const {
              average,
              median,
              stdDev,
              tripsThisWeek,
              trend,
              averageDelayMinutes,
              maxDelayMinutes,
              onTimePercentage,
            } = computeStats(commuteStats.records);
            commuteStats.averageDurationMinutes = average;
            commuteStats.medianDurationMinutes = median;
            commuteStats.stdDevMinutes = stdDev;
            commuteStats.tripsThisWeek = tripsThisWeek;
            commuteStats.trend = trend;
            commuteStats.averageDelayMinutes = averageDelayMinutes;
            commuteStats.maxDelayMinutes = maxDelayMinutes;
            commuteStats.onTimePercentage = onTimePercentage;
          }
        }
      }

      return { ...prev, dayOfWeekStats } as JournalState;
    },
  ],
  // Version 3: Add delay statistics (averageDelayMinutes, maxDelayMinutes, onTimePercentage)
  [
    3,
    (state: unknown): JournalState => {
      const prev = state as Partial<JournalState>;

      // Recompute stats for each commute with new delay calculations
      if (prev.stats) {
        for (const [, commuteStats] of Object.entries(prev.stats)) {
          if (commuteStats?.records?.length) {
            const {
              average,
              median,
              stdDev,
              tripsThisWeek,
              trend,
              averageDelayMinutes,
              maxDelayMinutes,
              onTimePercentage,
            } = computeStats(commuteStats.records);
            commuteStats.averageDurationMinutes = average;
            commuteStats.medianDurationMinutes = median;
            commuteStats.stdDevMinutes = stdDev;
            commuteStats.tripsThisWeek = tripsThisWeek;
            commuteStats.trend = trend;
            commuteStats.averageDelayMinutes = averageDelayMinutes;
            commuteStats.maxDelayMinutes = maxDelayMinutes;
            commuteStats.onTimePercentage = onTimePercentage;
          } else {
            // Initialize new fields for commutes with no records
            commuteStats.averageDelayMinutes = 0;
            commuteStats.maxDelayMinutes = 0;
            commuteStats.onTimePercentage = 0;
          }
        }
      }

      return prev as JournalState;
    },
  ],
]);

const persistConfig: PersistOptions<JournalState> = {
  name: "mta-journal",
  storage: createJSONStorage(() => localStorage),
  version: STORE_VERSION,
  migrate: createSafeMigration<JournalState>("journal", STORE_VERSION, migrations),
  onRehydrateStorage: () => (_state, error) => {
    if (error) {
      console.error("[journalStore] Rehydration failed:", error);
      setMigrationFailed();
    }
  },
};

export const useJournalStore = create<JournalState>()(
  persist(
    (set, get) => ({
      stats: {},
      dayOfWeekStats: {},
      lastStationVisit: null, // Not persisted - only in-memory

      setCommuteStats: (commuteId, stats) => {
        const dayStats = computeDayOfWeekStats(stats.records);
        set((state) => ({
          stats: { ...state.stats, [commuteId]: stats },
          dayOfWeekStats: { ...state.dayOfWeekStats, [commuteId]: dayStats },
        }));
      },

      addTripRecord: (commuteId, record) => {
        set((state) => {
          const existing = state.stats[commuteId];
          let records: TripRecord[];

          if (!existing) {
            records = [record];
          } else {
            // Append and enforce FIFO cap
            records = [...existing.records, record];
            if (records.length > MAX_RECORDS_PER_COMMUTE) {
              records.shift();
            }
          }

          // Recompute stats
          const {
            average,
            median,
            stdDev,
            tripsThisWeek,
            trend,
            averageDelayMinutes,
            maxDelayMinutes,
            onTimePercentage,
          } = computeStats(records);
          const dayStats = computeDayOfWeekStats(records);

          const newStats: CommuteStats = {
            commuteId,
            averageDurationMinutes: average,
            medianDurationMinutes: median,
            stdDevMinutes: stdDev,
            totalTrips: records.length,
            tripsThisWeek,
            trend,
            averageDelayMinutes,
            maxDelayMinutes,
            onTimePercentage,
            records,
          };

          return {
            stats: { ...state.stats, [commuteId]: newStats },
            dayOfWeekStats: { ...state.dayOfWeekStats, [commuteId]: dayStats },
          };
        });
      },

      updateTripRecord: (commuteId, recordId, updates) => {
        set((state) => {
          const existing = state.stats[commuteId];
          if (!existing) return state;

          const records = existing.records.map((r) =>
            r.id === recordId ? { ...r, ...updates } : r
          );

          if (records === existing.records) return state;

          const {
            average,
            median,
            stdDev,
            tripsThisWeek,
            trend,
            averageDelayMinutes,
            maxDelayMinutes,
            onTimePercentage,
          } = computeStats(records);
          const dayStats = computeDayOfWeekStats(records);

          const newStats: CommuteStats = {
            ...existing,
            averageDurationMinutes: average,
            medianDurationMinutes: median,
            stdDevMinutes: stdDev,
            totalTrips: records.length,
            tripsThisWeek,
            trend,
            averageDelayMinutes,
            maxDelayMinutes,
            onTimePercentage,
            records,
          };

          return {
            stats: { ...state.stats, [commuteId]: newStats },
            dayOfWeekStats: { ...state.dayOfWeekStats, [commuteId]: dayStats },
          };
        });
      },

      removeTripRecord: (commuteId, recordId) => {
        set((state) => {
          const existing = state.stats[commuteId];
          if (!existing) return state;

          const records = existing.records.filter((r) => r.id !== recordId);
          if (records.length === existing.records.length) return state;

          const {
            average,
            median,
            stdDev,
            tripsThisWeek,
            trend,
            averageDelayMinutes,
            maxDelayMinutes,
            onTimePercentage,
          } = computeStats(records);
          const dayStats = computeDayOfWeekStats(records);

          const newStats: CommuteStats = {
            ...existing,
            averageDurationMinutes: average,
            medianDurationMinutes: median,
            stdDevMinutes: stdDev,
            totalTrips: records.length,
            tripsThisWeek,
            trend,
            averageDelayMinutes,
            maxDelayMinutes,
            onTimePercentage,
            records,
          };

          return {
            stats: { ...state.stats, [commuteId]: newStats },
            dayOfWeekStats: { ...state.dayOfWeekStats, [commuteId]: dayStats },
          };
        });
      },

      removeCommuteStats: (commuteId) => {
        set((state) => {
          const nextStats = { ...state.stats };
          delete nextStats[commuteId];
          const nextDayStats = { ...state.dayOfWeekStats };
          delete nextDayStats[commuteId];
          return { stats: nextStats, dayOfWeekStats: nextDayStats };
        });
      },

      clearJournal: () => {
        set({ stats: {}, dayOfWeekStats: {}, lastStationVisit: null });
      },

      detectAnomaly: (commuteId, durationMinutes, dayOfWeek) => {
        const state = get();
        return detectAnomalyImpl(
          state.stats[commuteId],
          state.dayOfWeekStats[commuteId],
          durationMinutes,
          dayOfWeek
        );
      },

      getDayOfWeekStats: (commuteId, dayOfWeek) => {
        return get().dayOfWeekStats[commuteId]?.[dayOfWeek] ?? null;
      },

      recordStationVisit: (stationId, stationName, lines) => {
        const lastVisit = get().lastStationVisit;
        const visit: StationVisit = {
          stationId,
          stationName,
          lines,
          timestamp: Date.now(),
        };
        set({ lastStationVisit: visit });
        return lastVisit;
      },

      getLastStationVisit: () => {
        return get().lastStationVisit;
      },

      clearLastStationVisit: () => {
        set({ lastStationVisit: null });
      },
    }),
    persistConfig
  )
);
