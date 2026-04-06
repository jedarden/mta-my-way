/**
 * FreshnessDetail - Expandable panel showing all feed statuses.
 *
 * Displays each feed that contributes to the current station's arrivals
 * with color-coded freshness level, feed name, and age.
 */

import { SUBWAY_FEEDS } from "@mta-my-way/shared";
import {
  formatFeedAge,
  getFreshnessDotColor,
  getFreshnessLevel,
  getFreshnessTextColor,
} from "@mta-my-way/shared";

interface FreshnessDetailProps {
  /** Feed entries from the current station's arrivals */
  feedEntries: [string, { name: string; age: number }][];
}

const FRESHNESS_LABELS: Record<string, string> = {
  fresh: "Up to date",
  neutral: "Normal",
  amber: "Delayed",
  red: "Stale",
};

export function FreshnessDetail({ feedEntries }: FreshnessDetailProps) {
  // Show all feeds, marking inactive ones
  const allFeeds = SUBWAY_FEEDS.map((feed) => {
    const active = feedEntries.find(([id]) => id === feed.id);
    const age = active?.[1].age ?? -1;
    const level = age < 0 ? "neutral" : getFreshnessLevel(age);
    return {
      id: feed.id,
      name: feed.name,
      lines: feed.lines,
      age,
      level,
      isActive: age >= 0,
    };
  });

  return (
    <div className="mt-2 p-3 rounded-lg bg-surface dark:bg-dark-surface space-y-2">
      <h3 className="text-13 font-semibold text-text-secondary dark:text-dark-text-secondary">
        Feed Status
      </h3>
      <div className="space-y-1.5">
        {allFeeds.map((feed) => (
          <div key={feed.id} className="flex items-center justify-between text-12">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${getFreshnessDotColor(feed.level)}`}
              />
              <span className="text-text-primary dark:text-dark-text-primary truncate">
                {feed.name}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {feed.isActive ? (
                <>
                  <span className={`tabular-nums ${getFreshnessTextColor(feed.level)}`}>
                    {formatFeedAge(feed.age)}
                  </span>
                  <span className="text-text-tertiary dark:text-dark-text-tertiary">
                    {FRESHNESS_LABELS[feed.level]}
                  </span>
                </>
              ) : (
                <span className="text-text-tertiary dark:text-dark-text-tertiary">Not needed</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FreshnessDetail;
