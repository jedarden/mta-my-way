/**
 * useStaleness - tracks data freshness and returns staleness state.
 *
 * Per plan.md:
 *   - Data fades after 2 minutes
 *   - Data grays out after 5 minutes
 *
 * Returns:
 *   - 'fresh': < 2 minutes old
 *   - 'fading': 2-5 minutes old (subtle visual fade)
 *   - 'stale': > 5 minutes old (grayed out)
 */

import { useEffect, useState } from "react";

export type StalenessLevel = "fresh" | "fading" | "stale";

export interface StalenessState {
  /** Current staleness level */
  level: StalenessLevel;
  /** Seconds since the data was fetched */
  ageSeconds: number;
  /** Human-readable age string (e.g., "2 min ago") */
  ageText: string;
}

/** 2 minutes in milliseconds */
const FADING_THRESHOLD = 2 * 60 * 1000;
/** 5 minutes in milliseconds */
const STALE_THRESHOLD = 5 * 60 * 1000;

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function computeStaleness(updatedAt: number | null): StalenessState {
  if (!updatedAt) {
    return { level: "fresh", ageSeconds: 0, ageText: "" };
  }

  const age = Date.now() - updatedAt;
  const ageSeconds = Math.floor(age / 1000);
  const ageText = formatAge(age);

  let level: StalenessLevel = "fresh";
  if (age >= STALE_THRESHOLD) {
    level = "stale";
  } else if (age >= FADING_THRESHOLD) {
    level = "fading";
  }

  return { level, ageSeconds, ageText };
}

/**
 * Hook to track staleness of data based on a timestamp.
 *
 * @param updatedAt - POSIX timestamp of when the data was last updated (ms)
 * @returns StalenessState with level, ageSeconds, and ageText
 */
export function useStaleness(updatedAt: number | null): StalenessState {
  const [staleness, setStaleness] = useState<StalenessState>(() => computeStaleness(updatedAt));

  useEffect(() => {
    // Update immediately
    setStaleness(computeStaleness(updatedAt));

    // Update every 10 seconds to keep ageText fresh
    const interval = setInterval(() => {
      setStaleness(computeStaleness(updatedAt));
    }, 10 * 1000);

    return () => clearInterval(interval);
  }, [updatedAt]);

  return staleness;
}

export default useStaleness;
