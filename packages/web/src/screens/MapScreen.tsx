/**
 * MapScreen - Interactive transit map showing all subway lines, stations, and real-time train positions.
 *
 * Features:
 * - Pan and zoom to explore the NYC subway system
 * - Tap stations to view details
 * - Real-time train positions with pulsing indicators
 * - Line filtering
 * - Auto-refresh of train positions
 */

import type { InterpolatedTrainPosition, LineDiagramData, Station } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DataState } from "../components/common";
import EmptyState from "../components/common/EmptyState";
import OfflineBanner from "../components/common/OfflineBanner";
import BottomNav from "../components/layout/BottomNav";
import { StationDetailsModal, TransitMap } from "../components/map";
import { api } from "../lib/api";

interface LineInfo {
  id: string;
  shortName: string;
  longName: string;
  color: string;
}

type MapStatus = "loading" | "success" | "error" | "offline";

export default function MapScreen() {
  const [status, setStatus] = useState<MapStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [lines, setLines] = useState<LineInfo[]>([]);
  const [lineData, setLineData] = useState<Map<string, LineDiagramData>>(new Map());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  // Selected station for details modal
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);

  // Filter state
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [showLineFilter, setShowLineFilter] = useState(false);

  // Auto-refresh state
  const fetchGenRef = useRef(0);

  // Load stations and routes
  useEffect(() => {
    Promise.all([api.getStations(), api.getRoutes()])
      .then(([stationData, routeData]) => {
        setStations(stationData);
        setLines(
          routeData.map((r) => ({
            id: r.id,
            shortName: r.shortName,
            longName: r.longName,
            color: r.color,
          }))
        );
        setStatus("success");
      })
      .catch((err) => {
        const errorMsg = err instanceof Error ? err.message : "Failed to load map data";
        setStatus(navigator.onLine ? "error" : "offline");
        setError(errorMsg);
      });
  }, []);

  // Load train positions for all lines
  const loadTrainPositions = useCallback(
    async (triggerHaptic = false) => {
      if (stations.length === 0 || lines.length === 0) return;

      if (triggerHaptic && navigator.vibrate) {
        navigator.vibrate(10);
      }

      const gen = ++fetchGenRef.current;

      try {
        const positionPromises = lines.map((line) => api.getPositions(line.id).catch(() => null));

        const results = await Promise.all(positionPromises);

        if (gen !== fetchGenRef.current) return;

        const newData = new Map<string, LineDiagramData>();
        results.forEach((data, index) => {
          if (data && lines[index]) {
            newData.set(lines[index]!.id, data);
          }
        });

        setLineData(newData);
        setUpdatedAt(Date.now());
      } catch (err) {
        // Don't error on position fetch failure - just show static map
        console.error("Failed to load train positions:", err);
      }
    },
    [stations, lines]
  );

  // Load positions when data is ready
  useEffect(() => {
    if (status === "success" && lines.length > 0) {
      void loadTrainPositions();
    }
  }, [status, lines, loadTrainPositions]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (status !== "success") return;

    const interval = setInterval(() => {
      void loadTrainPositions();
    }, 30000);

    return () => clearInterval(interval);
  }, [status, loadTrainPositions]);

  // Handle station tap
  const handleStationTap = useCallback((station: Station) => {
    setSelectedStation(station);
  }, []);

  // Handle train tap
  const handleTrainTap = useCallback((train: InterpolatedTrainPosition & { routeId: string }) => {
    // Could navigate to trip screen or show a modal
    console.log("Train tapped:", train);
  }, []);

  // Toggle line filter
  const toggleLine = useCallback((lineId: string) => {
    setSelectedLines((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(lineId)) {
        newSet.delete(lineId);
      } else {
        newSet.add(lineId);
      }
      return newSet;
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSelectedLines(new Set());
  }, []);

  // Select all lines
  const selectAllLines = useCallback(() => {
    setSelectedLines(new Set(lines.map((l) => l.id)));
  }, [lines]);

  // Filter line data based on selected lines
  const filteredLineData = useCallback(() => {
    if (selectedLines.size === 0) return lineData;
    return new Map(
      Array.from(lineData.entries()).filter(([routeId]) => selectedLines.has(routeId))
    );
  }, [lineData, selectedLines]);

  // Refresh positions
  const handleRefresh = useCallback(() => {
    void loadTrainPositions(true);
  }, [loadTrainPositions]);

  return (
    <div className="flex flex-col h-full bg-background dark:bg-dark-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background dark:bg-dark-background border-b border-surface dark:border-dark-surface px-4 py-3 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
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
            <h1 className="text-lg font-bold text-text-primary dark:text-dark-text-primary">
              Transit Map
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLineFilter(!showLineFilter)}
              className="min-h-touch px-3 flex items-center gap-1 text-mta-primary text-sm font-medium"
              aria-label={showLineFilter ? "Hide line filter" : "Show line filter"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              Filter
              {selectedLines.size > 0 && (
                <span className="w-5 h-5 bg-mta-primary text-white rounded-full text-xs flex items-center justify-center">
                  {selectedLines.size}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="min-h-touch px-2 flex items-center gap-1 text-mta-primary"
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
                className={status === "loading" ? "animate-spin" : ""}
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        </div>

        {/* Line filter panel */}
        {showLineFilter && (
          <div className="mt-3 pt-3 border-t border-border dark:border-dark-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary dark:text-dark-text-secondary">
                Filter by line
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllLines}
                  className="text-xs text-mta-primary hover:underline"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-mta-primary hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {lines.map((line) => (
                <button
                  key={line.id}
                  type="button"
                  onClick={() => toggleLine(line.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedLines.has(line.id)
                      ? "text-white"
                      : "bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary"
                  }`}
                  style={{
                    backgroundColor: selectedLines.has(line.id) ? line.color : undefined,
                  }}
                  aria-pressed={selectedLines.has(line.id)}
                >
                  {line.shortName}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <OfflineBanner />

      <main className="flex-1 overflow-hidden">
        <DataState
          status={status}
          data={stations}
          error={error}
          skeleton={<MapSkeleton />}
          empty={
            <EmptyState
              title="Unable to load map"
              message="Please check your connection and try again."
              actionLabel="Retry"
              onAction={() => window.location.reload()}
            />
          }
          staleTimestamp={updatedAt}
          onRetry={handleRefresh}
        >
          {(stationsData) => (
            <TransitMap
              stations={stationsData}
              lineData={filteredLineData()}
              onStationTap={handleStationTap}
              onTrainTap={handleTrainTap}
              className="w-full h-full"
            />
          )}
        </DataState>
      </main>

      <BottomNav />

      {/* Station details modal */}
      {selectedStation && (
        <StationDetailsModal station={selectedStation} onClose={() => setSelectedStation(null)} />
      )}
    </div>
  );
}

/** Skeleton placeholder while loading */
function MapSkeleton() {
  return (
    <div className="w-full h-full bg-surface dark:bg-dark-surface animate-pulse">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-border dark:bg-dark-border mx-auto mb-4" />
          <div className="h-4 w-32 bg-border dark:bg-dark-border rounded mx-auto" />
        </div>
      </div>
    </div>
  );
}
