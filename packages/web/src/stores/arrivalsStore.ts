import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Cached arrival data for offline support */
interface CachedArrival {
  stationId: string;
  data: unknown; // StationArrivals from shared types
  cachedAt: number; // timestamp
}

interface ArrivalsState {
  /** Map of station ID to cached arrival data */
  cache: Record<string, CachedArrival>;
  /** Timestamp of last successful fetch */
  lastFetch: number | null;

  // Actions
  setCachedArrivals: (stationId: string, data: unknown) => void;
  getCachedArrivals: (stationId: string) => CachedArrival | null;
  clearCache: () => void;
  setLastFetch: (timestamp: number) => void;
}

/** Max age for cached data in milliseconds (5 minutes) */
const MAX_CACHE_AGE = 5 * 60 * 1000;

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

        // Return null if data is too old
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
    {
      name: "mta-arrivals",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
