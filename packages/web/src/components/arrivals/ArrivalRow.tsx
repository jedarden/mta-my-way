/**
 * ArrivalRow - Single arrival display with line bullet, destination, and time
 *
 * The arrival time is the HERO number: 24px, 800 weight.
 * Shows confidence indicator via ConfidenceBar component.
 *
 * Staleness visualization (per plan.md):
 *   - 'fresh': normal display
 *   - 'fading': opacity reduced (data 2-5 min old)
 *   - 'stale': grayscale + more opacity (data >5 min old)
 */

import type { ArrivalTime } from "@mta-my-way/shared";
import { formatMinutesAway } from "@mta-my-way/shared";
import { computeFeedFreshness } from "../../hooks/useFeedFreshness";
import type { StalenessLevel } from "../../hooks/useStaleness";
import { ConfidenceBar } from "./ConfidenceBar";
import { LineBullet } from "./LineBullet";

interface ArrivalRowProps {
  /** Arrival data */
  arrival: ArrivalTime;
  /** Click handler for the row (e.g., to track this train) */
  onClick?: () => void;
  /** Whether to show the line bullet */
  showLine?: boolean;
  /** Compact mode for inline display in FavoriteCard */
  compact?: boolean;
  /** Staleness level for visual indication */
  staleness?: StalenessLevel;
  /** Show "I'm on this train" button */
  showTrackButton?: boolean;
  /** Handler for "I'm on this train" button */
  onTrackTrip?: () => void;
  /** Whether this arrival is an offline estimate (not live data) */
  isEstimated?: boolean;
}

/** Map staleness level to Tailwind classes */
function getStalenessClass(staleness: StalenessLevel): string {
  switch (staleness) {
    case "stale":
      return "opacity-50 grayscale-[50%]";
    case "fading":
      return "opacity-70";
    default:
      return "";
  }
}

export function ArrivalRow({
  arrival,
  onClick,
  showLine = true,
  compact = false,
  staleness = "fresh",
  showTrackButton = false,
  onTrackTrip,
  isEstimated = false,
}: ArrivalRowProps) {
  const { line, destination, minutesAway, confidence, isAssigned, isExpress, feedAge } = arrival;

  // Format arrival time - "now", "2 min", "12 min"
  const timeDisplay = formatMinutesAway(minutesAway);
  const stalenessClass = getStalenessClass(staleness);

  // Per-arrival feed freshness for visual indicators
  const freshness = computeFeedFreshness(feedAge);

  // Merge per-arrival freshness with station-level staleness
  const feedTintClass = freshness.isOutdated
    ? "opacity-50 grayscale-[50%]"
    : freshness.isStale
      ? "ring-1 ring-amber-400/30"
      : "";
  const mergedClass = stalenessClass || feedTintClass;

  // In compact mode, show less info
  if (compact) {
    const accessibleLabel = `${line} train to ${destination}, ${timeDisplay}${isExpress ? ", express" : ""}${isEstimated ? ", estimated" : ""}${freshness.isOutdated ? ", data may be outdated" : ""}`;

    return (
      <div
        className={`
          flex items-center gap-2 py-1 transition-opacity duration-300
          ${mergedClass}
          ${onClick ? "cursor-pointer active:bg-surface dark:active:bg-dark-surface" : ""}
        `}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={onClick ? accessibleLabel : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        {showLine && <LineBullet line={line} size="sm" />}
        {isExpress && <ExpressBadge />}
        {isEstimated && <EstimatedBadge />}
        <span
          className="text-2xl font-extrabold text-text-primary dark:text-dark-text-primary tabular-nums"
          aria-hidden="true"
        >
          {timeDisplay}
        </span>
        <ConfidenceBar confidence={confidence} lineId={line} className="ml-auto" />
        {freshness.isOutdated && (
          <span className="text-10 text-red-500 dark:text-red-400 shrink-0" aria-live="polite">
            stale
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className={`
          flex items-center gap-3 py-3 px-4
          bg-surface dark:bg-dark-surface rounded-lg
          transition-opacity duration-300
          ${showTrackButton && !compact ? "rounded-b-none" : ""}
          ${mergedClass}
          ${onClick ? "cursor-pointer active:opacity-80" : ""}
          min-h-touch
        `}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        aria-label={
          onClick
            ? `${line} train to ${destination}, arriving in ${timeDisplay}${isExpress ? ", express" : ""}${isEstimated ? ", estimated" : ""}${freshness.isOutdated ? ", data may be outdated" : ""}`
            : undefined
        }
        onKeyDown={(e) => {
          if (onClick && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {/* Line bullet */}
        {showLine && <LineBullet line={line} size="md" />}

        {/* Destination */}
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-text-primary dark:text-dark-text-primary truncate">
            {destination}
          </p>
          <div className="flex items-center gap-2" role="group" aria-label="Trip details">
            {isExpress && <ExpressBadge />}
            {isEstimated && <EstimatedBadge />}
            {!isAssigned && (
              <p className="text-13 text-text-secondary dark:text-dark-text-secondary">Scheduled</p>
            )}
            {freshness.isOutdated && (
              <p className="text-12 text-red-500 dark:text-red-400" role="note">
                (data may be outdated)
              </p>
            )}
          </div>
        </div>

        {/* Arrival time - HERO number */}
        <div className="flex flex-col items-end" aria-label={`Arrives in ${timeDisplay}`}>
          <span
            className="text-2xl font-extrabold text-text-primary dark:text-dark-text-primary tabular-nums"
            aria-hidden="true"
          >
            {timeDisplay}
          </span>
          <ConfidenceBar confidence={confidence} lineId={line} />
        </div>
      </div>

      {/* "I'm on this train" button */}
      {showTrackButton && !compact && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTrackTrip?.();
          }}
          className={`
            w-full py-2 rounded-b-lg
            text-13 font-semibold text-mta-primary
            bg-mta-primary/5 hover:bg-mta-primary/10
            active:bg-mta-primary/15 transition-colors
            ${mergedClass}
          `}
          aria-label={`Track ${destination} train`}
        >
          I'm on this train
        </button>
      )}
    </>
  );
}

export default ArrivalRow;

// ─── Express badge ────────────────────────────────────────────────────────

function ExpressBadge() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-10 font-bold uppercase tracking-wide bg-mta-primary/10 text-mta-primary"
      aria-label="Express service"
      title="Express service — skips stops"
    >
      EXP
    </span>
  );
}

// ─── Estimated badge (offline countdown) ───────────────────────────────────

function EstimatedBadge() {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-10 font-bold uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400"
      aria-label="Estimated time based on cached data"
      title="Offline estimate — refresh when connected"
    >
      EST
    </span>
  );
}
