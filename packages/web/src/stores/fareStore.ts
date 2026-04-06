import type { FareCapStatus, FareTracking, RideLogEntry } from "@mta-my-way/shared";
import { getMonthStartISO, getWeekStartISO } from "@mta-my-way/shared";
/**
 * fareStore — OMNY fare cap tracker
 *
 * Tracks rides toward OMNY's 12-ride weekly free cap. Auto-logged from
 * commute journal — no manual button.
 *
 * Persisted key: "mta-fare"
 */
import { create } from "zustand";
import { type PersistOptions, createJSONStorage, persist } from "zustand/middleware";
import { createSafeMigration, setMigrationFailed } from "./migration";

/** Maximum ride log entries to retain (last 90 days worth) */
const MAX_RIDE_LOG = 500;

/** OMNY fare cap: after 12 rides in a weekly period, rides are free */
const FARE_CAP_RIDES = 12;

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

/**
 * Ensure weekly/monthly counters are reset when the period changes.
 * Returns the tracking state after any needed resets.
 */
function applyPeriodResets(tracking: FareTracking): FareTracking {
  let { weeklyRides, weekStartDate, monthlyRides, monthStartDate } = tracking;

  const currentWeek = getWeekStartISO();
  const currentMonth = getMonthStartISO();

  if (weekStartDate && weekStartDate !== currentWeek) {
    // Recount weekly rides from rideLog for the current week
    weeklyRides = tracking.rideLog.filter((entry) => entry.date >= currentWeek).length;
    weekStartDate = currentWeek;
  } else if (!weekStartDate) {
    weekStartDate = currentWeek;
    weeklyRides = tracking.rideLog.filter((entry) => entry.date >= currentWeek).length;
  }

  if (monthStartDate && monthStartDate !== currentMonth) {
    monthlyRides = tracking.rideLog.filter((entry) => entry.date >= currentMonth).length;
    monthStartDate = currentMonth;
  } else if (!monthStartDate) {
    monthStartDate = currentMonth;
    monthlyRides = tracking.rideLog.filter((entry) => entry.date >= currentMonth).length;
  }

  return { ...tracking, weeklyRides, weekStartDate, monthlyRides, monthStartDate };
}

/** Compute display-ready fare cap status from tracking state */
function computeCapStatus(tracking: FareTracking): FareCapStatus {
  const ridesThisWeek = tracking.weeklyRides;
  const capReached = ridesThisWeek >= FARE_CAP_RIDES;
  const ridesUntilFree = Math.max(0, FARE_CAP_RIDES - ridesThisWeek);

  // Weekly spend: paid rides only (rides 1-12), each at currentFare
  const paidRides = Math.min(ridesThisWeek, FARE_CAP_RIDES);
  const weeklySpend = paidRides * tracking.currentFare;

  // Break-even: rides where pay-per-ride = unlimited pass
  const breakEvenRides = Math.ceil(tracking.unlimitedPassPrice / tracking.currentFare);
  const breakEvenSpend = breakEvenRides * tracking.currentFare;

  // Monthly spend: count all rides this month (simplified, not per-week-capped)
  // We count paid rides from rideLog for this month
  const currentMonth = tracking.monthStartDate || getMonthStartISO();
  const monthlyRideLog = tracking.rideLog.filter((entry) => entry.date >= currentMonth);
  const monthlyPaidRides = monthlyRideLog.length; // already capped per week conceptually
  const monthlySpend = monthlyPaidRides * tracking.currentFare;

  const unlimitedWouldBeCheaper = monthlySpend > tracking.unlimitedPassPrice;
  const savingsVsUnlimited = tracking.unlimitedPassPrice - monthlySpend;

  return {
    ridesThisWeek,
    ridesUntilFree,
    capReached,
    weeklySpend,
    breakEvenSpend,
    unlimitedWouldBeCheaper,
    monthlySpend,
    savingsVsUnlimited,
  };
}

interface FareState {
  tracking: FareTracking;

  // Actions
  addRideLogEntry: (entry: RideLogEntry) => void;
  setCurrentFare: (fare: number) => void;
  setUnlimitedPassPrice: (price: number) => void;
  resetWeek: (weekStartDate: string) => void;
  resetMonth: (monthStartDate: string) => void;
  updateTracking: (updates: Partial<FareTracking>) => void;
  clearFareData: () => void;

  // Computed
  getCapStatus: () => FareCapStatus;
}

/** Current schema version for this store */
const STORE_VERSION = 1;

/** Migration functions keyed by target version */
const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
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
          let tracking = applyPeriodResets(state.tracking);

          const rideLog = [...tracking.rideLog, entry];
          // Enforce FIFO cap
          if (rideLog.length > MAX_RIDE_LOG) {
            rideLog.shift();
          }

          tracking = {
            ...tracking,
            rideLog,
            weeklyRides: tracking.weeklyRides + 1,
            monthlyRides: tracking.monthlyRides + 1,
          };

          return { tracking };
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

      getCapStatus: () => {
        const tracking = applyPeriodResets(get().tracking);
        return computeCapStatus(tracking);
      },
    }),
    persistConfig
  )
);
