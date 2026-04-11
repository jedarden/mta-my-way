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

// Context-aware UI adaptation feature disabled to reduce security surface area
// import { useContextAware } from "../hooks/useContextAware";

import { formatTimeAgo } from "@mta-my-way/shared";
import type { Favorite } from "@mta-my-way/shared";
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ComponentErrorBoundary, EmptyFavorites, Skeleton } from "../components/common";
import { CommuteCard } from "../components/commute/CommuteCard";
import { FareTracker } from "../components/fare/FareTracker";
import { FavoritesList } from "../components/favorites/FavoritesList";
import Screen from "../components/layout/Screen";
import { useFavorites } from "../hooks/useFavorites";
import { usePrefetch } from "../hooks/usePrefetch";
import { useFavoritesStore, useSettingsStore } from "../stores";

// Lazy load onboarding flow - only shown once to new users
const OnboardingFlow = lazy(() => import("../components/onboarding/OnboardingFlow"));

// Lazy load modal components - only loaded when needed
const FavoriteEditor = lazy(() =>
  import("../components/favorites/FavoriteEditor").then((m) => ({ default: m.FavoriteEditor }))
);

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

  // Context-aware UI adaptation feature disabled to reduce security surface area
  // const { context, uiHints } = useContextAware();

  // Start geofence-based prefetching for underground pre-fetch
  usePrefetch();

  // Show onboarding flow for first-time users
  if (!onboardingComplete) {
    return (
      <Suspense
        fallback={
          <div
            className="flex items-center justify-center h-dvh"
            role="status"
            aria-live="polite"
            aria-label="Loading"
          >
            <div className="skeleton w-16 h-16 rounded-full" aria-hidden="true" />
            <span className="sr-only">Loading...</span>
          </div>
        }
      >
        <ComponentErrorBoundary componentName="OnboardingFlow">
          <OnboardingFlow />
        </ComponentErrorBoundary>
      </Suspense>
    );
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

  // Auto-refresh - fixed 15 second interval (context-aware feature disabled)
  useEffect(() => {
    if (!hasFavorites) return;

    const interval = 15000; // Fixed 15s interval

    const timer = setInterval(() => {
      triggerRefresh();
    }, interval);

    return () => clearInterval(timer);
  }, [hasFavorites, triggerRefresh]);

  // Fixed section order (context-aware feature disabled)
  const showCommutesFirst = false; // Always show favorites first
  const showFareTracker = true; // Always show fare tracker

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

        {/* Commutes section - shown first during commute context */}
        {showCommutesFirst && commutes.length > 0 && (
          <section aria-labelledby="commutes-heading" className="mb-6">
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
                aria-label="View all commutes"
              >
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {commutes.slice(0, 3).map((commute) => (
                <CommuteCard key={commute.id} commute={commute} forceRefreshId={forceRefreshId} />
              ))}
            </div>
          </section>
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
                aria-label="Add station to favorites"
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
            <EmptyFavorites />
          )}
        </section>

        {/* Fare cap tracker - hidden during active commute */}
        {showFareTracker && (
          <section aria-labelledby="fare-heading" className="mt-6">
            <h2 id="fare-heading" className="sr-only">
              OMNY Fare Cap Tracker
            </h2>
            <FareTracker />
          </section>
        )}

        {/* Commutes section - shown after favorites */}
        {!showCommutesFirst && commutes.length > 0 && (
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
                aria-label="View all commutes"
              >
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {commutes.slice(0, 3).map((commute) => (
                <CommuteCard key={commute.id} commute={commute} forceRefreshId={forceRefreshId} />
              ))}
            </div>
          </section>
        )}

        {/* Updated X ago */}
        {hasFavorites && (
          <p
            className="mt-4 text-center text-13 text-text-secondary dark:text-dark-text-secondary"
            aria-live="polite"
            aria-atomic="true"
          >
            Updated {timeAgoText}
          </p>
        )}

        {/* FavoriteEditor modal */}
        <Suspense fallback={<Skeleton className="w-full h-64" />}>
          {editingFavorite && (
            <FavoriteEditor
              favorite={editingFavorite}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={() => setEditingFavorite(null)}
            />
          )}
        </Suspense>
      </div>
    </Screen>
  );
}
