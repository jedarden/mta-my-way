/**
 * Trip tracking and commute journal service (Phase 5).
 *
 * Provides:
 * - Trip recording (manual, inferred from GTFS-RT, tracked)
 * - Commute journal query API
 * - Statistics calculation (average, median, std dev, trends)
 * - Trip inference from real-time data
 */

import type { CommuteStats, StationIndex, TripRecord, TripSource } from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import {
  recordTripCreated,
  recordTripQueried,
  recordTripQueryDuration,
  setActiveTripsCount,
} from "./middleware/metrics.js";
import { logger } from "./observability/logger.js";

// Default commute ID when no specific commute is configured
const DEFAULT_COMMUTE_ID = "default";

// Database instance (set via initTripTracking)
let db: Database.Database | null = null;
let stations: StationIndex | null = null;

/**
 * Initialize trip tracking service.
 */
export function initTripTracking(database: Database.Database, stationData: StationIndex): void {
  db = database;
  stations = stationData;

  // Run migrations
  void import("./migration/index.js").then(({ runMigrations }) => {
    runMigrations(db!).catch((err) => {
      logger.error(
        "Failed to run trip tracking migrations",
        err instanceof Error ? err : undefined
      );
    });
  });

  // Set initial active trips count
  const totalTrips = getTotalTripCount();
  setActiveTripsCount(totalTrips);

  logger.info("Trip tracking initialized", { totalTrips });
}

// ============================================================================
// Trip Recording
// ============================================================================

/**
 * Record a trip in the journal.
 */
export function recordTrip(trip: Omit<TripRecord, "id">): TripRecord | null {
  if (!db) return null;

  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    db.prepare(
      `INSERT INTO trips (
          id, date, origin_station_id, origin_station_name,
          destination_station_id, destination_station_name, line, direction,
          departure_time, arrival_time, actual_duration_minutes,
          scheduled_duration_minutes, source, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      trip.date,
      trip.origin.id,
      trip.origin.name,
      trip.destination.id,
      trip.destination.name,
      trip.line,
      "N", // Default direction for manual trips
      trip.departureTime,
      trip.arrivalTime,
      trip.actualDurationMinutes,
      trip.scheduledDurationMinutes ?? null,
      trip.source,
      trip.notes ?? null,
      now,
      now
    );

    // Invalidate commute stats cache
    invalidateCommuteStats(DEFAULT_COMMUTE_ID);

    // Record trip created metric
    recordTripCreated(trip.source, trip.line);

    logger.info("Trip recorded", {
      tripId: id,
      origin: trip.origin.name,
      destination: trip.destination.name,
      source: trip.source,
    });

    return { ...trip, id };
  } catch (error) {
    logger.error("Failed to record trip", error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Record a trip from GTFS-RT data (inferred).
 */
export function recordInferredTrip(params: {
  tripId: string;
  routeId: string;
  direction: "N" | "S";
  originId: string;
  destinationId: string;
  departureTime: number;
  arrivalTime: number;
}): TripRecord | null {
  if (!stations || !db) return null;

  const originStation = stations[params.originId];
  const destStation = stations[params.destinationId];

  if (!originStation || !destStation) return null;

  const actualDurationMinutes = Math.round((params.arrivalTime - params.departureTime) / 60);

  const trip: Omit<TripRecord, "id"> = {
    date: new Date(params.departureTime * 1000).toISOString().split("T")[0]!,
    origin: { id: params.originId, name: originStation.name },
    destination: { id: params.destinationId, name: destStation.name },
    line: params.routeId,
    departureTime: params.departureTime * 1000,
    arrivalTime: params.arrivalTime * 1000,
    actualDurationMinutes,
    source: "inferred",
  };

  return recordTrip(trip);
}

/**
 * Update trip notes.
 */
export function updateTripNotes(tripId: string, notes: string): boolean {
  if (!db) return false;

  try {
    const result = db
      .prepare("UPDATE trips SET notes = ?, updated_at = ? WHERE id = ?")
      .run(notes, Date.now(), tripId);

    return result.changes > 0;
  } catch (error) {
    logger.error("Failed to update trip notes", error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Delete a trip from the journal.
 */
export function deleteTrip(tripId: string): boolean {
  if (!db) return false;

  try {
    const result = db.prepare("DELETE FROM trips WHERE id = ?").run(tripId);

    if (result.changes > 0) {
      invalidateCommuteStats(DEFAULT_COMMUTE_ID);
      logger.info("Trip deleted", { tripId });
      return true;
    }
    return false;
  } catch (error) {
    logger.error("Failed to delete trip", error instanceof Error ? error : undefined);
    return false;
  }
}

// ============================================================================
// Journal Query API
// ============================================================================

/**
 * Get trip records with pagination.
 */
export function getTrips(params: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  originId?: string;
  destinationId?: string;
  line?: string;
  source?: TripSource;
}): TripRecord[] {
  const startTime = Date.now();

  if (!db) {
    recordTripQueryDuration(0);
    recordTripQueried(false);
    return [];
  }

  const {
    limit = 50,
    offset = 0,
    startDate,
    endDate,
    originId,
    destinationId,
    line,
    source,
  } = params;

  const conditions: string[] = ["1=1"];
  const sqlParams: unknown[] = [];

  if (startDate) {
    conditions.push("date >= ?");
    sqlParams.push(startDate);
  }
  if (endDate) {
    conditions.push("date <= ?");
    sqlParams.push(endDate);
  }
  if (originId) {
    conditions.push("origin_station_id = ?");
    sqlParams.push(originId);
  }
  if (destinationId) {
    conditions.push("destination_station_id = ?");
    sqlParams.push(destinationId);
  }
  if (line) {
    conditions.push("line = ?");
    sqlParams.push(line);
  }
  if (source) {
    conditions.push("source = ?");
    sqlParams.push(source);
  }

  sqlParams.push(limit, offset);

  const rows = db
    .prepare(
      `SELECT
        id, date, origin_station_id, origin_station_name,
        destination_station_id, destination_station_name,
        line, direction, departure_time, arrival_time,
        actual_duration_minutes, scheduled_duration_minutes,
        source, notes
      FROM trips
      WHERE ${conditions.join(" AND ")}
      ORDER BY departure_time DESC
      LIMIT ? OFFSET ?`
    )
    .all(...sqlParams) as TripRecordRow[];

  const duration = (Date.now() - startTime) / 1000;
  recordTripQueryDuration(duration);
  recordTripQueried(true);

  return rows.map(rowToTripRecord);
}

interface TripRecordRow {
  id: string;
  date: string;
  origin_station_id: string;
  origin_station_name: string;
  destination_station_id: string;
  destination_station_name: string;
  line: string;
  direction: string;
  departure_time: number;
  arrival_time: number;
  actual_duration_minutes: number;
  scheduled_duration_minutes: number | null;
  source: string;
  notes: string | null;
}

function rowToTripRecord(row: TripRecordRow): TripRecord {
  return {
    id: row.id,
    date: row.date,
    origin: { id: row.origin_station_id, name: row.origin_station_name },
    destination: { id: row.destination_station_id, name: row.destination_station_name },
    line: row.line,
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    actualDurationMinutes: row.actual_duration_minutes,
    scheduledDurationMinutes: row.scheduled_duration_minutes ?? undefined,
    source: row.source as TripSource,
    notes: row.notes ?? undefined,
  };
}

/**
 * Get a single trip by ID.
 */
export function getTripById(tripId: string): TripRecord | null {
  const startTime = Date.now();

  if (!db) {
    recordTripQueryDuration(0);
    recordTripQueried(false);
    return null;
  }

  const row = db
    .prepare(
      `SELECT
        id, date, origin_station_id, origin_station_name,
        destination_station_id, destination_station_name,
        line, direction, departure_time, arrival_time,
        actual_duration_minutes, scheduled_duration_minutes,
        source, notes
      FROM trips
      WHERE id = ?`
    )
    .get(tripId) as TripRecordRow | undefined;

  const duration = (Date.now() - startTime) / 1000;
  recordTripQueryDuration(duration);
  recordTripQueried(!!row);

  return row ? rowToTripRecord(row) : null;
}

/**
 * Get trips for a specific date range.
 */
export function getTripsByDateRange(startDate: string, endDate: string): TripRecord[] {
  return getTrips({ startDate, endDate, limit: 1000 });
}

/**
 * Get recent trips for a station.
 */
export function getRecentTripsForStation(stationId: string, limit: number = 10): TripRecord[] {
  return getTrips({
    originId: stationId,
    destinationId: stationId,
    limit,
  });
}

// ============================================================================
// Statistics Calculation
// ============================================================================

/**
 * Calculate commute statistics for a route.
 */
export function calculateCommuteStats(commuteId: string = DEFAULT_COMMUTE_ID): CommuteStats | null {
  if (!db) return null;

  // Check cache first
  const cached = getCachedCommuteStats(commuteId);
  if (cached && Date.now() - cached.last_updated < 300_000) {
    // Cache valid for 5 minutes
    return {
      ...cached,
      records: getTrips({ limit: 90 }),
    };
  }

  // Get all trip records for statistics
  const allTrips = getTrips({ limit: 500 });

  if (allTrips.length === 0) {
    return {
      commuteId,
      averageDurationMinutes: 0,
      medianDurationMinutes: 0,
      stdDevMinutes: 0,
      totalTrips: 0,
      tripsThisWeek: 0,
      trend: 0,
      averageDelayMinutes: 0,
      maxDelayMinutes: 0,
      onTimePercentage: 0,
      records: [],
    };
  }

  // Calculate duration statistics
  const durations = allTrips.map((t) => t.actualDurationMinutes).sort((a, b) => a - b);
  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const medianDuration = durations[Math.floor(durations.length / 2)] ?? 0;

  // Calculate standard deviation
  const variance =
    durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
  const stdDev = Math.sqrt(variance);

  // Calculate delay statistics
  const tripsWithSchedule = allTrips.filter((t) => t.scheduledDurationMinutes);
  const delays = tripsWithSchedule.map((t) => ({
    delay: t.actualDurationMinutes - (t.scheduledDurationMinutes ?? 0),
    onTime: Math.abs(t.actualDurationMinutes - (t.scheduledDurationMinutes ?? 0)) <= 2,
  }));

  const avgDelay =
    delays.length > 0 ? delays.reduce((sum, d) => sum + d.delay, 0) / delays.length : 0;
  const maxDelay = delays.length > 0 ? Math.max(...delays.map((d) => d.delay)) : 0;
  const onTimeCount = delays.filter((d) => d.onTime).length;
  const onTimePercentage = delays.length > 0 ? (onTimeCount / delays.length) * 100 : 0;

  // Calculate trips this week
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekStartISO = weekStart.toISOString().split("T")[0]!;
  const tripsThisWeek = allTrips.filter((t) => t.date >= weekStartISO).length;

  // Calculate trend vs prior 4 weeks
  const fourWeeksAgo = new Date(weekStart);
  fourWeeksAgo.setDate(weekStart.getDate() - 28);
  const fourWeeksAgoISO = fourWeeksAgo.toISOString().split("T")[0]!;

  const priorWeekTrips = allTrips.filter(
    (t) => t.date >= fourWeeksAgoISO && t.date < weekStartISO
  ).length;
  const prior4WeekAvg = priorWeekTrips / 4;
  const trend = prior4WeekAvg > 0 ? ((tripsThisWeek - prior4WeekAvg) / prior4WeekAvg) * 100 : 0;

  const stats: CommuteStats = {
    commuteId,
    averageDurationMinutes: Math.round(avgDuration * 10) / 10,
    medianDurationMinutes: medianDuration,
    stdDevMinutes: Math.round(stdDev * 10) / 10,
    totalTrips: allTrips.length,
    tripsThisWeek,
    trend: Math.round(trend * 10) / 10,
    averageDelayMinutes: Math.round(avgDelay * 10) / 10,
    maxDelayMinutes: Math.round(maxDelay),
    onTimePercentage: Math.round(onTimePercentage * 10) / 10,
    records: allTrips.slice(0, 90),
  };

  // Cache the stats
  cacheCommuteStats(stats);

  return stats;
}

/**
 * Get cached commute statistics.
 */
function getCachedCommuteStats(commuteId: string): {
  commute_id: string;
  average_duration_minutes: number;
  median_duration_minutes: number;
  std_dev_minutes: number;
  total_trips: number;
  trips_this_week: number;
  trend: number;
  average_delay_minutes: number;
  max_delay_minutes: number;
  on_time_percentage: number;
  last_updated: number;
} | null {
  if (!db) return null;

  return db
    .prepare("SELECT * FROM commute_stats WHERE commute_id = ?")
    .get(commuteId) as ReturnType<typeof getCachedCommuteStats>;
}

/**
 * Cache commute statistics.
 */
function cacheCommuteStats(stats: CommuteStats): void {
  if (!db) return;

  const now = Date.now();

  db.prepare(
    `INSERT OR REPLACE INTO commute_stats (
      commute_id, average_duration_minutes, median_duration_minutes,
      std_dev_minutes, total_trips, trips_this_week, trend,
      average_delay_minutes, max_delay_minutes, on_time_percentage,
      last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    stats.commuteId,
    stats.averageDurationMinutes,
    stats.medianDurationMinutes,
    stats.stdDevMinutes,
    stats.totalTrips,
    stats.tripsThisWeek,
    stats.trend,
    stats.averageDelayMinutes,
    stats.maxDelayMinutes,
    stats.onTimePercentage,
    now
  );
}

/**
 * Invalidate commute stats cache.
 */
function invalidateCommuteStats(commuteId: string): void {
  if (!db) return;

  db.prepare("DELETE FROM commute_stats WHERE commute_id = ?").run(commuteId);
}

/**
 * Get trip count for a specific date.
 */
export function getTripCountForDate(date: string): number {
  if (!db) return 0;

  const result = db.prepare("SELECT COUNT(*) as count FROM trips WHERE date = ?").get(date) as {
    count: number;
  };

  return result.count;
}

/**
 * Get total trip count.
 */
export function getTotalTripCount(): number {
  if (!db) return 0;

  const result = db.prepare("SELECT COUNT(*) as count FROM trips").get() as { count: number };

  return result.count;
}

/**
 * Clean up old trip records (older than 90 days, keep last 500).
 */
export function cleanupOldTrips(): number {
  if (!db) return 0;

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const cutoffDate = ninetyDaysAgo.toISOString().split("T")[0]!;

  // Get count of trips older than 90 days
  const oldTripsCount = db
    .prepare("SELECT COUNT(*) as count FROM trips WHERE date < ?")
    .get(cutoffDate) as { count: number };

  const totalTrips = getTotalTripCount();

  // Only delete if we have more than 500 total AND some are old
  if (totalTrips > 500 && oldTripsCount.count > 0) {
    const toDelete = totalTrips - 500;
    const result = db
      .prepare(
        `DELETE FROM trips
         WHERE date < ?
         ORDER BY departure_time ASC
         LIMIT ?`
      )
      .run(cutoffDate, toDelete);

    logger.info("Trips cleanup completed", {
      deletedCount: result.changes,
      remainingCount: getTotalTripCount(),
    });

    return result.changes;
  }

  return 0;
}
