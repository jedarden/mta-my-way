/**
 * useWeeklyDigest - Compute weekly commute statistics for digest notifications.
 *
 * Analyzes the user's trip journal to produce a summary:
 * - Average duration across all commutes
 * - Trend percentage (change vs previous 4 weeks)
 * - Worst day (day with longest average duration)
 */

import type { CommuteStats } from "@mta-my-way/shared";
import { useMemo } from "react";
import { useJournalStore } from "../stores";

export interface WeeklyDigestData {
  /** Whether there's enough data for a digest */
  hasData: boolean;
  /** Overall average duration (minutes) across all commutes */
  averageDurationMinutes: number;
  /** Overall trend percentage */
  trendPercent: number;
  /** Day of week with worst average (0=Sunday, 6=Saturday) */
  worstDay: number | null;
  /** Worst day name */
  worstDayName: string | null;
  /** Total trips this week */
  tripsThisWeek: number;
  /** Total trips recorded */
  totalTrips: number;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Hook to compute weekly digest data from the commute journal.
 */
export function useWeeklyDigest(): WeeklyDigestData {
  const stats = useJournalStore((s) => s.stats);
  const dayOfWeekStats = useJournalStore((s) => s.dayOfWeekStats);

  return useMemo(() => {
    const commuteIds = Object.keys(stats);

    if (commuteIds.length === 0) {
      return {
        hasData: false,
        averageDurationMinutes: 0,
        trendPercent: 0,
        worstDay: null,
        worstDayName: null,
        tripsThisWeek: 0,
        totalTrips: 0,
      };
    }

    // Aggregate across all commutes
    let totalDuration = 0;
    let totalTripsCount = 0;
    let tripsThisWeek = 0;
    let trendSum = 0;
    let trendCount = 0;

    // For worst day calculation
    const dayDurations: number[] = [0, 0, 0, 0, 0, 0, 0];
    const dayCounts: number[] = [0, 0, 0, 0, 0, 0, 0];

    for (const commuteId of commuteIds) {
      const commuteStats: CommuteStats = stats[commuteId]!;

      totalDuration += commuteStats.averageDurationMinutes * commuteStats.totalTrips;
      totalTripsCount += commuteStats.totalTrips;
      tripsThisWeek += commuteStats.tripsThisWeek;

      if (commuteStats.trend !== 0) {
        trendSum += commuteStats.trend;
        trendCount++;
      }

      // Day-of-week stats
      const dowStats = dayOfWeekStats[commuteId];
      if (dowStats) {
        for (let day = 0; day <= 6; day++) {
          const dayStat = dowStats[day];
          if (dayStat && dayStat.sampleCount > 0) {
            dayDurations[day]! += dayStat.averageDurationMinutes * dayStat.sampleCount;
            dayCounts[day]! += dayStat.sampleCount;
          }
        }
      }
    }

    // Calculate overall average
    const averageDurationMinutes =
      totalTripsCount > 0 ? Math.round(totalDuration / totalTripsCount) : 0;

    // Calculate average trend
    const trendPercent = trendCount > 0 ? Math.round(trendSum / trendCount) : 0;

    // Find worst day (highest average duration)
    let worstDay: number | null = null;
    let worstAvg = 0;
    for (let day = 0; day <= 6; day++) {
      const count = dayCounts[day]!;
      if (count >= 3) {
        // Need at least 3 samples
        const avg = dayDurations[day]! / count;
        if (avg > worstAvg) {
          worstAvg = avg;
          worstDay = day;
        }
      }
    }

    return {
      hasData: totalTripsCount >= 3,
      averageDurationMinutes,
      trendPercent,
      worstDay,
      worstDayName: worstDay !== null ? (DAY_NAMES[worstDay] ?? null) : null,
      tripsThisWeek,
      totalTrips: totalTripsCount,
    };
  }, [stats, dayOfWeekStats]);
}

/**
 * Format a digest notification body from the data.
 */
export function formatDigestNotification(digest: WeeklyDigestData): string {
  if (!digest.hasData) {
    return "Start tracking your trips to get commute insights!";
  }

  const parts: string[] = [];

  parts.push(`Avg commute: ${digest.averageDurationMinutes} min`);

  if (digest.trendPercent !== 0) {
    const direction = digest.trendPercent > 0 ? "slower" : "faster";
    parts.push(`${Math.abs(digest.trendPercent)}% ${direction} than last month`);
  }

  if (digest.worstDayName) {
    parts.push(`${digest.worstDayName}s are your longest days`);
  }

  return parts.join(" • ");
}
