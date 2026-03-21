import { create } from "zustand";
import { persist, createJSONStorage, type PersistOptions } from "zustand/middleware";
import { createSafeMigration, setMigrationFailed } from "./migration";
import type { StationArrivals } from "@mta-my-way/shared";

/**
 * Cached arrival data for offline support.
 *
 * NOTE: This store is in-memory and refreshes every ~30s from the API.
 * Persistence is intentional for offline/background mode: last-known
 * values survive a page reload but are rejected if older than MAX_CACHE_AGE.
 */
interface CachedArrival {
  stationId: string;
  data: StationArrivals;
  cachedAt: number; // POSIX timestamp
}

interface ArrivalsState {
  /** Map of station ID to last-known arrival data */
  cache: Record<string, CachedArrival>;
  /** Timestamp of last successful API fetch */
  lastFetch: number | null;

  // Actions
  setCachedArrivals: (stationId: string, data: StationArrivals) => void;
  getCachedArrivals: (stationId: string) => CachedArrival | null;
  clearCache: () => void;
  setLastFetch: (timestamp: number) => void;
}

/** Max age for cached data in milliseconds (5 minutes) */
const MAX_CACHE_AGE = 5 * 60 * 1000;

/** Current schema version for this store */
const STORE_VERSION = 1;

/** Migration functions keyed by target version */
const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
]);

const persistConfig: PersistOptions<ArrivalsState> = {
  name: "mta-arrivals",
  storage: createJSONStorage(() => localStorage),
  version: STORE_VERSION,
  migrate: createSafeMigration<ArrivalsState>("arrivals", STORE_VERSION, migrations),
  onRehydrateStorage: () => (_state, error) => {
    if (error) {
      console.error("[arrivalsStore] Rehydration failed:", error);
      setMigrationFailed();
    }
  },
};

export const useArrivalsStore = create<ArrivalsState>()(
  persist(
    (set, get) => ({
      cache: {},
      lastFetch: null,

      setCachedArrivals: (stationId, data) => {
        set((state) => ({
          cache: {
            ...state.cache,
            [stationId]: {
              stationId,
              data,
              cachedAt: Date.now(),
            },
          },
        }));
      },

      getCachedArrivals: (stationId) => {
        const cached = get().cache[stationId];
        if (!cached) return null;

        // Reject stale data — caller should fetch fresh from API
        if (Date.now() - cached.cachedAt > MAX_CACHE_AGE) {
          return null;
        }

        return cached;
      },

      clearCache: () => {
        set({ cache: {}, lastFetch: null });
      },

      setLastFetch: (timestamp) => {
        set({ lastFetch: timestamp });
      },
    }),
    persistConfig
  )
);
