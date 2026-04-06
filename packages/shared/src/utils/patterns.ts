/**
 * Time bucket and pattern analysis utilities
 */

import type { DayCategory, TimeBucket } from "../types/delays.js";

/**
 * Get the time bucket for a given hour (0-23)
 */
export function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 4 && hour < 6) return "early_morning";
  if (hour >= 6 && hour < 10) return "morning_rush";
  if (hour >= 10 && hour < 15) return "midday";
  if (hour >= 15 && hour < 19) return "evening_rush";
  return "night";
}

/**
 * Get the time bucket for a timestamp
 */
export function getTimeBucketForTimestamp(timestamp: number): TimeBucket {
  const date = new Date(timestamp);
  return getTimeBucket(date.getHours());
}

/**
 * Get the current time bucket
 */
export function getCurrentTimeBucket(): TimeBucket {
  return getTimeBucketForTimestamp(Date.now());
}

/**
 * Get the day category for a date
 */
export function getDayCategory(date: Date): DayCategory {
  const day = date.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "weekday";
}

/**
 * Get the day category for a timestamp
 */
export function getDayCategoryForTimestamp(timestamp: number): DayCategory {
  return getDayCategory(new Date(timestamp));
}

/**
 * Get the current day category
 */
export function getCurrentDayCategory(): DayCategory {
  return getDayCategory(new Date());
}

/**
 * Get a human-readable label for a time bucket
 */
export function getTimeBucketLabel(bucket: TimeBucket): string {
  const labels: Record<TimeBucket, string> = {
    early_morning: "4 AM - 6 AM",
    morning_rush: "6 AM - 10 AM",
    midday: "10 AM - 3 PM",
    evening_rush: "3 PM - 7 PM",
    night: "7 PM - 4 AM",
  };
  return labels[bucket] ?? bucket;
}

/**
 * Get a human-readable label for a day category
 */
export function getDayCategoryLabel(category: DayCategory): string {
  const labels: Record<DayCategory, string> = {
    weekday: "Weekday",
    saturday: "Saturday",
    sunday: "Sunday",
  };
  return labels[category] ?? category;
}
