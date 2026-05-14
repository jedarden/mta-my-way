/**
 * contextStore — Zustand store for context-aware user state detection.
 *
 * Holds the detected context (commuting, planning, reviewing, idle, at_station),
 * user settings controlling detection behavior, and a rolling transition history.
 *
 * Context detection runs locally via detectContext() from @mta-my-way/shared.
 * Tap history is bridged from favoritesStore via window.__mta_tap_history so
 * detectContext has access without creating a cross-store dependency.
 */

import type {
  ContextSettings,
  ContextState,
  ContextTransition,
  FavoriteTapEvent,
} from "@mta-my-way/shared";
import { DEFAULT_CONTEXT_STATE, detectContext } from "@mta-my-way/shared";
import { create } from "zustand";
import { type PersistOptions, createJSONStorage, persist } from "zustand/middleware";
import { createSafeMigration, setMigrationFailed } from "./migration";

// Cross-store bridge: favoritesStore writes tap history here so detectContext
// can read it without a direct Zustand dependency.
declare global {
  interface Window {
    __mta_tap_history?: FavoriteTapEvent[];
    __mta_record_action?: (action: string) => void;
  }
}

interface ContextStoreState {
  currentContext: ContextState;
  settings: ContextSettings;
  transitionHistory: ContextTransition[];

  updateContext: (params: {
    nearStation: boolean;
    nearStationId?: string;
    distanceToStation?: number;
    currentScreen: string;
    screenTime: number;
    recentActions: string[];
  }) => void;
  setSettings: (newSettings: Partial<ContextSettings>) => void;
  setManualOverride: (context: ContextState["context"] | undefined) => void;
  clearTransitionHistory: () => void;
}

const STORE_VERSION = 1;

const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
]);

const persistConfig: PersistOptions<ContextStoreState> = {
  name: "mta-context",
  storage: createJSONStorage(() => localStorage),
  version: STORE_VERSION,
  migrate: createSafeMigration<ContextStoreState>("context", STORE_VERSION, migrations),
  onRehydrateStorage: () => (_state, error) => {
    if (error) {
      console.error("[contextStore] Rehydration failed:", error);
      setMigrationFailed();
    }
  },
};

export const useContextStore = create<ContextStoreState>()(
  persist(
    (set, get) => ({
      currentContext: DEFAULT_CONTEXT_STATE,
      settings: {
        enabled: true,
        showIndicator: true,
        useLocation: true,
        useTimePatterns: true,
        learnPatterns: true,
      },
      transitionHistory: [],

      updateContext: (params) => {
        const { settings, currentContext: previousContext } = get();
        if (!settings.enabled) return;

        const tapHistory = window.__mta_tap_history ?? [];
        const newContext = detectContext({
          ...params,
          tapHistory,
          manualOverride: settings.manualOverride,
        });

        set((state) => {
          const transitions = [...state.transitionHistory];

          if (previousContext.context !== newContext.context) {
            transitions.push({
              from: previousContext.context,
              to: newContext.context,
              at: newContext.detectedAt,
              trigger: newContext.isManualOverride
                ? "manual"
                : params.nearStation
                  ? "location"
                  : params.currentScreen !== previousContext.factors.activity.currentScreen
                    ? "activity"
                    : "time",
            });
            // Keep max 50 transitions
            if (transitions.length > 50) {
              transitions.shift();
            }
          }

          return { currentContext: newContext, transitionHistory: transitions };
        });
      },

      setSettings: (newSettings) => {
        set((state) => ({ settings: { ...state.settings, ...newSettings } }));
      },

      setManualOverride: (context) => {
        set((state) => ({ settings: { ...state.settings, manualOverride: context } }));
      },

      clearTransitionHistory: () => {
        set({ transitionHistory: [] });
      },
    }),
    persistConfig
  )
);

/**
 * Initialize tap history bridge from favoritesStore.
 * Must be called whenever tapHistory changes so detectContext
 * has access to current tap data.
 */
export function initializeTapHistoryBridge(tapHistory: FavoriteTapEvent[]): void {
  window.__mta_tap_history = tapHistory;
}
