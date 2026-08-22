import type { Settings } from "@mta-my-way/shared";
import { create } from "zustand";
import { type PersistOptions, createJSONStorage, persist } from "zustand/middleware";
import { createSafeMigration, setMigrationFailed } from "./migration";

interface QuietHours {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number; // 0-23
}

interface SettingsState {
  theme: "light" | "dark" | "system";
  showUnassignedTrips: boolean;
  refreshInterval: number; // seconds, default 30, min 15
  alertSeverityFilter: "all" | "delays" | "major";
  hapticFeedback: boolean;
  accessibleMode: boolean;
  quietHours: QuietHours;

  // Actions
  setTheme: (theme: SettingsState["theme"]) => void;
  setShowUnassignedTrips: (show: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  setAlertSeverityFilter: (filter: SettingsState["alertSeverityFilter"]) => void;
  setHapticFeedback: (enabled: boolean) => void;
  setAccessibleMode: (enabled: boolean) => void;
  setQuietHours: (quietHours: QuietHours) => void;
  replaceFromSync: (settings: Settings) => void;
  clearLocalData: () => void;
}

/** Current schema version for this store */
const STORE_VERSION = 1;

const DEFAULT_SETTINGS = {
  theme: "system" as const,
  showUnassignedTrips: false,
  refreshInterval: 30,
  alertSeverityFilter: "delays" as const,
  hapticFeedback: true,
  accessibleMode: false,
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
};

/** Migration functions keyed by target version */
const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
  // Future: [2]: (state) => ({ ...state as SettingsState, newField: defaultValue }),
]);

const persistConfig: PersistOptions<SettingsState> = {
  name: "mta-settings",
  storage: createJSONStorage(() => localStorage),
  version: STORE_VERSION,
  migrate: createSafeMigration<SettingsState>("settings", STORE_VERSION, migrations),
  onRehydrateStorage: () => (_state, error) => {
    if (error) {
      console.error("[settingsStore] Rehydration failed:", error);
      setMigrationFailed();
    }
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setTheme: (theme) => set({ theme }),
      setShowUnassignedTrips: (showUnassignedTrips) => set({ showUnassignedTrips }),
      setRefreshInterval: (refreshInterval) =>
        set({ refreshInterval: Math.max(15, refreshInterval) }),
      setAlertSeverityFilter: (alertSeverityFilter) => set({ alertSeverityFilter }),
      setHapticFeedback: (hapticFeedback) => set({ hapticFeedback }),
      setAccessibleMode: (accessibleMode) => set({ accessibleMode }),
      setQuietHours: (quietHours) => set({ quietHours }),
      replaceFromSync: (settings) => set({ ...DEFAULT_SETTINGS, ...settings }),
      clearLocalData: () => set(DEFAULT_SETTINGS),
    }),
    persistConfig
  )
);
