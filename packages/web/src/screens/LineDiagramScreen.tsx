/**
 * LineDiagramScreen - Live train positions diagram for a specific line.
 *
 * Shows an SVG schematic with:
 * - All stations on the line (terminals and transfer stations labeled)
 * - Live train positions as colored dots
 * - Northbound trains above, southbound below
 * - User's next train highlighted with pulsing animation
 * - Tap any train dot to see trip details
 */

import type { InterpolatedTrainPosition } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { LineBullet } from "../components/arrivals/LineBullet";
import { DataState } from "../components/common/DataState";
import EmptyState from "../components/common/EmptyState";
import OfflineBanner from "../components/common/OfflineBanner";
import { TrainDiagram, TrainDotDetails } from "../components/diagram";
import BottomNav from "../components/layout/BottomNav";
import { usePositions } from "../hooks";
import { api } from "../lib/api";

interface RouteInfo {
  id: string;
  shortName: string;
  longName: string;
  color: string;
}

export default function LineDiagramScreen() {
  const { lineId } = useParams<{ lineId: string }>();
  const navigate = useNavigate();

  // Route metadata
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Train positions
  const { data, status, error, updatedAt, refresh } = usePositions(lineId ?? null);

  // Selected train for details modal
  const [selectedTrain, setSelectedTrain] = useState<InterpolatedTrainPosition | null>(null);

  // Load route metadata
  useEffect(() => {
    if (!lineId) return;
    setRouteError(null);
    api
      .getRoutes()
      .then((routes) => {
        const route = routes.find((r) => r.id.toUpperCase() === lineId.toUpperCase());
        if (route) {
          setRouteInfo({
            id: route.id,
            shortName: route.shortName,
            longName: route.longName,
            color: route.color,
          });
        } else {
          setRouteError(`Line "${lineId}" not found`);
        }
      })
      .catch((err) => {
        setRouteError(err instanceof Error ? err.message : "Failed to load line info");
      });
  }, [lineId]);

  // Focus management for screen readers
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [lineId]);

  // Handle train tap
  const handleTrainTap = useCallback((train: InterpolatedTrainPosition) => {
    setSelectedTrain(train);
  }, []);

  // Handle track trip from details modal
  const handleTrackTrip = useCallback(
    (tripId: string) => {
      void navigate(`/trip/${encodeURIComponent(tripId)}`);
    },
    [navigate]
  );

  // Determine the line name for display
  const lineName = routeInfo?.longName ?? `${lineId ?? ""} Line`;

  // Derive error message
  const errorMessage = routeError ?? (status === "error" || status === "offline" ? error : null);

  return (
    <div className="flex flex-col h-full bg-background dark:bg-dark-background">
      {/* Skip link for keyboard users */}
      <a
        href="#line-diagram-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-mta-primary focus:text-white focus:rounded-lg focus:font-medium focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Header */}
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
            {routeInfo && <LineBullet line={routeInfo.id} size="md" />}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-lg font-bold text-text-primary dark:text-dark-text-primary truncate outline-none"
            >
              {lineName}
            </h1>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="text-13 text-mta-primary min-h-touch px-2 flex items-center gap-1"
            aria-label="Refresh train positions"
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
      </header>

      <OfflineBanner />

      <main id="line-diagram-main" className="flex-1 overflow-y-auto pb-14 p-4" role="main">
        {/* Route error */}
        {routeError && <p className="text-severe font-medium mb-4">{routeError}</p>}

        {/* Diagram section */}
        <section aria-labelledby="diagram-heading" className="mb-6">
          <h2 id="diagram-heading" className="sr-only">
            Live Train Positions
          </h2>

          <DataState
            status={status}
            data={data}
            error={errorMessage}
            skeleton={<DiagramSkeleton />}
            empty={
              <EmptyState
                title="No trains tracking"
                message="There are no trains currently tracking on this line. This may be due to a service disruption or the line may not have real-time tracking."
                actionLabel="Refresh"
                onAction={refresh}
              />
            }
            staleTimestamp={updatedAt}
            onRetry={refresh}
          >
            {(diagramData) => (
              <div className="bg-surface dark:bg-dark-surface rounded-xl p-4">
                <TrainDiagram data={diagramData} onTrainTap={handleTrainTap} className="w-full" />

                {/* Legend */}
                <div className="mt-4 pt-4 border-t border-border dark:border-dark-border">
                  <div className="flex flex-wrap gap-4 text-12 text-text-secondary dark:text-dark-text-secondary">
                    <div className="flex items-center gap-1">
                      <span className="text-9">N</span>
                      <span>Northbound</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-9">S</span>
                      <span>Southbound</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <svg width="8" height="8" viewBox="0 0 10 10" className="opacity-50">
                        <circle cx="5" cy="5" r="4" fill="currentColor" />
                      </svg>
                      <span>Unassigned</span>
                    </div>
                  </div>
                </div>

                {/* Train count */}
                <p className="mt-2 text-center text-12 text-text-tertiary dark:text-dark-text-tertiary">
                  {diagramData.trains.length} train{diagramData.trains.length !== 1 ? "s" : ""}{" "}
                  tracking
                </p>
              </div>
            )}
          </DataState>
        </section>

        {/* Info section */}
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-text-secondary dark:text-dark-text-secondary mb-2">
            About this diagram
          </h2>
          <p className="text-13 text-text-tertiary dark:text-dark-text-tertiary leading-relaxed">
            This schematic shows live train positions along the{" "}
            {routeInfo?.shortName ?? lineId ?? "selected"} line. Dots are positioned between
            stations based on real-time tracking data. Tap any train dot to see details including
            destination and delay status.
          </p>
        </section>
      </main>

      <BottomNav />

      {/* Train details modal */}
      {selectedTrain && (
        <TrainDotDetails
          train={selectedTrain}
          routeId={lineId ?? ""}
          onClose={() => setSelectedTrain(null)}
          onTrackTrip={handleTrackTrip}
        />
      )}
    </div>
  );
}

/** Skeleton placeholder for the diagram while loading */
function DiagramSkeleton() {
  return (
    <div className="bg-surface dark:bg-dark-surface rounded-xl p-4 animate-pulse">
      {/* Line skeleton */}
      <div className="h-2 bg-border dark:bg-dark-border rounded-full w-full mb-4" />

      {/* Station dots skeleton */}
      <div className="flex justify-between items-center px-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="w-3 h-3 rounded-full bg-border dark:bg-dark-border" />
        ))}
      </div>

      {/* Train dots skeleton */}
      <div className="flex justify-around mt-8 px-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-4 h-4 rounded-full bg-border dark:bg-dark-border" />
        ))}
      </div>

      {/* Legend skeleton */}
      <div className="mt-4 pt-4 border-t border-border dark:border-dark-border">
        <div className="h-3 bg-border dark:bg-dark-border rounded w-48" />
      </div>
    </div>
  );
}
