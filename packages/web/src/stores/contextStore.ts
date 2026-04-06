import type {
  ContextSettings,
  ContextState,
  ContextTransition,
  UserContext,
} from "@mta-my-way/shared";
import { DEFAULT_CONTEXT_STATE, detectContext } from "@mta-my-way/shared";
import { create } from "zustand";
import { type PersistOptions, createJSONStorage, persist } from "zustand/middleware";
import { createSafeMigration } from "./migration";

/** Global window interface for tap history bridge */
declare global {
  interface Window {
    __mta_tap_history?: readonly unknown[];
  }
}

/** Internal state shape */
interface ContextStateInternal {
  /** Current detected context */
  currentContext: ContextState;
  /** Context settings/preferences */
  settings: ContextSettings;
  /** History of context transitions (max 50) */
  transitionHistory: ContextTransition[];

  // Actions
  updateContext: (params: {
    nearStation: boolean;
    nearStationId?: string;
    distanceToStation?: number;
    currentScreen: string;
    screenTime: number;
    recentActions: string[];
  }) => void;
  setSettings: (settings: Partial<ContextSettings>) => void;
  setManualOverride: (context: UserContext | undefined) => void;
  clearTransitionHistory: () => void;
}

/** Current schema version for this store */
const STORE_VERSION = 1;

/** Migration functions keyed by target version */
const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
]);

/** Persist configuration */
const persistConfig: PersistOptions<ContextStateInternal> = {
  name: "mta-context",
  storage: createJSONStorage(() => localStorage),
  version: STORE_VERSION,
  migrate: createSafeMigration<ContextStateInternal>("context", STORE_VERSION, migrations),
  partialize: (state) => ({
    // Only persist settings, not the dynamic context state
    settings: state.settings,
    transitionHistory: state.transitionHistory.slice(-50), // Keep last 50 transitions
  }),
};

export const useContextStore = create<ContextStateInternal>()(
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

        if (!settings.enabled) {
          return;
        }

        const tapHistory = window.__mta_tap_history || [];

        const newContext = detectContext({
          ...params,
          tapHistory,
          manualOverride: settings.manualOverride,
        });

        set((state) => {
          const transitions: ContextTransition[] = [...state.transitionHistory];

          // Only record transition if context actually changed
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

          return {
            currentContext: newContext,
            transitionHistory: transitions,
          };
        });
      },

      setSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      setManualOverride: (context) => {
        set((state) => ({
          settings: { ...state.settings, manualOverride: context },
        }));
      },

      clearTransitionHistory: () => {
        set({ transitionHistory: [] });
      },
    }),
    persistConfig
  )
);

// Re-export types for convenience
export type { ContextState, ContextSettings, ContextTransition, UserContext };

/**
 * Initialize tap history bridge from favoritesStore
 * This should be called once on app initialization
 */
export function initializeTapHistoryBridge(tapHistory: readonly unknown[]) {
  window.__mta_tap_history = tapHistory;
}
