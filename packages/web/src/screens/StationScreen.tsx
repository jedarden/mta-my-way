/**
 * StationScreen - Full station detail with live arrivals and add-to-favorites.
 *
 * Shows:
 * - Station name and lines
 * - Alert banners when relevant alerts exist
 * - ArrivalList for both directions (or the filtered direction)
 * - "Updated Xs ago" freshness indicator
 * - Add-to-favorites / already-favorited button
 * - Links to related station complexes (multi-complex stations like Times Square)
 */

import { formatTimeAgo } from "@mta-my-way/shared";
import type { Favorite } from "@mta-my-way/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertBanner } from "../components/alerts";
import { ArrivalList } from "../components/arrivals/ArrivalList";
import { LineBullet } from "../components/arrivals/LineBullet";
import { DataState } from "../components/common/DataState";
import { EmptyArrivals } from "../components/common/EmptyState";
import OfflineBanner from "../components/common/OfflineBanner";
import { ArrivalListSkeleton } from "../components/common/Skeleton";
import { FavoriteEditor } from "../components/favorites/FavoriteEditor";
import BottomNav from "../components/layout/BottomNav";
import { useAlertsForStation } from "../hooks/useAlerts";
import { useArrivals } from "../hooks/useArrivals";
import { useFavorites } from "../hooks/useFavorites";
import { type Station, api } from "../lib/api";

export default function StationScreen() {
  const { stationId } = useParams<{ stationId: string }>();
  const { favorites, addFavorite, updateFavorite, removeFavorite } = useFavorites();

  const [station, setStation] = useState<Station | null>(null);
  const [stationError, setStationError] = useState<string | null>(null);

  // Load station metadata
  useEffect(() => {
    if (!stationId) return;
    setStationError(null);
    api.getStation(stationId).then(setStation, (err) => {
      setStationError(err instanceof Error ? err.message : "Failed to load station");
    });
  }, [stationId]);

  const { data: arrivals, status, refresh, updatedAt } = useArrivals(stationId ?? null);

  // Fetch alerts for this station's lines
  const stationLines = station?.lines ?? [];
  const { alerts: stationAlerts } = useAlertsForStation(stationId ?? null, stationLines);

  // "Updated X ago" display
  const [timeAgoText, setTimeAgoText] = useState("just now");
  useEffect(() => {
    if (!updatedAt) return;
    const update = () => {
      const seconds = Math.floor((Date.now() - updatedAt) / 1000);
      setTimeAgoText(formatTimeAgo(seconds));
    };
    update();
    const interval = setInterval(update, 15_000);
    return () => clearInterval(interval);
  }, [updatedAt]);

  // Favorites management
  const existingFavorite = stationId ? favorites.find((f) => f.stationId === stationId) : undefined;
  const [editingFavorite, setEditingFavorite] = useState<Favorite | null>(null);

  const handleAddFavorite = () => {
    if (!station) return;
    addFavorite({
      stationId: station.id,
      stationName: station.name,
      lines: station.lines,
      direction: "both",
      pinned: false,
    });
  };

  const handleFavoriteButton = () => {
    if (existingFavorite) {
      setEditingFavorite(existingFavorite);
    } else {
      handleAddFavorite();
    }
  };

  const stationName = station?.name ?? arrivals?.stationName ?? `Station ${stationId}`;

  // Focus management: move focus to heading on mount for screen reader users
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [stationId]);

  // Derive error state for arrivals
  const arrivalsError =
    status === "error" || status === "offline" ? "Could not load arrivals" : null;

  return (
    <div className="flex flex-col h-full bg-background dark:bg-dark-background">
      {/* Skip link for keyboard users */}
      <a
        href="#station-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-mta-primary focus:text-white focus:rounded-lg focus:font-medium focus:outline-none"
      >
        Skip to main content
      </a>
      {/* Custom header with back button */}
      <header className="sticky top-0 z-50 bg-background dark:bg-dark-background border-b border-surface dark:border-dark-surface px-4 py-3 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              to="/"
              className="shrink-0 min-h-touch min-w-touch flex items-center justify-center text-mta-primary"
              aria-label="Go back"
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
                <polyline points="15,18 9,12 15,6" />
              </svg>
            </Link>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-bold text-text-primary dark:text-dark-text-primary truncate outline-none"
            >
              {stationName}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleFavoriteButton}
            className="shrink-0 min-h-touch min-w-touch flex items-center justify-center"
            aria-pressed={!!existingFavorite}
            aria-label={
              existingFavorite
                ? `${stationName} is in your favorites`
                : `Add ${stationName} to favorites`
            }
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill={existingFavorite ? "#0039A6" : "none"}
              stroke={existingFavorite ? "#0039A6" : "currentColor"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
      </header>

      <OfflineBanner />
      <main id="station-main" className="flex-1 overflow-y-auto pb-14 p-4" role="main">
        {/* Station error */}
        {stationError ? <p className="text-severe font-medium mb-4">{stationError}</p> : null}

        {/* Line bullets */}
        {!stationError && stationLines.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {stationLines.map((line) => (
              <LineBullet key={line} line={line} size="md" />
            ))}
          </div>
        )}

        {/* Alert banner */}
        {stationAlerts.length > 0 && (
          <div className="mb-4">
            <AlertBanner alerts={stationAlerts} title="Service Alerts" maxVisible={2} />
          </div>
        )}

        {/* Arrivals section */}
        <section aria-labelledby="arrivals-heading" className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="arrivals-heading"
              className="text-lg font-semibold text-text-primary dark:text-dark-text-primary"
            >
              Arrivals
            </h2>
            <button
              type="button"
              onClick={refresh}
              className="text-13 text-mta-primary min-h-touch px-2 flex items-center gap-1"
              aria-label="Refresh arrivals"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={status === "stale" || status === "loading" ? "animate-spin" : ""}
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Refresh
            </button>
          </div>

          <DataState
            status={status}
            data={arrivals}
            error={arrivalsError}
            skeleton={<ArrivalListSkeleton />}
            empty={<EmptyArrivals />}
            staleTimestamp={updatedAt}
            onRetry={refresh}
          >
            {(data) => (
              <div aria-live="polite" aria-atomic="false">
                <ArrivalList northbound={data.northbound} southbound={data.southbound} />
              </div>
            )}
          </DataState>
        </section>

        {/* Footer: freshness */}
        {updatedAt && (
          <p
            className="mt-4 text-center text-13 text-text-secondary dark:text-dark-text-secondary"
            aria-live="polite"
            aria-atomic="true"
          >
            Updated {timeAgoText}
          </p>
        )}
      </main>

      <BottomNav />

      {/* FavoriteEditor modal */}
      {editingFavorite && (
        <FavoriteEditor
          favorite={editingFavorite}
          onSave={(updates) => {
            updateFavorite(editingFavorite.id, updates);
            setEditingFavorite(null);
          }}
          onDelete={() => {
            removeFavorite(editingFavorite.id);
            setEditingFavorite(null);
          }}
          onClose={() => setEditingFavorite(null)}
        />
      )}
    </div>
  );
}
