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
}: ArrivalRowProps) {
  const { line, destination, minutesAway, confidence, isAssigned, isExpress } = arrival;

  // Format arrival time - "now", "2 min", "12 min"
  const timeDisplay = formatMinutesAway(minutesAway);
  const stalenessClass = getStalenessClass(staleness);

  // In compact mode, show less info
  if (compact) {
    return (
      <div
        className={`
          flex items-center gap-2 py-1 transition-opacity duration-300
          ${stalenessClass}
          ${onClick ? "cursor-pointer active:bg-surface dark:active:bg-dark-surface" : ""}
        `}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
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
        <span className="text-2xl font-extrabold text-text-primary dark:text-dark-text-primary tabular-nums">
          {timeDisplay}
        </span>
        <ConfidenceBar confidence={confidence} lineId={line} className="ml-auto" />
      </div>
    );
  }

  return (
    <div
      className={`
        flex items-center gap-3 py-3 px-4
        bg-surface dark:bg-dark-surface rounded-lg
        transition-opacity duration-300
        ${stalenessClass}
        ${onClick ? "cursor-pointer active:opacity-80" : ""}
        min-h-touch
      `}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
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
        <div className="flex items-center gap-2">
          {isExpress && <ExpressBadge />}
          {!isAssigned && (
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary">Scheduled</p>
          )}
        </div>
      </div>

      {/* Arrival time - HERO number */}
      <div className="flex flex-col items-end">
        <span className="text-2xl font-extrabold text-text-primary dark:text-dark-text-primary tabular-nums">
          {timeDisplay}
        </span>
        <ConfidenceBar confidence={confidence} lineId={line} />
      </div>
    </div>
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
