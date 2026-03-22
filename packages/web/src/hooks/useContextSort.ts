/**
 * useContextSort — Time-aware context sorting for favorites.
 *
 * Scores each favorite by tap frequency at the current day-of-week and hour
 * (±1h window). Requires ≥20 tap events before sorting activates to avoid
 * noisy early data.
 *
 * Pinned favorites always float to the top regardless of score.
 * Manual sortOrder is used as tiebreaker for equal scores.
 */

import type { Favorite, FavoriteTapEvent } from "@mta-my-way/shared";
import { useMemo } from "react";
import { useFavoritesStore } from "../stores/favoritesStore";

/** Minimum tap events before context sort activates */
const MIN_TAP_EVENTS = 20;

/** Score a single favorite based on tap frequency at the current time window */
function scoreFavorite(
  favoriteId: string,
  tapHistory: FavoriteTapEvent[],
  currentDay: number,
  currentHour: number
): number {
  let score = 0;
  for (const tap of tapHistory) {
    if (
      tap.favoriteId === favoriteId &&
      tap.dayOfWeek === currentDay &&
      Math.abs(tap.hour - currentHour) <= 1
    ) {
      score++;
    }
  }
  return score;
}

/**
 * Returns favorites sorted by context score (time-of-day frequency).
 * Pinned favorites float to top, then unpinned sorted by score desc
 * with sortOrder as tiebreaker.
 *
 * Falls back to plain pinned-first + sortOrder when tapHistory is too small.
 */
export function useContextSort(): Favorite[] {
  const favorites = useFavoritesStore((s) => s.favorites);
  const tapHistory = useFavoritesStore((s) => s.tapHistory);

  return useMemo(() => {
    const insufficient = tapHistory.length < MIN_TAP_EVENTS;
    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    return [...favorites].sort((a, b) => {
      // Pinned always first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // Both pinned or both unpinned — use context score if we have enough data
      if (!insufficient) {
        const scoreA = scoreFavorite(a.id, tapHistory, currentDay, currentHour);
        const scoreB = scoreFavorite(b.id, tapHistory, currentDay, currentHour);
        if (scoreA !== scoreB) return scoreB - scoreA;
      }

      // Tiebreaker: manual sortOrder
      return a.sortOrder - b.sortOrder;
    });
  }, [favorites, tapHistory]);
}
