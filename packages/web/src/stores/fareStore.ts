/**
 * fareStore — Phase 6 skeleton
 *
 * Tracks OMNY fare caps entirely client-side, auto-logged from trip tracking.
 * Schema v1 defined now so migrations are safe throughout the project lifecycle.
 *
 * Persisted key: "mta-fare"
 */
import { create } from "zustand";
import { persist, createJSONStorage, type PersistOptions } from "zustand/middleware";
import { createSafeMigration, setMigrationFailed } from "./migration";
import type { FareTracking, RideLogEntry } from "@mta-my-way/shared";

/** Maximum ride log entries to retain (last 90 days worth) */
const MAX_RIDE_LOG = 500;

/** Default fare tracking state (OMNY defaults as of 2024) */
const DEFAULT_TRACKING: FareTracking = {
  weeklyRides: 0,
  weekStartDate: "",
  monthlyRides: 0,
  monthStartDate: "",
  rideLog: [],
  currentFare: 2.9,
  unlimitedPassPrice: 132,
};

interface FareState {
  tracking: FareTracking;

  // Actions (Phase 6 will flesh these out)
  addRideLogEntry: (entry: RideLogEntry) => void;
  setCurrentFare: (fare: number) => void;
  setUnlimitedPassPrice: (price: number) => void;
  resetWeek: (weekStartDate: string) => void;
  resetMonth: (monthStartDate: string) => void;
  updateTracking: (updates: Partial<FareTracking>) => void;
  clearFareData: () => void;
}

/** Current schema version for this store */
const STORE_VERSION = 1;

/** Migration functions keyed by target version */
const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
  // Future: [2]: (state) => ({ ...state as FareState, newField: defaultValue }),
]);

const persistConfig: PersistOptions<FareState> = {
  name: "mta-fare",
  storage: createJSONStorage(() => localStorage),
  version: STORE_VERSION,
  migrate: createSafeMigration<FareState>("fare", STORE_VERSION, migrations),
  onRehydrateStorage: () => (_state, error) => {
    if (error) {
      console.error("[fareStore] Rehydration failed:", error);
      setMigrationFailed();
    }
  },
};

export const useFareStore = create<FareState>()(
  persist(
    (set, get) => ({
      tracking: { ...DEFAULT_TRACKING },

      addRideLogEntry: (entry) => {
        set((state) => {
          const rideLog = [...state.tracking.rideLog, entry];
          // Enforce FIFO cap
          if (rideLog.length > MAX_RIDE_LOG) {
            rideLog.shift();
          }
          return {
            tracking: {
              ...state.tracking,
              rideLog,
              weeklyRides: state.tracking.weeklyRides + 1,
              monthlyRides: state.tracking.monthlyRides + 1,
            },
          };
        });
      },

      setCurrentFare: (currentFare) => {
        set((state) => ({ tracking: { ...state.tracking, currentFare } }));
      },

      setUnlimitedPassPrice: (unlimitedPassPrice) => {
        set((state) => ({ tracking: { ...state.tracking, unlimitedPassPrice } }));
      },

      resetWeek: (weekStartDate) => {
        set((state) => ({
          tracking: { ...state.tracking, weeklyRides: 0, weekStartDate },
        }));
      },

      resetMonth: (monthStartDate) => {
        set((state) => ({
          tracking: { ...state.tracking, monthlyRides: 0, monthStartDate },
        }));
      },

      updateTracking: (updates) => {
        set((state) => ({ tracking: { ...state.tracking, ...updates } }));
      },

      clearFareData: () => {
        const { currentFare, unlimitedPassPrice } = get().tracking;
        set({ tracking: { ...DEFAULT_TRACKING, currentFare, unlimitedPassPrice } });
      },
    }),
    persistConfig
  )
);
