/**
 * DataHealth - Feed data freshness section for the system health dashboard.
 *
 * Shows all 8 subway feeds with their current age and status.
 * Color-coded: green (<15s), gray (15-45s), amber (45-90s), red (>90s).
 */

import {
  formatFeedAge,
  getFreshnessDotColor,
  getFreshnessLevel,
  getFreshnessTextColor,
} from "@mta-my-way/shared";
import type { FeedHealthInfo } from "../../lib/api";

interface DataHealthProps {
  feeds: FeedHealthInfo[];
}

function getFeedAgeSeconds(feed: FeedHealthInfo): number {
  if (!feed.lastSuccessAt) return Infinity;
  return Math.floor((Date.now() - new Date(feed.lastSuccessAt).getTime()) / 1000);
}

export function DataHealth({ feeds }: DataHealthProps) {
  const sorted = [...feeds].sort((a, b) => getFeedAgeSeconds(a) - getFeedAgeSeconds(b));

  const freshCount = feeds.filter((f) => getFeedAgeSeconds(f) < 15).length;
  const totalCount = feeds.length;

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
          Data Health
        </h2>
        <span className="text-12 text-text-tertiary dark:text-dark-text-tertiary">
          {freshCount}/{totalCount} feeds fresh
        </span>
      </div>
      <div className="space-y-1.5 p-3 rounded-xl bg-surface dark:bg-dark-surface">
        {sorted.map((feed) => {
          const age = getFeedAgeSeconds(feed);
          const level = age === Infinity ? "red" : getFreshnessLevel(age);
          const isDown = feed.status === "circuit_open" || feed.status === "never_polled";

          return (
            <div key={feed.id} className="flex items-center justify-between py-1.5 text-13">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${isDown ? "bg-red-500 animate-pulse" : getFreshnessDotColor(level)}`}
                />
                <span className="text-text-primary dark:text-dark-text-primary truncate">
                  {feed.name}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isDown ? (
                  <span className="text-red-500 dark:text-red-400 font-medium">
                    {feed.status === "never_polled" ? "Never polled" : "Circuit open"}
                  </span>
                ) : (
                  <>
                    <span className={`tabular-nums ${getFreshnessTextColor(level)}`}>
                      {formatFeedAge(age)}
                    </span>
                    {feed.avgLatencyMs > 0 && (
                      <span className="text-11 text-text-tertiary dark:text-dark-text-tertiary tabular-nums">
                        {feed.avgLatencyMs}ms
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default DataHealth;
