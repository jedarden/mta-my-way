/**
 * TripProgress - Visual progress bar showing trip completion percentage.
 *
 * Displays:
 * - Linear progress bar with percentage
 * - Stop count (X of Y stops remaining)
 * - ETA with delay adjustment if available
 * - Delay risk indicator
 */

import type { DelayRisk } from "../../hooks/useTripTracker";

interface TripProgressProps {
  progressPercent: number;
  remainingStops: number;
  totalStops: number;
  baseEtaMinutes: number | null;
  delayRisk: DelayRisk | null;
  delayMinutesRange: string | null;
  adjustedEtaMinutes: number | null;
}

export function TripProgress({
  progressPercent,
  remainingStops,
  totalStops,
  baseEtaMinutes,
  delayRisk,
  delayMinutesRange,
  adjustedEtaMinutes,
}: TripProgressProps) {
  // Determine progress bar color based on delay risk
  const getProgressColor = () => {
    if (delayRisk === "high") return "bg-severe";
    if (delayRisk === "medium") return "bg-warning";
    return "bg-mta-primary";
  };

  // Get ETA display text
  const getEtaDisplay = (): string => {
    if (adjustedEtaMinutes !== null && baseEtaMinutes !== null) {
      const diff = adjustedEtaMinutes - baseEtaMinutes;
      if (Math.abs(diff) >= 1) {
        return `${adjustedEtaMinutes} min (${diff > 0 ? "+" : ""}${diff} min)`;
      }
    }
    return baseEtaMinutes !== null ? `${baseEtaMinutes} min` : "--";
  };

  // Get delay risk description
  const getDelayRiskLabel = (): string | null => {
    if (delayRisk === "high") return "High delay risk";
    if (delayRisk === "medium") return "Possible delays";
    if (delayRisk === "low") return "On track";
    return null;
  };

  const progressColor = getProgressColor();
  const etaDisplay = getEtaDisplay();
  const delayRiskLabel = getDelayRiskLabel();

  return (
    <div className="bg-surface dark:bg-dark-surface rounded-lg p-4">
      {/* Header with ETA */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            ETA to destination
          </p>
          <p className="text-2xl font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
            {etaDisplay}
          </p>
        </div>
        {delayRiskLabel && (
          <div
            className={`px-3 py-1 rounded-full text-12 font-medium ${
              delayRisk === "high"
                ? "bg-severe/10 text-severe"
                : delayRisk === "medium"
                  ? "bg-warning/10 text-warning"
                  : "bg-success/10 text-success"
            }`}
          >
            {delayRiskLabel}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-13 text-text-secondary dark:text-dark-text-secondary mb-1">
          <span>Progress</span>
          <span className="tabular-nums">{progressPercent}%</span>
        </div>
        <div className="h-2 bg-background dark:bg-dark-background rounded-full overflow-hidden">
          <div
            className={`h-full ${progressColor} transition-all duration-500 ease-out`}
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Trip ${progressPercent}% complete`}
          />
        </div>
      </div>

      {/* Stop count */}
      <div className="flex items-center justify-between text-13 text-text-secondary dark:text-dark-text-secondary">
        <span>
          {remainingStops} stop{remainingStops !== 1 ? "s" : ""} remaining
        </span>
        <span>of {totalStops} total</span>
      </div>

      {/* Delay adjustment indicator */}
      {delayMinutesRange && delayRisk !== "low" && (
        <div className="mt-3 pt-3 border-t border-background dark:border-dark-background">
          <p className="text-12 text-text-secondary dark:text-dark-text-secondary">
            Adjusted for current conditions: {delayMinutesRange}
          </p>
        </div>
      )}
    </div>
  );
}
