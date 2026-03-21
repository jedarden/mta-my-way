/**
 * FavoriteCard - Single favorite station card with inline arrivals.
 *
 * Shows station name (or custom label), configured line bullets,
 * and the next 2-3 arrivals filtered by the favorite's line/direction config.
 * Arrival time is the HERO number: 24px bold.
 * Tapping navigates to the full StationScreen; edit button opens FavoriteEditor.
 */

import { useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Favorite } from "@mta-my-way/shared";
import { useFavoritesStore } from "../../stores/favoritesStore";
import { useArrivals } from "../../hooks/useArrivals";
import { LineBullet } from "../arrivals/LineBullet";
import { ArrivalRow } from "../arrivals/ArrivalRow";

interface FavoriteCardProps {
  favorite: Favorite;
  /** When this value changes the card triggers a re-fetch (pull-to-refresh) */
  forceRefreshId?: number;
  /** Open the editor for this favorite */
  onEdit: (favorite: Favorite) => void;
}

export function FavoriteCard({
  favorite,
  forceRefreshId,
  onEdit,
}: FavoriteCardProps) {
  const navigate = useNavigate();
  const recordTap = useFavoritesStore((s) => s.recordTap);
  const { data, status, refresh } = useArrivals(favorite.stationId);

  // Respond to pull-to-refresh from parent
  const prevRefreshId = useRef(forceRefreshId);
  useEffect(() => {
    if (forceRefreshId !== undefined && forceRefreshId !== prevRefreshId.current) {
      prevRefreshId.current = forceRefreshId;
      refresh();
    }
  }, [forceRefreshId, refresh]);

  // Filter and sort arrivals per the favorite's config, then take top 3
  const arrivals = useMemo(() => {
    if (!data) return [];
    const all = [
      ...(favorite.direction === "both" || favorite.direction === "N"
        ? data.northbound
        : []),
      ...(favorite.direction === "both" || favorite.direction === "S"
        ? data.southbound
        : []),
    ];
    const filtered =
      favorite.lines.length > 0
        ? all.filter((a) => favorite.lines.includes(a.line))
        : all;
    return filtered
      .sort((a, b) => a.minutesAway - b.minutesAway)
      .slice(0, 3);
  }, [data, favorite]);

  const handleCardTap = () => {
    recordTap(favorite.id);
    void navigate(`/station/${favorite.stationId}`);
  };

  const isLoading = status === "loading" && !data;

  return (
    <article className="bg-surface dark:bg-dark-surface rounded-lg overflow-hidden shadow-sm">
      {/* Station header */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-text-primary dark:text-dark-text-primary truncate leading-tight">
            {favorite.label ?? favorite.stationName}
          </h3>
          {favorite.label && (
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary truncate">
              {favorite.stationName}
            </p>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {favorite.lines.map((line) => (
              <LineBullet key={line} line={line} size="sm" />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(favorite);
          }}
          className="p-2 min-w-touch min-h-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary rounded-lg"
          aria-label={`Edit ${favorite.stationName} favorite`}
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

      {/* Arrivals area — tappable to navigate to station */}
      <button
        type="button"
        className="w-full px-4 pb-4 text-left active:bg-black/5 dark:active:bg-white/5 transition-colors"
        onClick={handleCardTap}
        aria-label={`View all arrivals at ${favorite.stationName}`}
      >
        {isLoading ? (
          <ArrivalSkeleton />
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
              />
            ))}
          </div>
        )}
      </button>
    </article>
  );
}

function ArrivalSkeleton() {
  return (
    <div className="space-y-2 py-1" aria-busy="true" aria-label="Loading arrivals">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-8 rounded animate-pulse bg-background dark:bg-dark-background"
          style={{ width: `${70 + i * 8}%` }}
        />
      ))}
    </div>
  );
}

export default FavoriteCard;
