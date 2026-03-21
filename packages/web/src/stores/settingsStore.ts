import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface SettingsState {
  theme: "light" | "dark" | "system";
  showUnassignedTrips: boolean;
  refreshInterval: number; // seconds, default 30, min 15
  alertSeverityFilter: "all" | "delays" | "major";
  hapticFeedback: boolean;
  accessibleMode: boolean;

  // Actions
  setTheme: (theme: SettingsState["theme"]) => void;
  setShowUnassignedTrips: (show: boolean) => void;
  setRefreshInterval: (interval: number) => void;
  setAlertSeverityFilter: (filter: SettingsState["alertSeverityFilter"]) => void;
  setHapticFeedback: (enabled: boolean) => void;
  setAccessibleMode: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      showUnassignedTrips: false,
      refreshInterval: 30,
      alertSeverityFilter: "delays",
      hapticFeedback: true,
      accessibleMode: false,

      setTheme: (theme) => set({ theme }),
      setShowUnassignedTrips: (showUnassignedTrips) => set({ showUnassignedTrips }),
      setRefreshInterval: (refreshInterval) =>
        set({ refreshInterval: Math.max(15, refreshInterval) }),
      setAlertSeverityFilter: (alertSeverityFilter) => set({ alertSeverityFilter }),
      setHapticFeedback: (hapticFeedback) => set({ hapticFeedback }),
      setAccessibleMode: (accessibleMode) => set({ accessibleMode }),
    }),
    {
      name: "mta-settings",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
