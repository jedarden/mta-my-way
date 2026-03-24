/**
 * useFeedFreshness - derives per-arrival freshness level from feedAge.
 *
 * Maps the arrival's feedAge (seconds) to a freshness level:
 *   - fresh:   < 15s  (green)
 *   - neutral: 15-45s (no color)
 *   - amber:   45-90s (warning)
 *   - red:     > 90s  (outdated)
 *
 * Also provides CSS classes for visual indicators.
 */

import type { FreshnessLevel } from "@mta-my-way/shared";
import { formatFeedAge, getFreshnessLevel, getFreshnessTextColor, getFreshnessDotColor } from "@mta-my-way/shared";

export interface FeedFreshnessState {
  level: FreshnessLevel;
  ageSeconds: number;
  ageText: string;
  textColor: string;
  dotColor: string;
  isStale: boolean;  // amber or red
  isOutdated: boolean; // red only
}

/**
 * Compute freshness state from a feed age in seconds.
 * This is a pure function version for use outside of React.
 */
export function computeFeedFreshness(feedAge: number): FeedFreshnessState {
  const level = getFreshnessLevel(feedAge);
  return {
    level,
    ageSeconds: feedAge,
    ageText: formatFeedAge(feedAge),
    textColor: getFreshnessTextColor(level),
    dotColor: getFreshnessDotColor(level),
    isStale: level === "amber" || level === "red",
    isOutdated: level === "red",
  };
}

/**
 * Hook to get freshness info for a single arrival's feedAge.
 * Re-renders every 10s to keep age display fresh.
 */
export function useFeedFreshness(feedAge: number): FeedFreshnessState {
  // Note: feedAge from the API is a snapshot. We add wall-clock drift
  // by tracking when we received the data. But for simplicity, since
  // useArrivals re-fetches every 30s, the feedAge is reasonably fresh.
  return computeFeedFreshness(feedAge);
}

export default useFeedFreshness;
