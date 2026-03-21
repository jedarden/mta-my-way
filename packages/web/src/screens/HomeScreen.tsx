/**
 * HomeScreen - The main dashboard showing favorites with inline arrivals.
 *
 * This is the primary screen and the core value proposition:
 * "Open and see your data in under 3 seconds."
 *
 * Features:
 * - OnboardingFlow for first-time users (GPS-powered 60-second setup)
 * - FavoritesList with inline arrival data per card
 * - "Updated Xs ago" timestamp reflecting last refresh
 * - Pull-to-refresh (touch gesture) with optional haptic feedback
 * - FavoriteEditor modal for inline configuration
 * - Empty state with CTA to search/add stations
 */

import { formatTimeAgo } from "@mta-my-way/shared";
import type { Favorite } from "@mta-my-way/shared";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CommuteCard } from "../components/commute/CommuteCard";
import { FavoriteEditor } from "../components/favorites/FavoriteEditor";
import { FavoritesList } from "../components/favorites/FavoritesList";
import Screen from "../components/layout/Screen";
import OnboardingFlow from "../components/onboarding/OnboardingFlow";
import { useFavorites } from "../hooks/useFavorites";
import { useFavoritesStore, useSettingsStore } from "../stores";

/** How often to tick the "Updated X ago" counter (ms) */
const TIME_AGO_INTERVAL = 15_000;

/** Minimum pull distance (px) to trigger refresh */
const PULL_THRESHOLD = 56;

export default function HomeScreen() {
  const onboardingComplete = useFavoritesStore((s) => s.onboardingComplete);
  const { favorites, hasFavorites, updateFavorite, removeFavorite, reorderFavorites } =
    useFavorites();
  const commutes = useFavoritesStore((s) => s.commutes);
  const hapticFeedback = useSettingsStore((s) => s.hapticFeedback);

  // Show onboarding flow for first-time users
  if (!onboardingComplete) {
    return <OnboardingFlow />;
  }

  // Pull-to-refresh
  const [forceRefreshId, setForceRefreshId] = useState(0);
  const [pullY, setPullY] = useState(0);
  const [isPullActive, setIsPullActive] = useState(false);
  const touchStartY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // "Updated X ago" display
  const lastUpdatedRef = useRef<number | null>(null);
  const [timeAgoText, setTimeAgoText] = useState<string>("just now");
  const timeAgoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimeAgoTicker = useCallback((timestamp: number) => {
    lastUpdatedRef.current = timestamp;
    if (timeAgoTimerRef.current) clearInterval(timeAgoTimerRef.current);

    const update = () => {
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      setTimeAgoText(formatTimeAgo(seconds));
    };
    update();
    timeAgoTimerRef.current = setInterval(update, TIME_AGO_INTERVAL);
  }, []);

  const triggerRefresh = useCallback(() => {
    if (hapticFeedback && navigator.vibrate) navigator.vibrate(10);
    setForceRefreshId((id) => id + 1);
    startTimeAgoTicker(Date.now());
  }, [hapticFeedback, startTimeAgoTicker]);

  // Touch handlers for pull-to-refresh
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const parent = containerRef.current?.parentElement;
    if (parent && parent.scrollTop === 0) {
      touchStartY.current = e.touches[0]?.clientY ?? 0;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === 0) return;
    const deltaY = (e.touches[0]?.clientY ?? 0) - touchStartY.current;
    if (deltaY > 0) {
      // Dampen the pull so it doesn't go too far
      setPullY(Math.min(Math.round(deltaY * 0.45), 72));
      setIsPullActive(true);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (pullY >= PULL_THRESHOLD) {
      triggerRefresh();
    }
    setPullY(0);
    setIsPullActive(false);
    touchStartY.current = 0;
  }, [pullY, triggerRefresh]);

  // FavoriteEditor state
  const [editingFavorite, setEditingFavorite] = useState<Favorite | null>(null);

  const handleSave = useCallback(
    (updates: Partial<Favorite>) => {
      if (editingFavorite) {
        updateFavorite(editingFavorite.id, updates);
        setEditingFavorite(null);
      }
    },
    [editingFavorite, updateFavorite]
  );

  const handleDelete = useCallback(() => {
    if (editingFavorite) {
      removeFavorite(editingFavorite.id);
      setEditingFavorite(null);
    }
  }, [editingFavorite, removeFavorite]);

  return (
    <Screen>
      <div
        ref={containerRef}
        className="px-4 pt-2 pb-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {isPullActive && pullY > 8 && (
          <div
            className="flex items-center justify-center text-13 text-text-secondary dark:text-dark-text-secondary overflow-hidden transition-all"
            style={{ height: pullY }}
            aria-live="polite"
          >
            {pullY >= PULL_THRESHOLD ? "Release to refresh" : "Pull to refresh"}
          </div>
        )}

        {/* Favorites section */}
        <section aria-labelledby="favorites-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="favorites-heading"
              className="text-lg font-semibold text-text-primary dark:text-dark-text-primary"
            >
              Your Stations
            </h2>
            {hasFavorites && (
              <Link
                to="/search"
                className="text-13 text-mta-primary font-medium min-h-touch flex items-center px-2"
              >
                + Add
              </Link>
            )}
          </div>

          {hasFavorites ? (
            <FavoritesList
              favorites={favorites}
              forceRefreshId={forceRefreshId}
              onEdit={setEditingFavorite}
              onReorder={reorderFavorites}
            />
          ) : (
            <EmptyState />
          )}
        </section>

        {/* Commutes section */}
        {commutes.length > 0 && (
          <section aria-labelledby="commutes-heading" className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2
                id="commutes-heading"
                className="text-lg font-semibold text-text-primary dark:text-dark-text-primary"
              >
                Your Commutes
              </h2>
              <Link
                to="/commute"
                className="text-13 text-mta-primary font-medium min-h-touch flex items-center px-2"
              >
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {commutes.slice(0, 3).map((commute) => (
                <CommuteCard
                  key={commute.id}
                  commute={commute}
                  forceRefreshId={forceRefreshId}
                />
              ))}
            </div>
          </section>
        )}

        {/* Updated X ago */}
        {hasFavorites && (
          <p className="mt-4 text-center text-13 text-text-secondary dark:text-dark-text-secondary">
            Updated {timeAgoText}
          </p>
        )}

        {/* FavoriteEditor modal */}
        {editingFavorite && (
          <FavoriteEditor
            favorite={editingFavorite}
            onSave={handleSave}
            onDelete={handleDelete}
            onClose={() => setEditingFavorite(null)}
          />
        )}
      </div>
    </Screen>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
      <p className="text-text-secondary dark:text-dark-text-secondary mb-1 text-base">
        No favorites yet
      </p>
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-4">
        Search for a station to add it here
      </p>
      <Link
        to="/search"
        className="inline-flex items-center justify-center px-5 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
      >
        Add your first station
      </Link>
    </div>
  );
}
