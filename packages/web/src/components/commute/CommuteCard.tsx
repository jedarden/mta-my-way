/**
 * CommuteCard - Card showing commute analysis with inline expand/collapse.
 *
 * Compact view shows:
 *   - Commute name + origin → destination
 *   - Best route (direct or transfer) with line bullet + time
 *   - "Transfer saves X min" badge when applicable
 *   - Edit button (calls onEdit prop)
 *   - Expand/collapse toggle for TransferDetail
 *
 * Expanded view shows:
 *   - Full TransferDetail (RECOMMENDED, DIRECT, ALSO POSSIBLE sections)
 *   - RouteComparison side-by-side grid when both route types exist
 */

import type { Commute } from "@mta-my-way/shared";
import { formatMinutesAway } from "@mta-my-way/shared";
import { useEffect, useRef, useState } from "react";
import { getBestRoute, useCommute } from "../../hooks/useCommute";
import { ConfidenceBar } from "../arrivals/ConfidenceBar";
import { LineBullet } from "../arrivals/LineBullet";
import { TransferDetail } from "./TransferDetail";

interface CommuteCardProps {
  commute: Commute;
  /** When this value changes the card triggers a re-fetch (pull-to-refresh) */
  forceRefreshId?: number;
  /** Open the editor for this commute (omit to hide edit button) */
  onEdit?: (commute: Commute) => void;
}

export function CommuteCard({ commute, forceRefreshId, onEdit }: CommuteCardProps) {
  const [expanded, setExpanded] = useState(false);

  const { data, status, refresh } = useCommute({
    originId: commute.origin.stationId,
    destinationId: commute.destination.stationId,
    preferredLines: commute.preferredLines,
    commuteId: commute.id,
  });

  // Respond to pull-to-refresh from parent
  const prevRefreshId = useRef(forceRefreshId);
  useEffect(() => {
    if (forceRefreshId !== undefined && forceRefreshId !== prevRefreshId.current) {
      prevRefreshId.current = forceRefreshId;
      refresh();
    }
  }, [forceRefreshId, refresh]);

  const isLoading = status === "loading" && !data;
  const best = data ? getBestRoute(data) : null;
  const bestDirect = data?.directRoutes[0];
  const bestTransfer = data?.transferRoutes[0];
  const timeSavedMin =
    bestTransfer && bestTransfer.timeSavedVsDirect > 0
      ? Math.round(bestTransfer.timeSavedVsDirect / 60)
      : 0;

  // The line bullet(s) for the best route
  const recommendedLines =
    best?.type === "transfer"
      ? (bestTransfer?.legs ?? []).map((l) => l.line)
      : bestDirect
        ? [bestDirect.line]
        : [];

  const bestArrivalConfidence =
    best?.type === "transfer"
      ? bestTransfer?.legs[0]?.nextArrival.confidence
      : bestDirect?.nextArrivals[0]?.confidence;

  // The line for the best route (for confidence tooltip)
  const bestArrivalLineId =
    best?.type === "transfer"
      ? bestTransfer?.legs[0]?.line
      : bestDirect?.line;

  return (
    <article className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-text-primary dark:text-dark-text-primary truncate leading-tight">
            {commute.name}
          </h3>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary truncate">
            {commute.origin.stationName} → {commute.destination.stationName}
          </p>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(commute);
            }}
            className="p-2 min-w-touch min-h-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary rounded-lg"
            aria-label={`Edit ${commute.name} commute`}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="1" />
              <circle cx="19" cy="12" r="1" />
              <circle cx="5" cy="12" r="1" />
            </svg>
          </button>
        )}
      </div>

      {/* Route summary — tappable to expand */}
      <button
        type="button"
        className="w-full px-4 pb-3 text-left"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${commute.name} commute details`}
      >
        {isLoading ? (
          <CommuteSkeleton />
        ) : !data || !best ? (
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary py-1">
            {status === "error" ? "Could not load routes" : "No routes available"}
          </p>
        ) : (
          <div className="space-y-1.5">
            {/* Line bullets + time */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {recommendedLines.map((line, i) => (
                  <span key={`${line}-${i}`} className="flex items-center gap-1">
                    <LineBullet line={line} size="sm" />
                    {i < recommendedLines.length - 1 && (
                      <span
                        className="text-11 text-text-secondary dark:text-dark-text-secondary"
                        aria-hidden="true"
                      >
                        →
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <span className="text-2xl font-extrabold text-text-primary dark:text-dark-text-primary tabular-nums">
                {formatMinutesAway(best.minutes)}
              </span>
              {bestArrivalConfidence && (
                <ConfidenceBar
                  confidence={bestArrivalConfidence}
                  lineId={bestArrivalLineId}
                  className="ml-auto"
                />
              )}
            </div>

            {/* Transfer saves badge */}
            {best.type === "transfer" && timeSavedMin > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-11 font-semibold">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Transfer saves {timeSavedMin} min
              </span>
            )}

            {/* "Or direct" when transfer is recommended */}
            {best.type === "transfer" && bestDirect && (
              <p className="text-13 text-text-secondary dark:text-dark-text-secondary flex items-center gap-1">
                <span>or direct:</span>
                <LineBullet line={bestDirect.line} size="sm" />
                <span>{formatMinutesAway(bestDirect.estimatedTravelMinutes)}</span>
              </p>
            )}
          </div>
        )}

        {/* Expand chevron */}
        {data && best && (
          <div className="flex items-center justify-center mt-2 text-text-secondary dark:text-dark-text-secondary">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        )}
      </button>

      {/* Expanded detail */}
      {expanded && data && (
        <div className="px-4 pb-4 border-t border-background dark:border-dark-background pt-3">
          <TransferDetail analysis={data} />
        </div>
      )}
    </article>
  );
}

function CommuteSkeleton() {
  return (
    <div className="space-y-2 py-1" aria-busy="true" aria-label="Loading commute analysis">
      <div className="h-8 rounded animate-pulse bg-background dark:bg-dark-background w-2/3" />
      <div className="h-4 rounded animate-pulse bg-background dark:bg-dark-background w-1/3" />
    </div>
  );
}

export default CommuteCard;
