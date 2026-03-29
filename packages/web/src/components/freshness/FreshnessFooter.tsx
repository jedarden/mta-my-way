/**
 * FreshnessFooter - Compact display of per-feed data ages at bottom of arrivals.
 *
 * Shows unique feeds contributing to the current station's arrivals with:
 *   - Green dot + age for fresh (<15s)
 *   - Gray dot + age for neutral (15-45s)
 *   - Amber dot + age for warning (45-90s)
 *   - Red dot + age for stale (>90s)
 *
 * Clicking expands to show FreshnessDetail with all 8 feeds.
 */

import { useState } from "react";
import type { ArrivalTime } from "@mta-my-way/shared";
import { getFeedById } from "@mta-my-way/shared";
import { formatFeedAge, getFreshnessDotColor, getFreshnessLevel, getFreshnessTextColor } from "@mta-my-way/shared";
import { FreshnessDetail } from "./FreshnessDetail";

interface FreshnessFooterProps {
  /** All arrivals shown for this station (both directions) */
  arrivals: ArrivalTime[];
  /** Station-level feed age (max of all arrivals' feed ages) */
  stationFeedAge: number;
}

/**
 * Extract unique feeds from arrivals, keeping the max feedAge per feed.
 */
function getUniqueFeeds(arrivals: ArrivalTime[]): Map<string, { name: string; age: number }> {
  const feeds = new Map<string, { name: string; age: number }>();
  for (const a of arrivals) {
    const existing = feeds.get(a.feedName);
    const age = a.feedAge;
    if (!existing || age > existing.age) {
      const feed = getFeedById(a.feedName);
      feeds.set(a.feedName, { name: feed?.name ?? a.feedName, age });
    }
  }
  return feeds;
}

export function FreshnessFooter({ arrivals, stationFeedAge }: FreshnessFooterProps) {
  const [expanded, setExpanded] = useState(false);

  const feeds = getUniqueFeeds(arrivals);
  const feedEntries = Array.from(feeds.entries()).sort((a, b) => b[1].age - a[1].age);

  if (feedEntries.length === 0) return null;

  return (
    <div className="mt-4">
      {/* Compact feed age bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface dark:bg-dark-surface text-12 transition-colors active:bg-surface/80 dark:active:bg-dark-surface/80"
        aria-expanded={expanded}
        aria-label={`Data freshness: ${formatFeedAge(stationFeedAge)} old. Tap for details.`}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-text-tertiary dark:text-dark-text-tertiary shrink-0">Data age:</span>
          {feedEntries.slice(0, 3).map(([feedId, { name, age }]) => {
            const level = getFreshnessLevel(age);
            return (
              <span key={feedId} className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getFreshnessDotColor(level)}`} />
                <span className={`${getFreshnessTextColor(level)} tabular-nums`}>
                  {name.split(" ")[0]} {formatFeedAge(age)}
                </span>
              </span>
            );
          })}
          {feedEntries.length > 3 && (
            <span className="text-text-tertiary dark:text-dark-text-tertiary">
              +{feedEntries.length - 3}
            </span>
          )}
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-text-tertiary dark:text-dark-text-tertiary shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <polyline points="6,9 12,15 18,9" />
        </svg>
      </button>

      {/* Expandable detail panel */}
      {expanded && (
        <FreshnessDetail feedEntries={feedEntries} />
      )}
    </div>
  );
}

export default FreshnessFooter;
