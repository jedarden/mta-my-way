/**
 * WalkComparison — side-by-side walking vs transit comparison for short trips.
 *
 * Shows "Walk X min vs wait Y + ride Z min" with visual indicators.
 * During delays (wait > walking time), promotes walking with green highlight.
 */

import type { WalkComparisonResult } from "../../hooks/useWalkComparison";

interface WalkComparisonProps {
  comparison: WalkComparisonResult;
}

export function WalkComparison({ comparison }: WalkComparisonProps) {
  if (!comparison.available || !comparison.isViable) return null;

  const isWalkingPromoted = comparison.walkingIsFaster;

  return (
    <div
      className={`rounded-lg overflow-hidden ${
        isWalkingPromoted
          ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
          : "bg-surface dark:bg-dark-surface"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <WalkingIcon promoted={isWalkingPromoted} />
        <span
          className={`text-13 font-semibold ${
            isWalkingPromoted
              ? "text-green-700 dark:text-green-400"
              : "text-text-secondary dark:text-dark-text-secondary"
          }`}
        >
          {isWalkingPromoted ? "Walking is faster" : "Consider walking"}
        </span>
        <span className="ml-auto text-12 text-text-secondary dark:text-dark-text-secondary">
          {comparison.formattedDistance}
        </span>
      </div>

      {/* Side-by-side comparison */}
      <div className="flex">
        {/* Walk option */}
        <div
          className={`flex-1 px-3 py-3 text-center ${
            isWalkingPromoted ? "bg-green-100/60 dark:bg-green-800/30" : ""
          } ${comparison.recommendation === "similar" ? "border-r border-background dark:border-dark-background" : ""}`}
        >
          <div
            className={`text-2xl font-extrabold tabular-nums ${
              isWalkingPromoted
                ? "text-green-700 dark:text-green-400"
                : "text-text-primary dark:text-dark-text-primary"
            }`}
          >
            {comparison.walkingMinutes}
          </div>
          <div
            className={`text-12 mt-0.5 ${
              isWalkingPromoted
                ? "text-green-600 dark:text-green-500"
                : "text-text-secondary dark:text-dark-text-secondary"
            }`}
          >
            min walk
          </div>
        </div>

        {/* Transit option (only show when different enough to matter) */}
        {comparison.recommendation !== "similar" && (
          <div className="flex-1 px-3 py-3 text-center">
            <div className="text-2xl font-extrabold tabular-nums text-text-secondary dark:text-dark-text-secondary">
              {comparison.transitMinutes}
            </div>
            <div className="text-12 mt-0.5 text-text-secondary dark:text-dark-text-secondary">
              min transit
            </div>
            <div className="text-11 text-text-tertiary dark:text-dark-text-tertiary mt-0.5">
              wait {comparison.waitMinutes} + ride {comparison.rideMinutes}
            </div>
          </div>
        )}

        {/* Similar times */}
        {comparison.recommendation === "similar" && (
          <div className="flex-1 px-3 py-3 text-center">
            <div className="text-13 text-text-secondary dark:text-dark-text-secondary mt-1">
              About the same as transit
            </div>
          </div>
        )}
      </div>

      {/* Delay-specific promotion */}
      {isWalkingPromoted && comparison.reason === "delays" && (
        <div className="px-3 py-2 border-t border-green-200 dark:border-green-800">
          <span className="text-12 text-green-600 dark:text-green-500">
            Long wait ({comparison.waitMinutes} min) — skip the platform
          </span>
        </div>
      )}
    </div>
  );
}

function WalkingIcon({ promoted }: { promoted: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={
        promoted
          ? "text-green-600 dark:text-green-400"
          : "text-text-secondary dark:text-dark-text-secondary"
      }
      aria-hidden="true"
    >
      <circle cx="13.5" cy="6.5" r="2.5" />
      <path d="M17 14l-2-4-2 1v6" />
      <path d="M10 10l-3 7h3" />
    </svg>
  );
}
