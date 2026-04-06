/**
 * useFavorites - Clean hook interface over favoritesStore.
 *
 * Returns favorites sorted by time-of-day context (via useContextSort)
 * with pinned favorites floating to top. Falls back to plain sortOrder
 * when tap history is insufficient (<20 events).
 */

import type { Favorite } from "@mta-my-way/shared";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useContextSort } from "./useContextSort";

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

  const sortedFavorites = useContextSort();

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
