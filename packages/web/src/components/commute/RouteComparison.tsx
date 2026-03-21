/**
 * RouteComparison - Side-by-side direct vs transfer route comparison.
 *
 * Shown inline in CommuteCard when analysis data is available and both
 * route types exist. Highlights the recommended option with a border.
 */

import type { CommuteAnalysis } from "@mta-my-way/shared";
import { formatMinutesAway, formatTime } from "@mta-my-way/shared";
import { LineBullet } from "../arrivals/LineBullet";

interface RouteComparisonProps {
  analysis: CommuteAnalysis;
}

export function RouteComparison({ analysis }: RouteComparisonProps) {
  const { directRoutes, transferRoutes, recommendation } = analysis;

  const bestDirect = directRoutes[0];
  const bestTransfer = transferRoutes[0];

  // Only render if both route types exist
  if (!bestDirect || !bestTransfer) return null;

  const directNextArrival = bestDirect.nextArrivals[0];
  const timeSavedMin = Math.round(bestTransfer.timeSavedVsDirect / 60);
  const [firstLeg, secondLeg] = bestTransfer.legs;

  return (
    <div className="grid grid-cols-2 gap-2 mt-2">
      {/* Direct route */}
      <div
        className={[
          "rounded-lg p-3 flex flex-col gap-1.5",
          recommendation === "direct"
            ? "bg-mta-primary/10 ring-1 ring-mta-primary"
            : "bg-background dark:bg-dark-background",
        ].join(" ")}
        aria-label="Direct route"
      >
        <div className="flex items-center gap-1.5">
          <LineBullet line={bestDirect.line} size="sm" />
          {recommendation === "direct" && (
            <span className="text-11 font-semibold text-mta-primary">Best</span>
          )}
        </div>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">Direct</p>
        {directNextArrival && (
          <p className="text-xl font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
            {formatMinutesAway(directNextArrival.minutesAway)}
          </p>
        )}
        <p className="text-11 text-text-secondary dark:text-dark-text-secondary">
          {bestDirect.estimatedTravelMinutes} min ride
        </p>
        <p className="text-11 text-text-secondary dark:text-dark-text-secondary tabular-nums">
          Arr {formatTime(bestDirect.estimatedArrivalAtDestination * 1000)}
        </p>
      </div>

      {/* Transfer route */}
      <div
        className={[
          "rounded-lg p-3 flex flex-col gap-1.5",
          recommendation === "transfer"
            ? "bg-mta-primary/10 ring-1 ring-mta-primary"
            : "bg-background dark:bg-dark-background",
        ].join(" ")}
        aria-label="Transfer route"
      >
        <div className="flex items-center gap-1 flex-wrap">
          {firstLeg && <LineBullet line={firstLeg.line} size="sm" />}
          <span className="text-text-secondary dark:text-dark-text-secondary text-11">→</span>
          {secondLeg && <LineBullet line={secondLeg.line} size="sm" />}
          {recommendation === "transfer" && (
            <span className="text-11 font-semibold text-mta-primary">Best</span>
          )}
        </div>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">Transfer</p>
        {firstLeg && (
          <p className="text-xl font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
            {formatMinutesAway(firstLeg.nextArrival.minutesAway)}
          </p>
        )}
        <p className="text-11 text-text-secondary dark:text-dark-text-secondary">
          {bestTransfer.totalEstimatedMinutes} min total
        </p>
        {timeSavedMin > 0 ? (
          <p className="text-11 font-semibold text-green-600 dark:text-green-400">
            Saves {timeSavedMin} min
          </p>
        ) : (
          <p className="text-11 text-text-secondary dark:text-dark-text-secondary tabular-nums">
            Arr {formatTime(bestTransfer.estimatedArrivalAtDestination * 1000)}
          </p>
        )}
      </div>
    </div>
  );
}

export default RouteComparison;
