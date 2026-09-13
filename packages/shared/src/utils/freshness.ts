/**
 * Data freshness utilities for arrival feed age indicators.
 *
 * Freshness levels based on seconds since feed was last polled:
 *   - fresh:   < 15s  (green)
 *   - neutral: 15-45s (no color)
 *   - amber:   45-90s (warning tint)
 *   - red:     > 90s  (grayed out, "data may be outdated")
 */

export type FreshnessLevel = "fresh" | "neutral" | "amber" | "red";

/** Thresholds in seconds */
const FRESH_THRESHOLD = 15;
const NEUTRAL_THRESHOLD = 45;
const AMBER_THRESHOLD = 90;

/**
 * Determine freshness level from feed age in seconds.
 */
export function getFreshnessLevel(feedAgeSeconds: number): FreshnessLevel {
  if (feedAgeSeconds < FRESH_THRESHOLD) return "fresh";
  if (feedAgeSeconds < NEUTRAL_THRESHOLD) return "neutral";
  if (feedAgeSeconds < AMBER_THRESHOLD) return "amber";
  return "red";
}

/**
 * Tailwind text color class for a freshness level.
 *
 * Light mode uses the -700 step of each scale: the -600 tokens measure
 * 3.1-4.8:1 on white, below the 4.5:1 WCAG 1.4.3 floor (axe color-contrast);
 * the -700 tokens clear it on white and on the tinted card surfaces. The
 * -400 dark tokens already clear 6:1 on #121212.
 */
export function getFreshnessTextColor(level: FreshnessLevel): string {
  switch (level) {
    case "fresh":
      return "text-green-700 dark:text-green-400";
    case "neutral":
      return "text-text-tertiary dark:text-dark-text-tertiary";
    case "amber":
      return "text-amber-700 dark:text-amber-400";
    case "red":
      return "text-red-700 dark:text-red-400";
  }
}

/**
 * Tailwind dot background color class for a freshness level.
 */
export function getFreshnessDotColor(level: FreshnessLevel): string {
  switch (level) {
    case "fresh":
      return "bg-green-500";
    case "neutral":
      return "bg-gray-400 dark:bg-gray-500";
    case "amber":
      return "bg-amber-500";
    case "red":
      return "bg-red-500";
  }
}

/**
 * Format feed age for display (e.g., "12s", "1m 5s", "3m").
 */
export function formatFeedAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}
