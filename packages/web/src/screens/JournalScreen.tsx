/**
 * JournalScreen - Commute journal with trip history and statistics.
 *
 * Shows:
 * - Stats summary per commute (avg, median, trend, delay stats)
 * - Duration sparkline chart
 * - Trip history list with delays and notes
 */

import type { CommuteStats, TripRecord } from "@mta-my-way/shared";
import { Suspense, lazy, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineBullet } from "../components/arrivals/LineBullet";
import { DataState, Skeleton } from "../components/common";
import Screen from "../components/layout/Screen";
import { sanitizeUserInput } from "../lib/outputEncoding";
import { useFavoritesStore, useJournalStore } from "../stores";

// Lazy load modal component - only loaded when needed
const TripRecordEditor = lazy(() =>
  import("../components/journal/TripRecordEditor").then((m) => ({ default: m.TripRecordEditor }))
);

// -----------------------------------------------------------------------------
// Sparkline Component
// -----------------------------------------------------------------------------

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

function Sparkline({
  values,
  width = 120,
  height = 32,
  color = "var(--mta-primary)",
}: SparklineProps) {
  if (values.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-text-secondary dark:text-dark-text-secondary text-11"
        style={{ width, height }}
      >
        {values.length === 1 ? `${values[0]}m` : "—"}
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Average line */}
      <line
        x1="0"
        y1={height - ((avg - min) / range) * (height - 4) - 2}
        x2={width}
        y2={height - ((avg - min) / range) * (height - 4) - 2}
        stroke={color}
        strokeOpacity="0.2"
        strokeDasharray="2,2"
      />
    </svg>
  );
}

// -----------------------------------------------------------------------------
// Commute Stats Card
// -----------------------------------------------------------------------------

interface CommuteStatsCardProps {
  commuteId: string;
  commuteName: string;
  stats: CommuteStats;
  onViewTrips: () => void;
  isExpanded: boolean;
}

function CommuteStatsCard({ commuteName, stats, onViewTrips, isExpanded }: CommuteStatsCardProps) {
  const recentDurations = useMemo(() => {
    return stats.records.slice(-20).map((r) => r.actualDurationMinutes);
  }, [stats.records]);

  const trendLabel =
    stats.trend > 0 ? `+${stats.trend}%` : stats.trend < 0 ? `${stats.trend}%` : "0%";
  const trendColor =
    stats.trend > 5
      ? "text-severe"
      : stats.trend > 0
        ? "text-warning"
        : stats.trend < -5
          ? "text-mta-primary"
          : "text-text-secondary dark:text-dark-text-secondary";

  return (
    <div className="bg-surface dark:bg-dark-surface rounded-lg p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-text-primary dark:text-dark-text-primary">
            {commuteName}
          </h3>
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {stats.records[0]?.origin.stationName ?? "—"} →{" "}
            {stats.records[0]?.destination.stationName ?? "—"}
          </p>
        </div>
        <span className={`text-13 font-medium ${trendColor}`}>{trendLabel}</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <p className="text-11 text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
            Avg
          </p>
          <p className="text-base font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
            {Math.round(stats.averageDurationMinutes)}
            <span className="text-11 font-normal ml-0.5">min</span>
          </p>
        </div>
        <div>
          <p className="text-11 text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
            Median
          </p>
          <p className="text-base font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
            {Math.round(stats.medianDurationMinutes)}
            <span className="text-11 font-normal ml-0.5">min</span>
          </p>
        </div>
        <div>
          <p className="text-11 text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
            Avg Delay
          </p>
          <p
            className={`text-base font-bold tabular-nums ${
              stats.averageDelayMinutes > 5
                ? "text-severe"
                : stats.averageDelayMinutes > 2
                  ? "text-warning"
                  : stats.averageDelayMinutes < -2
                    ? "text-mta-primary"
                    : "text-text-primary dark:text-dark-text-primary"
            }`}
          >
            {stats.averageDelayMinutes > 0 ? "+" : ""}
            {Math.round(stats.averageDelayMinutes)}
            <span className="text-11 font-normal ml-0.5">min</span>
          </p>
        </div>
        <div>
          <p className="text-11 text-text-secondary dark:text-dark-text-secondary uppercase tracking-wide">
            Trips
          </p>
          <p className="text-base font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
            {stats.totalTrips}
          </p>
        </div>
      </div>

      {/* Sparkline */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Sparkline values={recentDurations} width={180} height={40} />
        </div>
        <button
          type="button"
          onClick={onViewTrips}
          className="text-13 text-mta-primary font-medium min-h-touch px-3 flex items-center gap-1"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Hide trip history" : "Show trip history"}
        >
          {isExpanded ? "Hide" : "History"}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Trip History List
// -----------------------------------------------------------------------------

interface TripHistoryListProps {
  commuteId: string;
  records: TripRecord[];
  onEditTrip: (trip: TripRecord, commuteId: string) => void;
}

function TripHistoryList({ commuteId, records, onEditTrip }: TripHistoryListProps) {
  if (records.length === 0) {
    return (
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary text-center py-2">
        No trips recorded yet
      </p>
    );
  }

  // Sort by date descending
  const sorted = [...records].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-2 mt-3">
      {sorted.slice(0, 20).map((trip) => {
        const delayMinutes = trip.scheduledDurationMinutes
          ? Math.round((trip.actualDurationMinutes - trip.scheduledDurationMinutes) * 10) / 10
          : null;

        const delayColor =
          delayMinutes === null
            ? "text-text-secondary dark:text-dark-text-secondary"
            : delayMinutes > 5
              ? "text-severe"
              : delayMinutes > 2
                ? "text-warning"
                : delayMinutes < -2
                  ? "text-mta-primary"
                  : "text-text-secondary dark:text-dark-text-secondary";

        return (
          <button
            key={trip.id}
            type="button"
            onClick={() => onEditTrip(trip, commuteId)}
            className="w-full flex items-start justify-between py-2.5 px-3 bg-background dark:bg-dark-background rounded-lg text-left hover:bg-surface dark:hover:bg-dark-surface transition-colors"
          >
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <LineBullet line={trip.line} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-13 text-text-primary dark:text-dark-text-primary truncate">
                  {trip.origin.stationName} → {trip.destination.stationName}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-11 text-text-secondary dark:text-dark-text-secondary">
                    {formatDate(trip.date)} •{" "}
                    {trip.source === "tracked"
                      ? "Tracked"
                      : trip.source === "inferred"
                        ? "Inferred"
                        : "Manual"}
                  </p>
                  {delayMinutes !== null && (
                    <>
                      <span className="text-text-secondary dark:text-dark-text-secondary">•</span>
                      <span className={`text-11 font-medium ${delayColor}`}>
                        {delayMinutes > 0 ? "+" : ""}
                        {delayMinutes} min
                      </span>
                    </>
                  )}
                </div>
                {trip.notes && (
                  <p className="text-11 text-text-secondary dark:text-dark-text-secondary mt-1 line-clamp-2">
                    {sanitizeUserInput(trip.notes)}
                  </p>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <p className="text-13 font-semibold text-text-primary dark:text-dark-text-primary tabular-nums">
                {trip.actualDurationMinutes} min
              </p>
            </div>
          </button>
        );
      })}
      {sorted.length > 20 && (
        <p className="text-11 text-text-secondary dark:text-dark-text-secondary text-center py-1">
          Showing last 20 of {sorted.length} trips
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// -----------------------------------------------------------------------------
// Main Screen
// -----------------------------------------------------------------------------

interface EditorState {
  isOpen: boolean;
  trip: TripRecord | null;
  commuteId: string;
}

export default function JournalScreen() {
  const navigate = useNavigate();
  const stats = useJournalStore((s) => s.stats);
  const commutes = useFavoritesStore((s) => s.commutes);
  const updateTripRecord = useJournalStore((s) => s.updateTripRecord);
  const removeTripRecord = useJournalStore((s) => s.removeTripRecord);
  const [expandedCommute, setExpandedCommute] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>({
    isOpen: false,
    trip: null,
    commuteId: "",
  });

  const commuteIds = Object.keys(stats);
  const hasData = commuteIds.length > 0;

  // Calculate overall stats
  const overallStats = useMemo(() => {
    let totalTrips = 0;
    let totalDuration = 0;
    let tripsThisWeek = 0;
    let totalDelay = 0;
    let delayCount = 0;

    for (const id of commuteIds) {
      const s = stats[id]!;
      totalTrips += s.totalTrips;
      totalDuration += s.averageDurationMinutes * s.totalTrips;
      tripsThisWeek += s.tripsThisWeek;
      if (s.averageDelayMinutes !== 0) {
        totalDelay += s.averageDelayMinutes * s.totalTrips;
        delayCount += s.totalTrips;
      }
    }

    return {
      totalTrips,
      averageDuration: totalTrips > 0 ? Math.round(totalDuration / totalTrips) : 0,
      tripsThisWeek,
      averageDelay: delayCount > 0 ? Math.round(totalDelay / delayCount) : 0,
    };
  }, [stats, commuteIds]);

  const handleEditTrip = (trip: TripRecord, commuteId: string) => {
    setEditor({ isOpen: true, trip, commuteId });
  };

  const handleCloseEditor = () => {
    setEditor({ isOpen: false, trip: null, commuteId: "" });
  };

  const handleSaveTrip = (commuteId: string, recordId: string, updates: Partial<TripRecord>) => {
    updateTripRecord(commuteId, recordId, updates);
    handleCloseEditor();
  };

  const handleDeleteTrip = (commuteId: string, recordId: string) => {
    removeTripRecord(commuteId, recordId);
    handleCloseEditor();
  };

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        {/* Back button */}
        <button
          type="button"
          onClick={() => void navigate("/commute")}
          className="flex items-center gap-1 text-mta-primary text-13 font-medium min-h-touch px-1 mb-3"
          aria-label="Back to commutes"
        >
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
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </button>

        <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-1">
          Trip Journal
        </h1>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-4">
          Your commute history and patterns
        </p>

        {/* Link to Subway Year stats */}
        {hasData && (
          <button
            type="button"
            onClick={() => void navigate("/stats")}
            className="w-full bg-gradient-to-r from-[#0039A6] to-[#002d82] text-white rounded-xl p-4 mb-4 flex items-center justify-between group"
          >
            <div className="text-left">
              <p className="font-semibold text-sm">Your Subway Year</p>
              <p className="text-xs text-blue-200">Personalized annual summary</p>
            </div>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-200 group-hover:translate-x-1 transition-transform"
              aria-hidden="true"
            >
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </button>
        )}

        {/* Overall summary */}
        {hasData && (
          <div className="bg-mta-primary/10 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-xl font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
                  {overallStats.totalTrips}
                </p>
                <p className="text-11 text-text-secondary dark:text-dark-text-secondary">
                  Total Trips
                </p>
              </div>
              <div>
                <p className="text-xl font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
                  {overallStats.averageDuration}
                  <span className="text-13 font-normal">m</span>
                </p>
                <p className="text-11 text-text-secondary dark:text-dark-text-secondary">
                  Avg Duration
                </p>
              </div>
              <div>
                <p
                  className={`text-xl font-bold tabular-nums ${
                    overallStats.averageDelay > 5
                      ? "text-severe"
                      : overallStats.averageDelay > 2
                        ? "text-warning"
                        : overallStats.averageDelay < -2
                          ? "text-mta-primary"
                          : "text-text-primary dark:text-dark-text-primary"
                  }`}
                >
                  {overallStats.averageDelay > 0 ? "+" : ""}
                  {overallStats.averageDelay}
                  <span className="text-13 font-normal">m</span>
                </p>
                <p className="text-11 text-text-secondary dark:text-dark-text-secondary">
                  Avg Delay
                </p>
              </div>
              <div>
                <p className="text-xl font-bold text-text-primary dark:text-dark-text-primary tabular-nums">
                  {overallStats.tripsThisWeek}
                </p>
                <p className="text-11 text-text-secondary dark:text-dark-text-secondary">
                  This Week
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Commute stats */}
        <section aria-labelledby="commute-stats-heading">
          <h2
            id="commute-stats-heading"
            className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-3"
          >
            Commute Stats
          </h2>

          <DataState status={hasData ? "success" : "success"} data={commuteIds} error={null}>
            {() =>
              hasData ? (
                <div className="space-y-3">
                  {commuteIds.map((commuteId) => {
                    const commute = commutes.find((c) => c.id === commuteId);
                    const commuteStats = stats[commuteId]!;
                    const isExpanded = expandedCommute === commuteId;

                    return (
                      <div key={commuteId}>
                        <CommuteStatsCard
                          commuteId={commuteId}
                          commuteName={commute?.name ?? "Unknown Commute"}
                          stats={commuteStats}
                          onViewTrips={() => setExpandedCommute(isExpanded ? null : commuteId)}
                          isExpanded={isExpanded}
                        />
                        {isExpanded && (
                          <TripHistoryList
                            commuteId={commuteId}
                            records={commuteStats.records}
                            onEditTrip={handleEditTrip}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mx-auto mb-3 text-text-secondary dark:text-dark-text-secondary"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10,9 9,9 8,9" />
                  </svg>
                  <p className="text-text-secondary dark:text-dark-text-secondary mb-2">
                    No trips recorded yet
                  </p>
                  <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
                    Track a commute or let the app infer trips from your station visits
                  </p>
                </div>
              )
            }
          </DataState>
        </section>
      </div>

      {/* Trip record editor */}
      <Suspense fallback={<Skeleton className="w-full h-64" />}>
        {editor.isOpen && editor.trip && (
          <TripRecordEditor
            trip={editor.trip}
            commuteId={editor.commuteId}
            onSave={handleSaveTrip}
            onDelete={handleDeleteTrip}
            onClose={handleCloseEditor}
          />
        )}
      </Suspense>
    </Screen>
  );
}
