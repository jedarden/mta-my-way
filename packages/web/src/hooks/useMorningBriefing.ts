/**
 * useMorningBriefing — Compose a status briefing for the user's top morning favorites.
 *
 * Uses tap history to determine which favorites the user typically checks in the
 * morning (6–10 AM, weekdays). Composes a concise text summary with alert status
 * for those favorites' lines.
 *
 * Returns null if there's insufficient tap data (<20 events) or it's not morning.
 */

import type { Favorite, FavoriteTapEvent } from "@mta-my-way/shared";
import { useMemo } from "react";
import { useFavoritesStore } from "../stores/favoritesStore";

/** Minimum tap events before morning briefing is meaningful */
const MIN_TAP_EVENTS = 20;

/** Morning window: 6 AM to 10 AM */
const MORNING_HOUR_START = 6;
const MORNING_HOUR_END = 10;

/** Only weekdays count for morning commute scoring */
function isWeekday(day: number): boolean {
  return day >= 1 && day <= 5;
}

/** Score a favorite for morning relevance based on tap history */
function scoreMorningFavorite(favoriteId: string, tapHistory: FavoriteTapEvent[]): number {
  let score = 0;
  for (const tap of tapHistory) {
    if (
      tap.favoriteId === favoriteId &&
      isWeekday(tap.dayOfWeek) &&
      tap.hour >= MORNING_HOUR_START &&
      tap.hour < MORNING_HOUR_END
    ) {
      score++;
    }
  }
  return score;
}

export interface MorningBriefingEntry {
  favorite: Favorite;
  score: number;
}

export interface MorningBriefing {
  /** Whether it's currently morning (6–10 AM) */
  isMorning: boolean;
  /** Top favorites for morning, sorted by relevance score desc */
  entries: MorningBriefingEntry[];
  /** Composed briefing text for push notification body */
  text: string;
}

/**
 * Returns a morning briefing with the user's most-checked favorites during
 * the morning commute window, along with a composed status text.
 */
export function useMorningBriefing(): MorningBriefing | null {
  const favorites = useFavoritesStore((s) => s.favorites);
  const tapHistory = useFavoritesStore((s) => s.tapHistory);

  return useMemo(() => {
    if (tapHistory.length < MIN_TAP_EVENTS || favorites.length === 0) {
      return null;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const isMorning = currentHour >= MORNING_HOUR_START && currentHour < MORNING_HOUR_END;

    // Score all favorites for morning relevance
    const scored = favorites
      .map((fav) => ({
        favorite: fav,
        score: scoreMorningFavorite(fav.id, tapHistory),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return null;
    }

    // Take top 3 for the briefing
    const top = scored.slice(0, 3);

    // Compose briefing text
    const lines = top.map((entry) => {
      const name = entry.favorite.label ?? entry.favorite.stationName;
      const lineList = entry.favorite.lines.map((l) => `(${l})`).join(" ");
      return `${name} ${lineList}`;
    });

    const header = isMorning ? "Good morning! " : "Your morning stations: ";
    const text = header + lines.join(" · ");

    return {
      isMorning,
      entries: top,
      text,
    };
  }, [favorites, tapHistory]);
}
