import { create } from "zustand";
import { persist, createJSONStorage, type PersistOptions } from "zustand/middleware";
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
}

/** Current schema version for this store */
const STORE_VERSION = 1;

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
      theme: "system",
      showUnassignedTrips: false,
      refreshInterval: 30,
      alertSeverityFilter: "delays",
      hapticFeedback: true,
      accessibleMode: false,
      quietHours: { enabled: false, startHour: 22, endHour: 7 },

      setTheme: (theme) => set({ theme }),
      setShowUnassignedTrips: (showUnassignedTrips) => set({ showUnassignedTrips }),
      setRefreshInterval: (refreshInterval) =>
        set({ refreshInterval: Math.max(15, refreshInterval) }),
      setAlertSeverityFilter: (alertSeverityFilter) => set({ alertSeverityFilter }),
      setHapticFeedback: (hapticFeedback) => set({ hapticFeedback }),
      setAccessibleMode: (accessibleMode) => set({ accessibleMode }),
      setQuietHours: (quietHours) => set({ quietHours }),
    }),
    persistConfig
  )
);
