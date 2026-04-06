/**
 * StatsScreen — "Your Subway Year" shareable annual summary.
 *
 * Computes stats from journalStore + fareStore entirely client-side.
 * Configurable time window (this month, quarter, year, all time).
 * Renders a styled SubwayYear card shareable as PNG via html2canvas.
 */

import type { TripRecord } from "@mta-my-way/shared";
import {
  calculateCarbonSavingsSummary,
  formatCarbonSavings,
  formatDistance,
  getEnvironmentalEquivalents,
  haversineDistance,
} from "@mta-my-way/shared";
import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataState } from "../components/common/DataState";
import { useStationIndex } from "../hooks/useStationIndex";
import { useJournalStore } from "../stores";

// ---------------------------------------------------------------------------
// Time Window
// ---------------------------------------------------------------------------

type TimeWindow = "month" | "quarter" | "year" | "all";

interface WindowOption {
  key: TimeWindow;
  label: string;
  getStart: () => Date | null; // null = no lower bound (all time)
}

function getWindowStart(key: TimeWindow): Date | null {
  const now = new Date();
  switch (key) {
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), q * 3, 1);
    }
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
      return null;
  }
}

const WINDOW_OPTIONS: WindowOption[] = [
  { key: "month", label: "This Month", getStart: () => getWindowStart("month") },
  { key: "quarter", label: "This Quarter", getStart: () => getWindowStart("quarter") },
  { key: "year", label: "This Year", getStart: () => getWindowStart("year") },
  { key: "all", label: "All Time", getStart: () => null },
];

function getWindowLabel(key: TimeWindow): string {
  return WINDOW_OPTIONS.find((o) => o.key === key)?.label ?? "";
}

// ---------------------------------------------------------------------------
// Computed Stats
// ---------------------------------------------------------------------------

interface AggregatedStats {
  totalTrips: number;
  totalMinutesUnderground: number;
  totalDistanceKm: number;
  mostUsedStation: string;
  mostUsedStationCount: number;
  mostUsedLine: string;
  mostUsedLineCount: number;
  uniqueStations: number;
  anomalyCount: number; // trips flagged as delays
  currentStreak: number; // consecutive days with trips (ending today)
  longestStreak: number;
  datesWithTrips: Set<string>;
}

function computeAggregatedStats(
  allRecords: TripRecord[],
  stationCoords: Map<string, { lat: number; lon: number }>,
  windowStart: Date | null
): AggregatedStats {
  const filtered = windowStart
    ? allRecords.filter((r) => new Date(r.date).getTime() >= windowStart.getTime())
    : allRecords;

  if (filtered.length === 0) {
    return {
      totalTrips: 0,
      totalMinutesUnderground: 0,
      totalDistanceKm: 0,
      mostUsedStation: "—",
      mostUsedStationCount: 0,
      mostUsedLine: "—",
      mostUsedLineCount: 0,
      uniqueStations: 0,
      anomalyCount: 0,
      currentStreak: 0,
      longestStreak: 0,
      datesWithTrips: new Set(),
    };
  }

  let totalMinutes = 0;
  let totalDistanceKm = 0;
  const stationCounts: Record<string, number> = {};
  const lineCounts: Record<string, number> = {};
  const stationSet = new Set<string>();
  const datesWithTrips = new Set<string>();

  for (const r of filtered) {
    totalMinutes += r.actualDurationMinutes;
    stationSet.add(r.origin.stationId);
    stationSet.add(r.destination.stationId);
    datesWithTrips.add(r.date);

    stationCounts[r.origin.stationId] = (stationCounts[r.origin.stationId] ?? 0) + 1;
    stationCounts[r.destination.stationId] = (stationCounts[r.destination.stationId] ?? 0) + 1;
    lineCounts[r.line] = (lineCounts[r.line] ?? 0) + 1;

    // Compute straight-line distance between origin and destination
    const originCoords = stationCoords.get(r.origin.stationId);
    const destCoords = stationCoords.get(r.destination.stationId);
    if (originCoords && destCoords) {
      totalDistanceKm += haversineDistance(
        originCoords.lat,
        originCoords.lon,
        destCoords.lat,
        destCoords.lon
      );
    }
  }

  // Most-used station
  let mostUsedStation = "—";
  let mostUsedStationCount = 0;
  for (const [id, count] of Object.entries(stationCounts)) {
    if (count > mostUsedStationCount) {
      mostUsedStationCount = count;
      mostUsedStation = id;
    }
  }
  // Resolve station name from first matching record
  for (const r of filtered) {
    if (r.origin.stationId === mostUsedStation) {
      mostUsedStation = r.origin.stationName;
      break;
    }
    if (r.destination.stationId === mostUsedStation) {
      mostUsedStation = r.destination.stationName;
      break;
    }
  }

  // Most-used line
  let mostUsedLine = "—";
  let mostUsedLineCount = 0;
  for (const [line, count] of Object.entries(lineCounts)) {
    if (count > mostUsedLineCount) {
      mostUsedLineCount = count;
      mostUsedLine = line;
    }
  }

  // Streaks
  const sortedDates = [...datesWithTrips].sort();
  let longestStreak = 1;
  let currentStreak = 0;

  // Calculate longest streak from sorted dates
  if (sortedDates.length > 0) {
    let streak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]!);
      const curr = new Date(sortedDates[i]!);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        streak++;
      } else {
        longestStreak = Math.max(longestStreak, streak);
        streak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, streak);

    // Current streak: count consecutive days ending at today (or yesterday)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(today);
    // If no trip today, start checking from yesterday
    if (!datesWithTrips.has(checkDate.toISOString().split("T")[0]!)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (datesWithTrips.has(checkDate.toISOString().split("T")[0]!)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  // Anomaly count: trips where duration is significantly above average for the line
  const lineDurations: Record<string, number[]> = {};
  const lineMeans: Record<string, number> = {};
  for (const r of filtered) {
    if (!lineDurations[r.line]) lineDurations[r.line] = [];
    lineDurations[r.line]!.push(r.actualDurationMinutes);
  }
  for (const [line, durations] of Object.entries(lineDurations)) {
    lineMeans[line] = durations.reduce((a, b) => a + b, 0) / durations.length;
  }
  const lineStDevs: Record<string, number> = {};
  for (const [line, durations] of Object.entries(lineDurations)) {
    const mean = lineMeans[line]!;
    lineStDevs[line] = Math.sqrt(
      durations.reduce((sum, d) => sum + (d - mean) ** 2, 0) / durations.length
    );
  }

  let anomalyCount = 0;
  for (const r of filtered) {
    const mean = lineMeans[r.line];
    const stdDev = lineStDevs[r.line];
    if (mean !== undefined && stdDev !== undefined && stdDev > 0) {
      if (r.actualDurationMinutes > mean + 1.5 * stdDev) {
        anomalyCount++;
      }
    }
  }

  return {
    totalTrips: filtered.length,
    totalMinutesUnderground: Math.round(totalMinutes),
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    mostUsedStation,
    mostUsedStationCount,
    mostUsedLine,
    mostUsedLineCount,
    uniqueStations: stationSet.size,
    anomalyCount,
    currentStreak,
    longestStreak,
    datesWithTrips,
  };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// SubwayYear Card (the shareable component)
// ---------------------------------------------------------------------------

interface SubwayYearCardProps {
  stats: AggregatedStats;
  windowLabel: string;
  year: number;
}

function SubwayYearCard({ stats, windowLabel, year }: SubwayYearCardProps) {
  const carbon = calculateCarbonSavingsSummary(stats.totalDistanceKm);
  const equivalents = getEnvironmentalEquivalents(carbon.savingsKg);

  return (
    <div
      ref={undefined}
      className="bg-gradient-to-br from-[#0039A6] via-[#002d82] to-[#001f5c] text-white rounded-2xl p-6 shadow-xl"
    >
      {/* Header */}
      <div className="text-center mb-5">
        <p className="text-xs uppercase tracking-widest text-blue-200 mb-1">Your Subway Year</p>
        <h2 className="text-2xl font-bold">{windowLabel}</h2>
        <p className="text-blue-200 text-sm">{year}</p>
      </div>

      {/* Big number row */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-white/10 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold tabular-nums">{formatNumber(stats.totalTrips)}</p>
          <p className="text-xs text-blue-200 mt-1">Trips Taken</p>
        </div>
        <div className="bg-white/10 rounded-xl p-3 text-center">
          <p className="text-3xl font-bold tabular-nums">
            {formatHours(stats.totalMinutesUnderground)}
          </p>
          <p className="text-xs text-blue-200 mt-1">Underground</p>
        </div>
      </div>

      {/* Detail grid */}
      <div className="space-y-3 mb-5">
        <div className="flex justify-between items-center">
          <span className="text-blue-200 text-sm">Distance</span>
          <span className="font-semibold tabular-nums">
            {formatDistance(stats.totalDistanceKm)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-blue-200 text-sm">Top Station</span>
          <span className="font-semibold text-right max-w-[60%] truncate">
            {stats.mostUsedStation}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-blue-200 text-sm">Top Line</span>
          <span className="font-semibold">{stats.mostUsedLine}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-blue-200 text-sm">Stations Visited</span>
          <span className="font-semibold tabular-nums">{stats.uniqueStations}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-blue-200 text-sm">Delay Days</span>
          <span className="font-semibold tabular-nums">{stats.anomalyCount}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-blue-200 text-sm">Longest Streak</span>
          <span className="font-semibold tabular-nums">
            {stats.longestStreak} day{stats.longestStreak !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Carbon section */}
      <div className="border-t border-white/20 pt-4">
        <p className="text-xs uppercase tracking-widest text-green-300 mb-2">Carbon Savings</p>
        <p className="text-xl font-bold text-green-300 mb-2">
          {formatCarbonSavings(carbon.savingsKg)}
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-sm font-semibold tabular-nums">{equivalents.trees}</p>
            <p className="text-10 text-blue-200">worth of trees</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums">{equivalents.flights}</p>
            <p className="text-10 text-blue-200">NYC↔LA</p>
          </div>
          <div>
            <p className="text-sm font-semibold tabular-nums">{carbon.carFreeDays} days</p>
            <p className="text-10 text-blue-200">car-free</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-5 pt-3 border-t border-white/20 text-center">
        <p className="text-xs text-blue-300">MTA My Way</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Detail Section (scrollable, below the card)
// ---------------------------------------------------------------------------

interface StatsDetailProps {
  stats: AggregatedStats;
  windowLabel: string;
}

function StatsDetail({ stats, windowLabel }: StatsDetailProps) {
  const carbon = calculateCarbonSavingsSummary(stats.totalDistanceKm);

  const sections = [
    {
      title: "Overview",
      items: [
        { label: "Total Trips", value: formatNumber(stats.totalTrips) },
        { label: "Time Underground", value: formatHours(stats.totalMinutesUnderground) },
        { label: "Distance Traveled", value: formatDistance(stats.totalDistanceKm) },
        { label: "Unique Stations", value: formatNumber(stats.uniqueStations) },
      ],
    },
    {
      title: "Favorites",
      items: [
        {
          label: "Most-Used Station",
          value: stats.mostUsedStation,
          sub: `${stats.mostUsedStationCount} visits`,
        },
        {
          label: "Most-Used Line",
          value: stats.mostUsedLine,
          sub: `${stats.mostUsedLineCount} trips`,
        },
      ],
    },
    {
      title: "Reliability",
      items: [
        { label: "Delay Days", value: `${stats.anomalyCount}`, sub: "trips 1.5x above normal" },
        {
          label: "Current Streak",
          value: `${stats.currentStreak} day${stats.currentStreak !== 1 ? "s" : ""}`,
        },
        {
          label: "Longest Streak",
          value: `${stats.longestStreak} day${stats.longestStreak !== 1 ? "s" : ""}`,
        },
      ],
    },
    {
      title: "Environmental Impact",
      items: [
        { label: "CO\u2082 Saved", value: formatCarbonSavings(carbon.savingsKg) },
        { label: "Distance in Miles", value: formatNumber(Math.round(carbon.totalDistanceMiles)) },
        { label: "Car-Free Equivalent", value: `${carbon.carFreeDays} days` },
        {
          label: "Trees Equivalent",
          value: `${carbon.equivalentTrees} tree${carbon.equivalentTrees !== 1 ? "s" : ""}`,
        },
      ],
    },
  ];

  return (
    <div className="space-y-4 mt-4">
      <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
        {windowLabel} Details
      </h2>
      {sections.map((section) => (
        <div key={section.title} className="bg-surface dark:bg-dark-surface rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-primary dark:text-dark-text-primary mb-3">
            {section.title}
          </h3>
          <div className="space-y-2">
            {section.items.map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
                  {item.label}
                </span>
                <div className="text-right">
                  <p className="text-sm font-semibold text-text-primary dark:text-dark-text-primary tabular-nums">
                    {item.value}
                  </p>
                  {item.sub && (
                    <p className="text-11 text-text-secondary dark:text-dark-text-secondary">
                      {item.sub}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function StatsScreen() {
  const navigate = useNavigate();
  const journalStats = useJournalStore((s) => s.stats);
  const { stations, loading: stationsLoading } = useStationIndex();
  const [window, setWindow] = useState<TimeWindow>("year");
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Build station coordinate lookup
  const stationCoords = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number }>();
    for (const s of stations) {
      map.set(s.id, { lat: s.lat, lon: s.lon });
    }
    return map;
  }, [stations]);

  // Flatten all trip records across all commutes
  const allRecords = useMemo(() => {
    const records: TripRecord[] = [];
    for (const commuteStats of Object.values(journalStats)) {
      records.push(...commuteStats.records);
    }
    return records;
  }, [journalStats]);

  // Compute stats for the selected window
  const windowStart = useMemo(() => getWindowStart(window), [window]);
  const stats = useMemo(
    () => computeAggregatedStats(allRecords, stationCoords, windowStart),
    [allRecords, stationCoords, windowStart]
  );

  const hasData = allRecords.length > 0;
  const windowLabel = getWindowLabel(window);

  // Share handler
  const handleShare = useCallback(async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);

    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;

      // Try native share first (mobile)
      if (
        navigator.share &&
        navigator.canShare?.({
          files: [new File([blob], "subway-year.png", { type: "image/png" })],
        })
      ) {
        const file = new File([blob], "subway-year.png", { type: "image/png" });
        await navigator.share({
          title: "My Subway Year",
          text: `I took ${stats.totalTrips} subway trips and saved ${formatCarbonSavings(calculateCarbonSavingsSummary(stats.totalDistanceKm).savingsKg)}!`,
          files: [file],
        });
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "subway-year.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      // User cancelled share — ignore
      if (err instanceof Error && err.name !== "AbortError") {
        console.error("Share failed:", err);
      }
    } finally {
      setSharing(false);
    }
  }, [sharing, stats]);

  return (
    <div className="flex flex-col h-full bg-background dark:bg-dark-background">
      {/* Header */}
      <header className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => void navigate("/journal")}
            className="flex items-center gap-1 text-mta-primary text-13 font-medium min-h-touch px-1"
            aria-label="Back to journal"
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
        </div>
        <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary">
          Your Subway Year
        </h1>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
          A personalized summary of your subway commute
        </p>
      </header>

      <main className="flex-1 overflow-y-auto px-4 pb-14">
        <DataState
          status={stationsLoading ? "loading" : "success"}
          data={hasData ? allRecords : null}
          error={null}
          skeleton={
            <div className="space-y-3 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-24 rounded-xl" />
              ))}
            </div>
          }
        >
          {() =>
            hasData ? (
              <>
                {/* Time window selector */}
                <div className="flex gap-2 mt-4 mb-4 overflow-x-auto no-scrollbar">
                  {WINDOW_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setWindow(opt.key)}
                      className={`shrink-0 px-4 py-2 rounded-full text-13 font-medium transition-colors min-h-touch ${
                        window === opt.key
                          ? "bg-mta-primary text-white"
                          : "bg-surface dark:bg-dark-surface text-text-secondary dark:text-dark-text-secondary hover:bg-surface/80"
                      }`}
                      aria-pressed={window === opt.key}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* SubwayYear Card */}
                <div ref={cardRef} className="mb-4">
                  <SubwayYearCard
                    stats={stats}
                    windowLabel={windowLabel}
                    year={new Date().getFullYear()}
                  />
                </div>

                {/* Share button */}
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  disabled={sharing}
                  className="w-full bg-mta-primary hover:bg-mta-primary/90 text-white font-semibold py-3 rounded-xl min-h-touch flex items-center justify-center gap-2 transition-colors disabled:opacity-50 mb-4"
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
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  {sharing ? "Sharing..." : "Share My Subway Year"}
                </button>

                {/* Detailed stats */}
                <StatsDetail stats={stats} windowLabel={windowLabel} />
              </>
            ) : (
              <div className="mt-8 bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
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
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                </svg>
                <p className="text-text-secondary dark:text-dark-text-secondary mb-2">
                  No trips recorded yet
                </p>
                <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
                  Start tracking commutes to see your personalized subway summary here
                </p>
                <button
                  type="button"
                  onClick={() => void navigate("/commute")}
                  className="mt-4 text-mta-primary font-medium text-13 min-h-touch px-4"
                >
                  Set up a commute
                </button>
              </div>
            )
          }
        </DataState>
      </main>
    </div>
  );
}
