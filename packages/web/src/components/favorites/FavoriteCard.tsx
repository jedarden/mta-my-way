/**
 * FavoriteCard - Single favorite station card with inline arrivals.
 *
 * Shows station name (or custom label), configured line bullets,
 * and the next 2-3 arrivals filtered by the favorite's line/direction config.
 * Arrival time is the HERO number: 24px bold.
 * Tapping navigates to the full StationScreen; edit button opens FavoriteEditor.
 * Swipe left reveals delete action; swipe right reveals edit action.
 */

import type { Favorite } from "@mta-my-way/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const SWIPE_THRESHOLD = 72; // px to commit to reveal
const ACTION_WIDTH = 80; // px width of revealed action panel

export function FavoriteCard({ favorite, forceRefreshId, onEdit }: FavoriteCardProps) {
  const navigate = useNavigate();
  const recordTap = useFavoritesStore((s) => s.recordTap);
  const removeFavorite = useFavoritesStore((s) => s.removeFavorite);
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

  // Swipe gesture state
  const cardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchBaseOffset = useRef(0); // swipeOffset value at touch start
  const isTrackingSwipe = useRef(false);
  const swipeDir = useRef<"left" | "right" | null>(null);
  const liveOffset = useRef(0); // mirrors swipeOffset for use inside effects

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [revealedDir, setRevealedDir] = useState<"left" | "right" | null>(null);
  const [isSnapping, setIsSnapping] = useState(false);

  const snapTo = useCallback((offset: number, revealed: "left" | "right" | null) => {
    setIsSnapping(true);
    liveOffset.current = offset;
    setSwipeOffset(offset);
    setRevealedDir(revealed);
    setTimeout(() => setIsSnapping(false), 220);
  }, []);

  const snapBack = useCallback(() => snapTo(0, null), [snapTo]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0]?.clientX ?? 0;
      touchStartY.current = e.touches[0]?.clientY ?? 0;
      touchBaseOffset.current = liveOffset.current;
      isTrackingSwipe.current = false;
      swipeDir.current = null;
    },
    [] // refs only
  );

  // Non-passive touchmove so we can call preventDefault during horizontal swipe
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const onTouchMove = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX ?? 0;
      const y = e.touches[0]?.clientY ?? 0;
      const deltaX = x - touchStartX.current;
      const deltaY = y - touchStartY.current;

      if (!isTrackingSwipe.current) {
        // Need enough movement to determine intent
        if (Math.abs(deltaX) < 5 && Math.abs(deltaY) < 5) return;
        if (Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
          isTrackingSwipe.current = true;
          swipeDir.current = deltaX < 0 ? "left" : "right";
        } else {
          // Predominantly vertical — let the page scroll
          return;
        }
      }

      e.preventDefault(); // block scroll during horizontal swipe

      const newOffset = Math.max(
        -ACTION_WIDTH * 1.3,
        Math.min(ACTION_WIDTH * 1.3, touchBaseOffset.current + deltaX)
      );
      liveOffset.current = newOffset;
      setSwipeOffset(newOffset);
    };

    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []); // intentionally empty — only refs are accessed inside

  const handleTouchEnd = useCallback(() => {
    if (!isTrackingSwipe.current) return;
    isTrackingSwipe.current = false;

    const offset = liveOffset.current;
    if (offset <= -SWIPE_THRESHOLD) {
      snapTo(-ACTION_WIDTH, "left");
    } else if (offset >= SWIPE_THRESHOLD) {
      snapTo(ACTION_WIDTH, "right");
    } else {
      snapBack();
    }
  }, [snapTo, snapBack]);

  const handleCardTap = useCallback(() => {
    if (revealedDir !== null) {
      snapBack();
      return;
    }
    recordTap(favorite.id);
    void navigate(`/station/${favorite.stationId}`);
  }, [revealedDir, snapBack, recordTap, favorite, navigate]);

  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && revealedDir !== null) {
        e.preventDefault();
        snapBack();
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCardTap();
      }
    },
    [handleCardTap, revealedDir, snapBack]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      removeFavorite(favorite.id);
    },
    [removeFavorite, favorite.id]
  );

  const handleEditAction = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      snapBack();
      onEdit(favorite);
    },
    [onEdit, favorite, snapBack]
  );

  const isLoading = status === "loading" && !data;

  const equipment = data?.equipment ?? [];
  const brokenElevators = equipment.filter((e) => e.type === "elevator").length;
  const brokenEscalators = equipment.filter((e) => e.type === "escalator").length;

  return (
    <div className="relative overflow-hidden rounded-lg shadow-sm">
      {/* Edit action — left side, revealed by swiping right */}
      <div
        className="absolute inset-y-0 left-0 flex items-center justify-center bg-mta-primary"
        style={{ width: `${ACTION_WIDTH}px` }}
        aria-hidden={revealedDir !== "right"}
      >
        <button
          type="button"
          onClick={handleEditAction}
          tabIndex={revealedDir === "right" ? 0 : -1}
          aria-label={`Edit ${encodeForAria(favorite.stationName)} favorite`}
          className="flex flex-col items-center gap-1 text-white"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span className="text-xs font-medium">Edit</span>
        </button>
      </div>

      {/* Delete action — right side, revealed by swiping left */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center bg-severe dark:bg-dark-severe"
        style={{ width: `${ACTION_WIDTH}px` }}
        aria-hidden={revealedDir !== "left"}
      >
        <button
          type="button"
          onClick={handleDelete}
          tabIndex={revealedDir === "left" ? 0 : -1}
          aria-label={`Remove ${encodeForAria(favorite.stationName)} from favorites`}
          className="flex flex-col items-center gap-1 text-white"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
          <span className="text-xs font-medium">Delete</span>
        </button>
      </div>

      {/* Card content — translates on swipe */}
      <article
        ref={cardRef}
        className="bg-surface dark:bg-dark-surface rounded-lg"
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSnapping ? "transform 200ms ease-out" : undefined,
          willChange: "transform",
        }}
        tabIndex={0}
        role="button"
        aria-label={`${encodeForAria(favorite.stationName)}, ${favorite.lines.join(", ")} lines. Press Enter to view arrivals.`}
        onKeyDown={handleCardKeyDown}
        onClick={handleCardTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
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
    </div>
  );
}

export default FavoriteCard;
