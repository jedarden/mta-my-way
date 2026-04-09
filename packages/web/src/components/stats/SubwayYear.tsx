/**
 * SubwayYear - "Your Subway Year" annual summary component.
 *
 * Generates a personalized year-in-review from commute journal and fare data.
 * Statistics include:
 *   - Total trips taken
 *   - Total hours underground
 *   - Total distance traveled
 *   - Most-used station, most-used line
 *   - Most-delayed line
 *   - Longest/shortest commute
 *   - Best/worst day of week
 *   - OMNY spend and free rides
 *   - Carbon saved vs driving
 *
 * Renders as HTML, exportable to PNG via html2canvas.
 * Shareable via Web Share API.
 */

import type { TripRecord } from "@mta-my-way/shared";
import {
  calculateCO2SavingsKg,
  formatCarbonSavings,
  formatDuration,
  getLineMetadata,
  getTodayISO,
} from "@mta-my-way/shared";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFareStore } from "../../stores";
import { useJournalStore } from "../../stores/journalStore";

interface SubwayYearStats {
  totalTrips: number;
  totalMinutes: number;
  totalDistanceKm: number;
  mostUsedStation: { name: string; count: number } | null;
  mostUsedLine: { line: string; count: number } | null;
  mostDelayedLine: { line: string; avgDelayMinutes: number } | null;
  longestCommute: { minutes: number; origin: string; destination: string } | null;
  shortestCommute: { minutes: number; origin: string; destination: string } | null;
  bestDayOfWeek: { day: number; avgMinutes: number } | null;
  worstDayOfWeek: { day: number; avgMinutes: number } | null;
  onTimeStreak: number;
  carbonSavedKg: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface SubwayYearProps {
  /** Time window: "month", "quarter", "year", or "all" */
  timeWindow?: "month" | "quarter" | "year" | "all";
  /** ISO date to calculate from (defaults to today) */
  fromDate?: string;
}

export function SubwayYear({ timeWindow = "year", fromDate }: SubwayYearProps) {
  const commuteStats = useJournalStore((s) => s.stats);
  const fareTracking = useFareStore((s) => s.tracking);

  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  // Aggregate all trip records from all commutes
  const allTrips = useMemo(() => {
    const trips: Array<TripRecord & { dayOfWeek: number }> = [];
    for (const stats of Object.values(commuteStats)) {
      for (const record of stats.records) {
        const dayOfWeek = new Date(record.date).getDay();
        trips.push({ ...record, dayOfWeek });
      }
    }
    return trips;
  }, [commuteStats]);

  // Filter trips by time window
  const filteredTrips = useMemo(() => {
    const now = new Date(fromDate ?? getTodayISO());
    let startDate: Date;

    switch (timeWindow) {
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "quarter": {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      }
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case "all":
      default:
        return allTrips;
    }

    const startISO = startDate.toISOString().split("T")[0]!;
    return allTrips.filter((t) => t.date >= startISO);
  }, [allTrips, timeWindow, fromDate]);

  // Compute all statistics
  const stats = useMemo((): SubwayYearStats => {
    if (filteredTrips.length === 0) {
      return {
        totalTrips: 0,
        totalMinutes: 0,
        totalDistanceKm: 0,
        mostUsedStation: null,
        mostUsedLine: null,
        mostDelayedLine: null,
        longestCommute: null,
        shortestCommute: null,
        bestDayOfWeek: null,
        worstDayOfWeek: null,
        onTimeStreak: 0,
        carbonSavedKg: 0,
      };
    }

    // Total trips and minutes
    const totalTrips = filteredTrips.length;
    const totalMinutes = filteredTrips.reduce((sum: number, t) => sum + t.actualDurationMinutes, 0);

    // Estimate distance (rough approximation: 1 min ≈ 0.8 km subway speed)
    const totalDistanceKm = totalMinutes * 0.8;

    // Most used station (count origins and destinations)
    const stationCounts = new Map<string, number>();
    for (const trip of filteredTrips) {
      stationCounts.set(
        trip.origin.stationName,
        (stationCounts.get(trip.origin.stationName) ?? 0) + 1
      );
      stationCounts.set(
        trip.destination.stationName,
        (stationCounts.get(trip.destination.stationName) ?? 0) + 1
      );
    }
    const mostUsedStation = Array.from(stationCounts.entries()).reduce(
      (max, [name, count]) => (count > max.count ? { name, count } : max),
      { name: "", count: 0 }
    );

    // Most used line
    const lineCounts = new Map<string, number>();
    for (const trip of filteredTrips) {
      lineCounts.set(trip.line, (lineCounts.get(trip.line) ?? 0) + 1);
    }
    const mostUsedLine = Array.from(lineCounts.entries()).reduce(
      (max, [line, count]) => (count > max.count ? { line, count } : max),
      { line: "", count: 0 }
    );

    // Most delayed line (from anomaly data)
    const delaysByLine = new Map<string, { totalDelay: number; count: number }>();
    for (const trip of filteredTrips) {
      const sameLineAndDay = filteredTrips.filter(
        (t) => t.line === trip.line && t.dayOfWeek === trip.dayOfWeek
      );
      const baseline =
        sameLineAndDay.reduce((sum: number, t) => sum + t.actualDurationMinutes, 0) /
        sameLineAndDay.length;
      const delay = Math.max(0, trip.actualDurationMinutes - baseline);
      const existing = delaysByLine.get(trip.line) ?? { totalDelay: 0, count: 0 };
      delaysByLine.set(trip.line, {
        totalDelay: existing.totalDelay + delay,
        count: existing.count + 1,
      });
    }
    const mostDelayedLine = Array.from(delaysByLine.entries())
      .map(([line, data]) => ({ line, avgDelayMinutes: data.totalDelay / data.count }))
      .reduce((max, curr) => (curr.avgDelayMinutes > max.avgDelayMinutes ? curr : max), {
        line: "",
        avgDelayMinutes: 0,
      });

    // Longest and shortest commute
    const longestCommute = filteredTrips.reduce(
      (max, t) =>
        t.actualDurationMinutes > max.minutes
          ? {
              minutes: t.actualDurationMinutes,
              origin: t.origin.stationName,
              destination: t.destination.stationName,
            }
          : max,
      { minutes: 0, origin: "", destination: "" }
    );

    const shortestCommute = filteredTrips.reduce(
      (min, t) =>
        t.actualDurationMinutes < min.minutes || min.minutes === 0
          ? {
              minutes: t.actualDurationMinutes,
              origin: t.origin.stationName,
              destination: t.destination.stationName,
            }
          : min,
      { minutes: Infinity, origin: "", destination: "" }
    );

    // Best/worst day of week
    const dayStats = new Map<number, { totalMinutes: number; count: number }>();
    for (const trip of filteredTrips) {
      const existing = dayStats.get(trip.dayOfWeek) ?? { totalMinutes: 0, count: 0 };
      dayStats.set(trip.dayOfWeek, {
        totalMinutes: existing.totalMinutes + trip.actualDurationMinutes,
        count: existing.count + 1,
      });
    }
    const dayAvgs = Array.from(dayStats.entries()).map(([day, data]) => ({
      day,
      avgMinutes: data.totalMinutes / data.count,
    }));
    const bestDayOfWeek = dayAvgs.reduce(
      (min, curr) => (curr.avgMinutes < min.avgMinutes ? curr : min),
      {
        day: 0,
        avgMinutes: Infinity,
      }
    );
    const worstDayOfWeek = dayAvgs.reduce(
      (max, curr) => (curr.avgMinutes > max.avgMinutes ? curr : max),
      {
        day: 0,
        avgMinutes: 0,
      }
    );

    // On-time streak (consecutive trips within 10% of average)
    let onTimeStreak = 0;
    const overallAvg = totalMinutes / totalTrips;
    for (let i = filteredTrips.length - 1; i >= 0; i--) {
      const trip = filteredTrips[i]!;
      if (Math.abs(trip.actualDurationMinutes - overallAvg) / overallAvg <= 0.1) {
        onTimeStreak++;
      } else {
        break;
      }
    }

    // Carbon saved (374g CO2 per passenger-mile vs car)
    // Distance in miles = km * 0.621371
    const totalMiles = totalDistanceKm * 0.621371;
    const carbonSavedKg = calculateCO2SavingsKg(totalMiles);

    return {
      totalTrips,
      totalMinutes,
      totalDistanceKm,
      mostUsedStation: mostUsedStation.count > 0 ? mostUsedStation : null,
      mostUsedLine: mostUsedLine.count > 0 ? mostUsedLine : null,
      mostDelayedLine: mostDelayedLine.avgDelayMinutes > 0 ? mostDelayedLine : null,
      longestCommute: longestCommute.minutes > 0 ? longestCommute : null,
      shortestCommute: shortestCommute.minutes < Infinity ? shortestCommute : null,
      bestDayOfWeek: bestDayOfWeek.avgMinutes < Infinity ? bestDayOfWeek : null,
      worstDayOfWeek: worstDayOfWeek.avgMinutes > 0 ? worstDayOfWeek : null,
      onTimeStreak,
      carbonSavedKg,
    };
  }, [filteredTrips]);

  // Handle share
  const handleShare = useCallback(async () => {
    const element = cardRef.current;
    if (!element) return;

    setSharing(true);

    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(element, {
        backgroundColor: "#ffffff",
        scale: 2, // Retina quality
        logging: false,
      });

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        setSharing(false);
        return;
      }

      const file = new File([blob], "my-subway-year.png", { type: "image/png" });

      // Try native share first (mobile)
      if (
        navigator.share &&
        navigator.canShare?.({
          files: [file],
        })
      ) {
        await navigator.share({
          title: "My Subway Year",
          text: `I took ${stats.totalTrips} trips and saved ${formatCarbonSavings(stats.carbonSavedKg)} of CO2!`,
          files: [file],
        });
      } else {
        // Fallback: download the image
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-subway-year.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // User cancelled or error occurred
    } finally {
      setSharing(false);
    }
  }, [stats.totalTrips, stats.carbonSavedKg]);

  // Get window label
  const getWindowLabel = () => {
    switch (timeWindow) {
      case "month":
        return "This Month";
      case "quarter":
        return "This Quarter";
      case "year":
        return "This Year";
      case "all":
        return "All Time";
    }
  };

  if (stats.totalTrips === 0) {
    return (
      <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
        <p className="text-text-secondary dark:text-dark-text-secondary">
          No trips recorded yet. Start tracking your commutes to see your stats!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Share button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-mta-primary text-white font-medium disabled:opacity-50 min-h-touch"
        >
          {sharing ? (
            <>
              <svg
                className="animate-spin"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </>
          )}
        </button>
      </div>

      {/* Card to capture */}
      <div
        ref={cardRef}
        className="bg-white dark:bg-gray-900 rounded-xl p-6 shadow-lg max-w-md mx-auto"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Subway Year</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{getWindowLabel()}</p>
        </div>

        {/* Hero stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-mta-primary to-blue-700 rounded-lg p-4 text-white text-center">
            <p className="text-3xl font-bold">{stats.totalTrips}</p>
            <p className="text-sm opacity-90">Trips</p>
          </div>
          <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-4 text-white text-center">
            <p className="text-3xl font-bold">{formatDuration(stats.totalMinutes)}</p>
            <p className="text-sm opacity-90">Underground</p>
          </div>
        </div>

        {/* Distance and carbon */}
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Distance</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                {stats.totalDistanceKm < 10
                  ? `${stats.totalDistanceKm.toFixed(1)} km`
                  : `${(stats.totalDistanceKm / 1.6).toFixed(0)} mi`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 dark:text-gray-400">CO₂ Saved</p>
              <p className="text-xl font-semibold text-green-600 dark:text-green-400">
                {formatCarbonSavings(stats.carbonSavedKg)}
              </p>
            </div>
          </div>
        </div>

        {/* Most used */}
        <div className="space-y-3 mb-6">
          {stats.mostUsedStation && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Most Used Station</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {stats.mostUsedStation.name}
              </span>
            </div>
          )}
          {stats.mostUsedLine && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Most Used Line</span>
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    backgroundColor: getLineMetadata(stats.mostUsedLine.line)?.color ?? "#808183",
                  }}
                >
                  {stats.mostUsedLine.line}
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {stats.mostUsedLine.count} trips
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Best/Worst day */}
        {stats.bestDayOfWeek && stats.worstDayOfWeek && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <p className="text-xs text-green-700 dark:text-green-400 mb-1">Fastest Day</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {DAY_NAMES[stats.bestDayOfWeek.day]}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {Math.round(stats.bestDayOfWeek.avgMinutes)} min avg
              </p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
              <p className="text-xs text-red-700 dark:text-red-400 mb-1">Slowest Day</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {DAY_NAMES[stats.worstDayOfWeek.day]}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {Math.round(stats.worstDayOfWeek.avgMinutes)} min avg
              </p>
            </div>
          </div>
        )}

        {/* OMNY stats */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-yellow-800 dark:text-yellow-300">OMNY Spend</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                ${(fareTracking.weeklyRides * fareTracking.currentFare).toFixed(0)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-yellow-800 dark:text-yellow-300">Rides This Week</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {fareTracking.weeklyRides}/12
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Generated by MTA My Way</p>
        </div>
      </div>
    </div>
  );
}

export default SubwayYear;
