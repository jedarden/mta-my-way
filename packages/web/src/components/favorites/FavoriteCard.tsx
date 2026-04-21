/**
 * FavoriteCard - Single favorite station card with inline arrivals.
 *
 * Shows station name (or custom label), configured line bullets,
 * and the next 2-3 arrivals filtered by the favorite's line/direction config.
 * Arrival time is the HERO number: 24px bold.
 * Tapping navigates to the full StationScreen; edit button opens FavoriteEditor.
 */

import type { Favorite } from "@mta-my-way/shared";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useArrivals } from "../../hooks/useArrivals";
import { useOfflineCountdown } from "../../hooks/useOfflineCountdown";
import { useStaleness } from "../../hooks/useStaleness";
import { encodeForAria, sanitizeUserInput } from "../../lib/outputEncoding";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { ArrivalRow } from "../arrivals/ArrivalRow";
import { LineBullet } from "../arrivals/LineBullet";
import { ArrivalRowSkeleton } from "../common/Skeleton";
import { EquipmentBadge } from "../equipment/EquipmentBadge";

interface FavoriteCardProps {
  favorite: Favorite;
  /** When this value changes the card triggers a re-fetch (pull-to-refresh) */
  forceRefreshId?: number;
  /** Open the editor for this favorite */
  onEdit: (favorite: Favorite) => void;
}

export function FavoriteCard({ favorite, forceRefreshId, onEdit }: FavoriteCardProps) {
  const navigate = useNavigate();
  const recordTap = useFavoritesStore((s) => s.recordTap);
  const { data, status, refresh, updatedAt } = useArrivals(favorite.stationId);
  const staleness = useStaleness(updatedAt);
  const { isActive: isOfflineCountdown, arrivals: offlineArrivals } = useOfflineCountdown(
    favorite.stationId
  );

  // Respond to pull-to-refresh from parent
  const prevRefreshId = useRef(forceRefreshId);
  useEffect(() => {
    if (forceRefreshId !== undefined && forceRefreshId !== prevRefreshId.current) {
      prevRefreshId.current = forceRefreshId;
      refresh();
    }
  }, [forceRefreshId, refresh]);

  // Filter and sort arrivals per the favorite's config, then take top 3
  // When offline countdown is active, use estimated data instead
  const arrivals = useMemo(() => {
    const source = isOfflineCountdown && offlineArrivals ? offlineArrivals : data;
    if (!source) return [];
    const all = [
      ...(favorite.direction === "both" || favorite.direction === "N" ? source.northbound : []),
      ...(favorite.direction === "both" || favorite.direction === "S" ? source.southbound : []),
    ];
    const filtered =
      favorite.lines.length > 0 ? all.filter((a) => favorite.lines.includes(a.line)) : all;
    return filtered.sort((a, b) => a.minutesAway - b.minutesAway).slice(0, 3);
  }, [data, offlineArrivals, isOfflineCountdown, favorite]);

  const handleCardTap = () => {
    recordTap(favorite.id);
    void navigate(`/station/${favorite.stationId}`);
  };

  // Keyboard handler for card navigation
  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCardTap();
      }
    },
    [handleCardTap]
  );

  const isLoading = status === "loading" && !data;

  // Extract equipment info from injected arrivals data
  const equipment = data?.equipment ?? [];
  const brokenElevators = equipment.filter((e) => e.type === "elevator").length;
  const brokenEscalators = equipment.filter((e) => e.type === "escalator").length;

  return (
    <article
      className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden shadow-sm"
      tabIndex={0}
      role="button"
      aria-label={`${encodeForAria(favorite.stationName)}, ${favorite.lines.join(", ")} lines. Press Enter to view arrivals.`}
      onKeyDown={handleCardKeyDown}
      onClick={handleCardTap}
    >
      {/* Station header */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-text-primary dark:text-dark-text-primary truncate leading-tight">
            {sanitizeUserInput(favorite.label ?? favorite.stationName)}
          </h3>
          {favorite.label && (
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary truncate">
              {sanitizeUserInput(favorite.stationName)}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5 items-center">
            {favorite.lines.map((line) => (
              <LineBullet key={line} line={line} size="sm" />
            ))}
            {(brokenElevators > 0 || brokenEscalators > 0) && (
              <EquipmentBadge
                brokenElevators={brokenElevators}
                brokenEscalators={brokenEscalators}
              />
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(favorite);
          }}
          className="p-2 min-w-touch min-h-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary rounded-lg"
          aria-label={`Edit ${encodeForAria(favorite.stationName)} favorite`}
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
      </div>

      {/* Arrivals area — visual display, card click handles navigation */}
      <div className="w-full px-4 pb-4 text-left active:bg-black/5 dark:active:bg-white/5 transition-colors">
        <div aria-live="polite" aria-atomic="false">
          {isLoading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading arrivals">
              {[1, 2, 3].map((i) => (
                <ArrivalRowSkeleton key={i} />
              ))}
            </div>
          ) : arrivals.length === 0 ? (
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary py-2">
              No upcoming arrivals
            </p>
          ) : (
            <div className="space-y-1">
              {arrivals.map((arrival) => (
                <ArrivalRow
                  key={`${arrival.tripId}-${arrival.arrivalTime}`}
                  arrival={arrival}
                  compact
                  staleness={staleness.level}
                  isEstimated={"isEstimated" in arrival && arrival.isEstimated === true}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default FavoriteCard;
