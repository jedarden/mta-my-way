/**
 * RecommendationWhy - Why the engine recommended this route.
 *
 * TransferEngine computes recommendationDetails (reason, confidence, risks,
 * timeSavedMinutes, isStale) for every analysis; this is the only place those
 * fields reach the screen. Rendered full-width by TransferDetail and as a
 * compact strip under RouteComparison's side-by-side grid.
 */

import type { RecommendationDetails } from "@mta-my-way/shared";

interface RecommendationWhyProps {
  details: RecommendationDetails;
  /** Compact single-row variant for the RouteComparison grid. */
  compact?: boolean;
}

const CONFIDENCE_LABEL: Record<RecommendationDetails["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const CONFIDENCE_BADGE_CLASS: Record<RecommendationDetails["confidence"], string> = {
  high: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  medium: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  low: "bg-red-500/10 text-red-600 dark:bg-red-900/20 dark:text-red-400",
};

export function RecommendationWhy({ details, compact = false }: RecommendationWhyProps) {
  const confidenceBadge = (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-10 font-bold uppercase tracking-wide shrink-0 ${CONFIDENCE_BADGE_CLASS[details.confidence]}`}
      aria-label={`${CONFIDENCE_LABEL[details.confidence]} recommendation`}
    >
      {CONFIDENCE_LABEL[details.confidence]}
    </span>
  );

  const timeSaved = details.timeSavedMinutes > 0 && (
    <span className="text-11 font-semibold text-green-600 dark:text-green-400 shrink-0 tabular-nums">
      Saves {details.timeSavedMinutes} min
    </span>
  );

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 mt-2 bg-surface dark:bg-dark-surface rounded-lg"
        aria-label="Why this route is recommended"
      >
        {confidenceBadge}
        <p className="flex-1 min-w-0 text-11 text-text-secondary dark:text-dark-text-secondary truncate">
          {details.reason}
        </p>
        {details.isStale && <StaleBadge />}
        {timeSaved}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="recommendation-why-heading"
      className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden"
    >
      {/* Header: verdict quality */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-background dark:border-dark-background">
        <h3
          id="recommendation-why-heading"
          className="text-11 font-semibold uppercase tracking-wider text-text-secondary dark:text-dark-text-secondary"
        >
          Why
        </h3>
        {confidenceBadge}
        {details.isStale && <StaleBadge />}
        {timeSaved && <span className="ml-auto flex items-center">{timeSaved}</span>}
      </div>

      {/* Reason */}
      <div className="px-4 py-3 space-y-2">
        <p className="text-13 text-text-primary dark:text-dark-text-primary">{details.reason}</p>

        {/* Risk factors */}
        {details.risks.length > 0 && (
          <ul className="space-y-1" aria-label="Risk factors">
            {details.risks.map((risk, i) => (
              <li
                key={`risk-${i}`}
                className="flex items-start gap-1.5 text-12 text-text-secondary dark:text-dark-text-secondary"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Stale data badge ─────────────────────────────────────────────────────

function StaleBadge() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-10 font-bold uppercase tracking-wide bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 shrink-0"
      aria-label="Recommendation based on stale data"
      title="This recommendation is based on stale feed data"
    >
      Stale
    </span>
  );
}

export default RecommendationWhy;
