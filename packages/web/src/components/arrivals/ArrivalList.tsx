/**
 * ArrivalList - Arrivals grouped by direction with compass-aware labels
 *
 * Shows northbound and southbound sections with appropriate labels:
 * - Northbound: "Uptown / Bronx-bound"
 * - Southbound: "Downtown / Brooklyn-bound"
 *
 * Supports filtering by lines and direction preference.
 */

import type { ArrivalTime, DirectionPreference } from "@mta-my-way/shared";
import type { StalenessLevel } from "../../hooks/useStaleness";
import { ArrivalRow } from "./ArrivalRow";

interface ArrivalListProps {
  /** All northbound arrivals */
  northbound: ArrivalTime[];
  /** All southbound arrivals */
  southbound: ArrivalTime[];
  /** Lines to show (if set, filters arrivals to these lines) */
  lines?: string[];
  /** Direction filter: "N", "S", or "both" */
  direction?: DirectionPreference;
  /** Maximum arrivals to show per direction */
  maxPerDirection?: number;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Click handler for individual arrivals */
  onArrivalClick?: (arrival: ArrivalTime) => void;
  /** Staleness level for visual indication of data freshness */
  staleness?: StalenessLevel;
}

/**
 * Filter arrivals by lines if specified
 */
function filterArrivals(arrivals: ArrivalTime[], lines?: string[], max?: number): ArrivalTime[] {
  let filtered = arrivals;
  if (lines && lines.length > 0) {
    filtered = arrivals.filter((a) => lines.includes(a.line));
  }
  if (max !== undefined) {
    filtered = filtered.slice(0, max);
  }
  return filtered;
}

export function ArrivalList({
  northbound,
  southbound,
  lines,
  direction = "both",
  maxPerDirection,
  compact = false,
  onArrivalClick,
  staleness = "fresh",
}: ArrivalListProps) {
  const showNorth = direction === "both" || direction === "N";
  const showSouth = direction === "both" || direction === "S";

  const northToShow = showNorth ? filterArrivals(northbound, lines, maxPerDirection) : [];
  const southToShow = showSouth ? filterArrivals(southbound, lines, maxPerDirection) : [];

  if (northToShow.length === 0 && southToShow.length === 0) {
    return (
      <div className="py-4 text-center text-text-secondary dark:text-dark-text-secondary">
        No upcoming arrivals
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {northToShow.length > 0 && (
        <section aria-labelledby="uptown-heading">
          {!compact && (
            <h3
              id="uptown-heading"
              className="text-lg font-semibold mb-3 text-text-primary dark:text-dark-text-primary"
            >
              Uptown / Bronx-bound
            </h3>
          )}
          <div className={compact ? "space-y-1" : "space-y-2"}>
            {northToShow.map((arrival) => (
              <ArrivalRow
                key={`${arrival.tripId}-${arrival.arrivalTime}`}
                arrival={arrival}
                onClick={onArrivalClick ? () => onArrivalClick(arrival) : undefined}
                compact={compact}
                staleness={staleness}
              />
            ))}
          </div>
        </section>
      )}

      {southToShow.length > 0 && (
        <section aria-labelledby="downtown-heading">
          {!compact && (
            <h3
              id="downtown-heading"
              className="text-lg font-semibold mb-3 text-text-primary dark:text-dark-text-primary"
            >
              Downtown / Brooklyn-bound
            </h3>
          )}
          <div className={compact ? "space-y-1" : "space-y-2"}>
            {southToShow.map((arrival) => (
              <ArrivalRow
                key={`${arrival.tripId}-${arrival.arrivalTime}`}
                arrival={arrival}
                onClick={onArrivalClick ? () => onArrivalClick(arrival) : undefined}
                compact={compact}
                staleness={staleness}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default ArrivalList;
