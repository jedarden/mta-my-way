/**
 * journalStore — Phase 5 skeleton
 *
 * Stores the commute journal: trip records per commute and live trip state.
 * Schema v1 defined now so migrations are safe throughout the project lifecycle.
 *
 * Persisted key: "mta-journal"
 */
import { create } from "zustand";
import { persist, createJSONStorage, type PersistOptions } from "zustand/middleware";
import { createSafeMigration, setMigrationFailed } from "./migration";
import type { TripRecord, CommuteStats } from "@mta-my-way/shared";

interface JournalState {
  /**
   * Trip records keyed by commuteId.
   * Each entry holds up to 500 records (last 90 days, FIFO cap).
   */
  stats: Record<string, CommuteStats>;

  // Actions (Phase 5 will flesh these out)
  setCommuteStats: (commuteId: string, stats: CommuteStats) => void;
  addTripRecord: (commuteId: string, record: TripRecord) => void;
  removeTripRecord: (commuteId: string, recordId: string) => void;
  removeCommuteStats: (commuteId: string) => void;
  clearJournal: () => void;
}

/** Maximum trip records per commute (FIFO cap, last 90 days) */
const MAX_RECORDS_PER_COMMUTE = 500;

/** Current schema version for this store */
const STORE_VERSION = 1;

/** Migration functions keyed by target version */
const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
  // Future: [2]: (state) => ({ ...state as JournalState, newField: defaultValue }),
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

      setCommuteStats: (commuteId, stats) => {
        set((state) => ({
          stats: { ...state.stats, [commuteId]: stats },
        }));
      },

      addTripRecord: (commuteId, record) => {
        set((state) => {
          const existing = state.stats[commuteId];
          if (!existing) {
            // Bootstrap a minimal CommuteStats entry when none exists yet
            const newStats: CommuteStats = {
              commuteId,
              averageDurationMinutes: record.actualDurationMinutes,
              medianDurationMinutes: record.actualDurationMinutes,
              stdDevMinutes: 0,
              totalTrips: 1,
              tripsThisWeek: 1,
              trend: 0,
              records: [record],
            };
            return { stats: { ...state.stats, [commuteId]: newStats } };
          }

          // Append and enforce FIFO cap
          const records = [...existing.records, record];
          if (records.length > MAX_RECORDS_PER_COMMUTE) {
            records.shift();
          }
          return {
            stats: {
              ...state.stats,
              [commuteId]: { ...existing, records, totalTrips: existing.totalTrips + 1 },
            },
          };
        });
      },

      removeTripRecord: (commuteId, recordId) => {
        const existing = get().stats[commuteId];
        if (!existing) return;
        set((state) => ({
          stats: {
            ...state.stats,
            [commuteId]: {
              ...existing,
              records: existing.records.filter((r) => r.id !== recordId),
              totalTrips: Math.max(0, existing.totalTrips - 1),
            },
          },
        }));
      },

      removeCommuteStats: (commuteId) => {
        set((state) => {
          const next = { ...state.stats };
          delete next[commuteId];
          return { stats: next };
        });
      },

      clearJournal: () => {
        set({ stats: {} });
      },
    }),
    persistConfig
  )
);
