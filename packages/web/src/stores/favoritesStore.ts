import type { Commute, DirectionPreference, Favorite, FavoriteTapEvent } from "@mta-my-way/shared";
import { create } from "zustand";
import { type PersistOptions, createJSONStorage, persist } from "zustand/middleware";
import { createSafeMigration, setMigrationFailed } from "./migration";

/** Internal state shape (excludes schema version which is handled by persist middleware) */
interface FavoritesState {
  favorites: Favorite[];
  commutes: Commute[];
  tapHistory: FavoriteTapEvent[];
  onboardingComplete: boolean;

  // Actions
  addFavorite: (favorite: Omit<Favorite, "id" | "sortOrder">) => string;
  updateFavorite: (id: string, updates: Partial<Favorite>) => void;
  removeFavorite: (id: string) => void;
  reorderFavorites: (fromIndex: number, toIndex: number) => void;
  togglePin: (id: string) => void;

  addCommute: (commute: Omit<Commute, "id">) => string;
  updateCommute: (id: string, updates: Partial<Commute>) => void;
  removeCommute: (id: string) => void;

  recordTap: (favoriteId: string) => void;
  completeOnboarding: () => void;
}

/** Maximum tap history entries (FIFO cap) */
const MAX_TAP_HISTORY = 500;

/** Current schema version for this store */
const STORE_VERSION = 1;

/** Generate a UUID */
function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

/** Migration functions keyed by target version */
const migrations = new Map<number, (state: unknown) => unknown>([
  // Version 1: Initial schema - no migration needed
  // Future versions would add migration functions here, e.g.:
  // [2]: (state) => ({ ...state, newField: defaultValue }),
]);

/** Persist configuration with safe migrations */
const persistConfig: PersistOptions<FavoritesState> = {
  name: "mta-favorites",
  storage: createJSONStorage(() => localStorage),
  version: STORE_VERSION,
  migrate: createSafeMigration<FavoritesState>("favorites", STORE_VERSION, migrations),
  onRehydrateStorage: () => (state, error) => {
    if (error) {
      console.error("[favoritesStore] Rehydration failed:", error);
      setMigrationFailed();
    }
    // Enforce FIFO cap on tapHistory after rehydration
    if (state && state.tapHistory.length > MAX_TAP_HISTORY) {
      state.tapHistory = state.tapHistory.slice(-MAX_TAP_HISTORY);
    }
  },
};

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      commutes: [],
      tapHistory: [],
      onboardingComplete: false,

      addFavorite: (favorite) => {
        const id = generateId();
        const sortOrder = get().favorites.length;
        set((state) => ({
          favorites: [
            ...state.favorites,
            {
              ...favorite,
              id,
              sortOrder,
              pinned: favorite.pinned ?? false,
            },
          ],
        }));
        return id;
      },

      updateFavorite: (id, updates) => {
        set((state) => ({
          favorites: state.favorites.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        }));
      },

      removeFavorite: (id) => {
        set((state) => ({
          favorites: state.favorites
            .filter((f) => f.id !== id)
            .map((f, index) => ({ ...f, sortOrder: index })),
        }));
      },

      reorderFavorites: (fromIndex, toIndex) => {
        set((state) => {
          const newFavorites = [...state.favorites];
          const removed = newFavorites.splice(fromIndex, 1)[0];
          if (removed !== undefined) {
            newFavorites.splice(toIndex, 0, removed);
          }
          return {
            favorites: newFavorites.map((f, index) => ({
              ...f,
              sortOrder: index,
            })),
          };
        });
      },

      togglePin: (id) => {
        set((state) => ({
          favorites: state.favorites.map((f) => (f.id === id ? { ...f, pinned: !f.pinned } : f)),
        }));
      },

      addCommute: (commute) => {
        const id = generateId();
        set((state) => ({
          commutes: [...state.commutes, { ...commute, id }],
        }));
        return id;
      },

      updateCommute: (id, updates) => {
        set((state) => ({
          commutes: state.commutes.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        }));
      },

      removeCommute: (id) => {
        set((state) => ({
          commutes: state.commutes.filter((c) => c.id !== id),
        }));
      },

      recordTap: (favoriteId) => {
        const now = new Date();
        const tapEvent: FavoriteTapEvent = {
          favoriteId,
          dayOfWeek: now.getDay(),
          hour: now.getHours(),
        };
        set((state) => {
          // Keep max 500 entries, FIFO
          const newHistory = [...state.tapHistory, tapEvent];
          if (newHistory.length > MAX_TAP_HISTORY) {
            newHistory.shift();
          }
          return { tapHistory: newHistory };
        });
      },

      completeOnboarding: () => {
        set({ onboardingComplete: true });
      },
    }),
    persistConfig
  )
);

// Re-export types for convenience
export type { Favorite, Commute, FavoriteTapEvent, DirectionPreference };
