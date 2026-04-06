/**
 * WalkComparison - Walking vs transit comparison for short trips.
 *
 * Shows:
 *   - Walking time and distance
 *   - Transit time comparison
 *   - Recommendation (walk vs transit)
 *   - Highlights when walking is faster or during significant delays
 *
 * Automatically surfaces for:
 * - Short trips (< 20 min walk, 3 or fewer stops)
 * - When walking is faster than transit
 * - During significant delays (wait time > walking time)
 */

import type { WalkingOption } from "@mta-my-way/shared";
import { formatWalkingDistance, formatWalkingTime } from "@mta-my-way/shared";

export interface WalkComparisonProps {
  walkingOption: WalkingOption;
  /** When the best transit option arrives, in minutes from now */
  transitWaitMinutes?: number;
  /** Whether to show the prominent "walk instead" banner */
  isRecommended?: boolean;
}

export function WalkComparison({
  walkingOption,
  transitWaitMinutes,
  isRecommended,
}: WalkComparisonProps) {
  const { distanceKm, walkingMinutes, transitMinutes, walkingIsFaster, reason } = walkingOption;

  // Determine message based on reason
  const getMessage = (): { title: string; subtitle: string; bgColor: string } => {
    if (walkingIsFaster) {
      return {
        title: "Walk instead",
        subtitle: `Walking saves ${Math.round(transitMinutes - walkingMinutes)} min vs waiting`,
        bgColor: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40",
      };
    }

    if (reason === "delays") {
      return {
        title: "Consider walking",
        subtitle: `Train delayed ${Math.round(transitMinutes - walkingMinutes)} min`,
        bgColor: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40",
      };
    }

    if (reason === "short_trip") {
      return {
        title: "Short trip option",
        subtitle: "Walking could be faster for this distance",
        bgColor: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40",
      };
    }

    return {
      title: "Walking option",
      subtitle: `${formatWalkingTime(walkingMinutes)} via surface streets`,
      bgColor: "bg-surface dark:bg-dark-surface border-border dark:border-dark-border",
    };
  };

  const message = getMessage();

  return (
    <article
      className={`rounded-lg p-4 border ${message.bgColor} ${
        isRecommended ? "ring-2 ring-green-500 dark:ring-green-400" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Walking icon */}
        <div
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
            isRecommended
              ? "bg-green-100 dark:bg-green-800/40 text-green-700 dark:text-green-300"
              : "bg-background dark:bg-dark-background text-text-secondary dark:text-dark-text-secondary"
          }`}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 12h18M3 6h18M3 18h18" />
            <path d="M9 6v6a3 3 0 0 0 6 0V6" />
            <path d="M12 18v-6" />
          </svg>
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-text-primary dark:text-dark-text-primary">
            {message.title}
          </h4>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary mt-0.5">
            {message.subtitle}
          </p>
        </div>
      </div>

      {/* Comparison details */}
      <div className="mt-4 pt-3 border-t border-border dark:border-dark-border">
        <div className="grid grid-cols-3 gap-3">
          {/* Walking time */}
          <div>
            <p className="text-11 text-text-tertiary dark:text-dark-text-tertiary uppercase tracking-wide">
              Walk
            </p>
            <p className="text-base font-semibold text-text-primary dark:text-dark-text-primary tabular-nums">
              {formatWalkingTime(walkingMinutes)}
            </p>
          </div>

          {/* Distance */}
          <div>
            <p className="text-11 text-text-tertiary dark:text-dark-text-tertiary uppercase tracking-wide">
              Distance
            </p>
            <p className="text-base font-semibold text-text-primary dark:text-dark-text-primary tabular-nums">
              {formatWalkingDistance(distanceKm)}
            </p>
          </div>

          {/* Transit time */}
          <div>
            <p className="text-11 text-text-tertiary dark:text-dark-text-tertiary uppercase tracking-wide">
              Transit
            </p>
            <p className="text-base font-semibold text-text-primary dark:text-dark-text-primary tabular-nums">
              {transitMinutes < 999 ? `${Math.round(transitMinutes)} min` : "--"}
            </p>
          </div>
        </div>

        {/* Wait time context */}
        {transitWaitMinutes !== undefined && transitWaitMinutes > 5 && (
          <div className="mt-3 pt-3 border-t border-border dark:border-dark-border">
            <p className="text-12 text-text-secondary dark:text-dark-text-secondary">
              Next train: {transitWaitMinutes} min wait
              {walkingMinutes < transitWaitMinutes && (
                <span className="ml-1 text-amber-600 dark:text-amber-400 font-medium">
                  (longer than walking)
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Walking directions hint */}
      <div className="mt-3 flex items-center gap-2 text-12 text-text-tertiary dark:text-dark-text-tertiary">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>Time based on 4.5 km/h walking speed</span>
      </div>
    </article>
  );
}

export default WalkComparison;
