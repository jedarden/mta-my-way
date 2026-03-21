import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Favorite station configuration */
export interface Favorite {
  id: string;
  stationId: string;
  stationName: string;
  lines: string[];
  direction: "N" | "S" | "both";
  sortOrder: number;
  label?: string;
}

/** Commute route configuration */
export interface Commute {
  id: string;
  name: string;
  origin: { stationId: string; stationName: string };
  destination: { stationId: string; stationName: string };
  preferredLines: string[];
  enableTransferSuggestions: boolean;
}

/** Tap event for time-aware context sorting */
export interface FavoriteTapEvent {
  favoriteId: string;
  dayOfWeek: number; // 0-6
  hour: number; // 0-23
}

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

  addCommute: (commute: Omit<Commute, "id">) => string;
  updateCommute: (id: string, updates: Partial<Commute>) => void;
  removeCommute: (id: string) => void;

  recordTap: (favoriteId: string) => void;
  completeOnboarding: () => void;
}

/** Generate a UUID */
function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

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
          favorites: [...state.favorites, { ...favorite, id, sortOrder }],
        }));
        return id;
      },

      updateFavorite: (id, updates) => {
        set((state) => ({
          favorites: state.favorites.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
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

      addCommute: (commute) => {
        const id = generateId();
        set((state) => ({
          commutes: [...state.commutes, { ...commute, id }],
        }));
        return id;
      },

      updateCommute: (id, updates) => {
        set((state) => ({
          commutes: state.commutes.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
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
          if (newHistory.length > 500) {
            newHistory.shift();
          }
          return { tapHistory: newHistory };
        });
      },

      completeOnboarding: () => {
        set({ onboardingComplete: true });
      },
    }),
    {
      name: "mta-favorites",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);
