/**
 * TransferDetail - Full commute analysis with RECOMMENDED, DIRECT, and ALSO POSSIBLE sections.
 *
 * Shows each route's leg-by-leg breakdown including:
 *   - Board/alight stations
 *   - Next arrival time (minutesAway)
 *   - Estimated travel time per leg
 *   - Transfer station and walk time
 *   - Estimated arrival at destination
 *
 * Note: arrivalTime and estimatedArrivalAtDestination from the engine are Unix
 * timestamps in seconds. Use * 1000 when passing to formatTime / new Date().
 */

import type { CommuteAnalysis, DirectRoute, TransferRoute } from "@mta-my-way/shared";
import { formatMinutesAway, formatTime } from "@mta-my-way/shared";
import { ConfidenceBar } from "../arrivals/ConfidenceBar";
import { LineBullet } from "../arrivals/LineBullet";

interface TransferDetailProps {
  analysis: CommuteAnalysis;
}

export function TransferDetail({ analysis }: TransferDetailProps) {
  const { directRoutes, transferRoutes, recommendation } = analysis;

  const bestDirect = directRoutes[0] ?? null;
  const bestTransfer = transferRoutes[0] ?? null;
  const timeSavedMin =
    bestTransfer && bestTransfer.timeSavedVsDirect > 0
      ? Math.round(bestTransfer.timeSavedVsDirect / 60)
      : 0;

  const hasNoRoutes = !bestDirect && !bestTransfer;

  if (hasNoRoutes) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-text-secondary dark:text-dark-text-secondary">
          No routes found between these stations
        </p>
      </div>
    );
  }

  // RECOMMENDED = the engine's top pick
  const recommendedRoute =
    recommendation === "transfer" && bestTransfer ? bestTransfer : bestDirect;
  const recommendedType = recommendation === "transfer" && bestTransfer ? "transfer" : "direct";

  // ALSO POSSIBLE = remaining options after the best
  const alsoDirectRoutes = recommendedType === "direct" ? directRoutes.slice(1) : directRoutes;
  const alsoTransferRoutes =
    recommendedType === "transfer" ? transferRoutes.slice(1) : transferRoutes;

  return (
    <div className="space-y-4">
      {/* Saves badge */}
      {recommendation === "transfer" && timeSavedMin > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600 dark:text-green-400 shrink-0"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-13 font-semibold text-green-700 dark:text-green-400">
            Transfer saves {timeSavedMin} min
          </span>
        </div>
      )}

      {/* RECOMMENDED */}
      {recommendedRoute && (
        <section aria-labelledby="recommended-heading">
          <h3
            id="recommended-heading"
            className="text-11 font-semibold uppercase tracking-wider text-mta-primary mb-2 px-1"
          >
            Recommended
          </h3>
          {recommendedType === "transfer" ? (
            <TransferRouteDetail route={recommendedRoute as TransferRoute} />
          ) : (
            <DirectRouteDetail route={recommendedRoute as DirectRoute} />
          )}
        </section>
      )}

      {/* DIRECT */}
      {recommendedType !== "direct" && bestDirect && (
        <section aria-labelledby="direct-heading">
          <h3
            id="direct-heading"
            className="text-11 font-semibold uppercase tracking-wider text-text-secondary dark:text-dark-text-secondary mb-2 px-1"
          >
            Direct
          </h3>
          <DirectRouteDetail route={bestDirect} />
        </section>
      )}

      {/* ALSO POSSIBLE */}
      {(alsoDirectRoutes.length > 0 || alsoTransferRoutes.length > 0) && (
        <section aria-labelledby="also-heading">
          <h3
            id="also-heading"
            className="text-11 font-semibold uppercase tracking-wider text-text-secondary dark:text-dark-text-secondary mb-2 px-1"
          >
            Also Possible
          </h3>
          <div className="space-y-2">
            {alsoDirectRoutes.map((route, i) => (
              <DirectRouteDetail key={`direct-${i}`} route={route} compact />
            ))}
            {alsoTransferRoutes.map((route, i) => (
              <TransferRouteDetail key={`transfer-${i}`} route={route} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Direct route display ──────────────────────────────────────────────────

interface DirectRouteDetailProps {
  route: DirectRoute;
  compact?: boolean;
}

function DirectRouteDetail({ route, compact = false }: DirectRouteDetailProps) {
  const nextArrival = route.nextArrivals[0];
  const arrivalAtDest = formatTime(route.estimatedArrivalAtDestination * 1000);

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg">
        <LineBullet line={route.line} size="sm" />
        {route.isExpress && <ExpressBadge />}
        <div className="flex-1 min-w-0">
          <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
            Direct ·{" "}
          </span>
          <span className="text-13 text-text-primary dark:text-dark-text-primary">
            {route.estimatedTravelMinutes} min ride
          </span>
        </div>
        {nextArrival && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-base font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
              {formatMinutesAway(nextArrival.minutesAway)}
            </span>
            <ConfidenceBar confidence={nextArrival.confidence} lineId={route.line} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden">
      {/* Next arrival row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-background dark:border-dark-background">
        <LineBullet line={route.line} size="md" />
        {route.isExpress && <ExpressBadge />}
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-text-primary dark:text-dark-text-primary">
            {nextArrival
              ? `Board in ${formatMinutesAway(nextArrival.minutesAway)}`
              : "No upcoming trains"}
          </p>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {route.estimatedTravelMinutes} min ride · no transfer
          </p>
        </div>
        {nextArrival && <ConfidenceBar confidence={nextArrival.confidence} lineId={route.line} />}
      </div>

      {/* Estimated arrival */}
      <div className="px-4 py-2 flex items-center justify-between">
        <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
          Est. arrival
        </span>
        <span className="text-base font-semibold text-text-primary dark:text-dark-text-primary tabular-nums">
          {arrivalAtDest}
        </span>
      </div>
    </div>
  );
}

// ─── Transfer route display ────────────────────────────────────────────────

interface TransferRouteDetailProps {
  route: TransferRoute;
  compact?: boolean;
}

function TransferRouteDetail({ route, compact = false }: TransferRouteDetailProps) {
  const [firstLeg, secondLeg] = route.legs;
  if (!firstLeg || !secondLeg) return null;

  const arrivalAtDest = formatTime(route.estimatedArrivalAtDestination * 1000);

  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 bg-surface dark:bg-dark-surface rounded-lg">
        <LineBullet line={firstLeg.line} size="sm" />
        {firstLeg.isExpress && <ExpressBadge />}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-secondary dark:text-dark-text-secondary"
          aria-hidden="true"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        <LineBullet line={secondLeg.line} size="sm" />
        {secondLeg.isExpress && <ExpressBadge />}
        <div className="flex-1 min-w-0">
          <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
            Transfer · {route.totalEstimatedMinutes} min
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-base font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
            {formatMinutesAway(firstLeg.nextArrival.minutesAway)}
          </span>
          <ConfidenceBar confidence={firstLeg.nextArrival.confidence} lineId={firstLeg.line} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden">
      {/* First leg */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-background dark:border-dark-background">
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <LineBullet line={firstLeg.line} size="md" />
          {/* Connector line */}
          <div className="w-px h-6 bg-surface-secondary dark:bg-dark-surface rounded-full" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-text-primary dark:text-dark-text-primary">
            Board in{" "}
            <span className="text-2xl font-extrabold tabular-nums">
              {formatMinutesAway(firstLeg.nextArrival.minutesAway)}
            </span>
          </p>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {firstLeg.boardAt.stationName} → {firstLeg.alightAt.stationName}
          </p>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {firstLeg.estimatedTravelMinutes} min ride
          </p>
        </div>
        {firstLeg.isExpress && <ExpressBadge />}
        <ConfidenceBar confidence={firstLeg.nextArrival.confidence} lineId={firstLeg.line} />
      </div>

      {/* Transfer station */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-background dark:border-dark-background bg-background/50 dark:bg-dark-background/30">
        <div className="w-8 h-8 flex items-center justify-center text-text-secondary dark:text-dark-text-secondary">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
        </div>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
          Transfer at{" "}
          <span className="font-medium text-text-primary dark:text-dark-text-primary">
            {route.transferStation.stationName}
          </span>
        </p>
      </div>

      {/* Second leg */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-background dark:border-dark-background">
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <LineBullet line={secondLeg.line} size="md" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-medium text-text-primary dark:text-dark-text-primary">
            Board in{" "}
            <span className="font-bold tabular-nums">
              {formatMinutesAway(secondLeg.nextArrival.minutesAway)}
            </span>
          </p>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {secondLeg.boardAt.stationName} → {secondLeg.alightAt.stationName}
          </p>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {secondLeg.estimatedTravelMinutes} min ride
          </p>
        </div>
        {secondLeg.isExpress && <ExpressBadge />}
        <ConfidenceBar confidence={secondLeg.nextArrival.confidence} lineId={secondLeg.line} />
      </div>

      {/* Estimated arrival */}
      <div className="px-4 py-2 flex items-center justify-between">
        <div>
          <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
            Est. arrival ·{" "}
          </span>
          <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {route.totalEstimatedMinutes} min total
          </span>
        </div>
        <span className="text-base font-semibold text-text-primary dark:text-dark-text-primary tabular-nums">
          {arrivalAtDest}
        </span>
      </div>
    </div>
  );
}

export default TransferDetail;

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
