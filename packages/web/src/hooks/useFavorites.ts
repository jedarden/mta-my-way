/**
 * useFavorites - Clean hook interface over favoritesStore.
 *
 * Returns sorted favorites (by sortOrder) and CRUD operations.
 * Also exposes recordTap for Phase 5 context-aware sorting.
 */

import type { Favorite } from "@mta-my-way/shared";
import { useFavoritesStore } from "../stores/favoritesStore";

export type { Favorite };

export function useFavorites() {
  const {
    favorites,
    onboardingComplete,
    addFavorite,
    updateFavorite,
    removeFavorite,
    reorderFavorites,
    togglePin,
    recordTap,
    completeOnboarding,
  } = useFavoritesStore();

  // Pinned favorites first, then by sortOrder
  const sortedFavorites = [...favorites].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.sortOrder - b.sortOrder;
  });

  return {
    favorites: sortedFavorites,
    hasFavorites: favorites.length > 0,
    onboardingComplete,
    addFavorite,
    updateFavorite,
    removeFavorite,
    reorderFavorites,
    togglePin,
    recordTap,
    completeOnboarding,
  };
}
