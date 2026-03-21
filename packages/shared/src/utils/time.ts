/**
 * Time formatting and calculation utilities
 */

/**
 * Calculate minutes away from a future timestamp
 */
export function calculateMinutesAway(arrivalTime: number): number {
  const now = Date.now();
  const diff = arrivalTime - now;
  return Math.max(0, Math.round(diff / 1000 / 60));
}

/**
 * Calculate seconds away from a future timestamp
 */
export function calculateSecondsAway(arrivalTime: number): number {
  const now = Date.now();
  const diff = arrivalTime - now;
  return Math.max(0, Math.round(diff / 1000));
}

/**
 * Format minutes away for display
 * - 0 = "now" or "0 min"
 * - 1-59 = "X min"
 * - 60+ = "X hr Y min"
 */
export function formatMinutesAway(minutes: number): string {
  if (minutes <= 0) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${mins} min`;
}

/**
 * Format a POSIX timestamp as a time string (e.g., "8:05 AM")
 */
export function formatTime(timestamp: number, timeZone?: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timeZone ?? undefined,
  });
}

/**
 * Format a POSIX timestamp as a short date string (e.g., "Mar 15")
 */
export function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a POSIX timestamp as a full date string (e.g., "March 15, 2024")
 */
export function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format relative time ago (e.g., "5s ago", "2 min ago", "1 hr ago")
 */
export function formatTimeAgo(secondsAgo: number): string {
  if (secondsAgo < 60) {
    return `${Math.round(secondsAgo)}s ago`;
  }
  const minutes = Math.round(secondsAgo / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours} hr ago`;
}

/**
 * Format seconds as a human-readable duration (e.g., "5 min 30 sec")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes < 60) {
    if (secs === 0) {
      return `${minutes} min`;
    }
    return `${minutes} min ${secs} sec`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${mins} min`;
}

/**
 * Get the current day of week (0 = Sunday, 6 = Saturday)
 */
export function getCurrentDayOfWeek(): number {
  return new Date().getDay();
}

/**
 * Get the current hour (0-23)
 */
export function getCurrentHour(): number {
  return new Date().getHours();
}

/**
 * Get the ISO date string for today (YYYY-MM-DD)
 */
export function getTodayISO(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

/**
 * Get the ISO date for the Monday of the current week
 */
export function getWeekStartISO(date?: Date): string {
  const d = date ?? new Date();
  const day = d.getDay();
  // Sunday = 0, so Monday = 1 or -6 depending on direction
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().split("T")[0] ?? "";
}

/**
 * Get the ISO date for the 1st of the current month
 */
export function getMonthStartISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Check if a timestamp is within the last N seconds
 */
export function isRecent(timestamp: number, maxAgeSeconds: number): boolean {
  return Date.now() - timestamp < maxAgeSeconds * 1000;
}

/**
 * Check if data is stale (older than threshold)
 */
export function isStale(
  timestamp: number,
  staleThresholdSeconds: number
): boolean {
  const ageSeconds = (Date.now() - timestamp) / 1000;
  return ageSeconds > staleThresholdSeconds;
}

/**
 * Get the age of data in seconds
 */
export function getDataAge(timestamp: number): number {
  return (Date.now() - timestamp) / 1000;
}
