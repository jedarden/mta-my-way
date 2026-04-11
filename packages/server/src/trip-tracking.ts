/**
 * Trip tracking and commute journal service (Phase 5).
 *
 * Provides:
 * - Trip recording (manual, inferred from GTFS-RT, tracked)
 * - Commute journal query API
 * - Statistics calculation (average, median, std dev, trends)
 * - Trip inference from real-time data
 * - Resource-level access control (ownership checks)
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

// Default owner ID for unauthenticated or legacy data
export const DEFAULT_OWNER_ID = "anonymous";

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
 *
 * @param trip - Trip data to record
 * @param ownerId - Owner ID for access control (defaults to "anonymous")
 */
export function recordTrip(
  trip: Omit<TripRecord, "id">,
  ownerId: string = DEFAULT_OWNER_ID
): TripRecord | null {
  if (!db) return null;

  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    db.prepare(
      `INSERT INTO trips (
          id, date, origin_station_id, origin_station_name,
          destination_station_id, destination_station_name, line, direction,
          departure_time, arrival_time, actual_duration_minutes,
          scheduled_duration_minutes, source, notes, created_at, updated_at, owner_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      trip.date,
      trip.origin.stationId,
      trip.origin.stationName,
      trip.destination.stationId,
      trip.destination.stationName,
      trip.line,
      "N", // Default direction for manual trips
      trip.departureTime,
      trip.arrivalTime,
      trip.actualDurationMinutes,
      trip.scheduledDurationMinutes ?? null,
      trip.source,
      trip.notes ?? null,
      now,
      now,
      ownerId
    );

    // Invalidate commute stats cache
    invalidateCommuteStats(DEFAULT_COMMUTE_ID);

    // Record trip created metric
    recordTripCreated(trip.source, trip.line);

    logger.info("Trip recorded", {
      tripId: id,
      origin: trip.origin.stationName,
      destination: trip.destination.stationName,
      source: trip.source,
      ownerId,
    });

    return { ...trip, id };
  } catch (error) {
    logger.error("Failed to record trip", error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Record a trip from GTFS-RT data (inferred).
 *
 * @param params - Trip parameters
 * @param ownerId - Owner ID for access control (defaults to "anonymous")
 */
export function recordInferredTrip(
  params: {
    tripId: string;
    routeId: string;
    direction: "N" | "S";
    originId: string;
    destinationId: string;
    departureTime: number;
    arrivalTime: number;
  },
  ownerId: string = DEFAULT_OWNER_ID
): TripRecord | null {
  if (!stations || !db) return null;

  const originStation = stations[params.originId];
  const destStation = stations[params.destinationId];

  if (!originStation || !destStation) return null;

  const actualDurationMinutes = Math.round((params.arrivalTime - params.departureTime) / 60);

  const trip: Omit<TripRecord, "id"> = {
    date: new Date(params.departureTime * 1000).toISOString().split("T")[0]!,
    origin: { stationId: params.originId, stationName: originStation.name },
    destination: { stationId: params.destinationId, stationName: destStation.name },
    line: params.routeId,
    departureTime: params.departureTime * 1000,
    arrivalTime: params.arrivalTime * 1000,
    actualDurationMinutes,
    source: "inferred",
  };

  return recordTrip(trip, ownerId);
}

/**
 * Update trip notes with ownership check.
 *
 * @param tripId - Trip ID to update
 * @param notes - New notes content
 * @param ownerId - Owner ID for access control (optional, skips check if not provided for backward compatibility)
 */
export function updateTripNotes(tripId: string, notes: string, ownerId?: string): boolean {
  if (!db) return false;

  try {
    let stmt: Database.Statement;
    const now = Date.now();

    if (ownerId) {
      // Only update if the trip belongs to the owner
      stmt = db.prepare("UPDATE trips SET notes = ?, updated_at = ? WHERE id = ? AND owner_id = ?");
      const result = stmt.run(notes, now, tripId, ownerId);

      if (result.changes === 0) {
        logger.warn("Trip notes update failed: ownership check failed", { tripId, ownerId });
      }

      return result.changes > 0;
    } else {
      // No ownership check (for admin operations or backward compatibility)
      stmt = db.prepare("UPDATE trips SET notes = ?, updated_at = ? WHERE id = ?");
      const result = stmt.run(notes, now, tripId);

      return result.changes > 0;
    }
  } catch (error) {
    logger.error("Failed to update trip notes", error instanceof Error ? error : undefined);
    return false;
  }
}

/**
 * Delete a trip from the journal with ownership check.
 *
 * @param tripId - Trip ID to delete
 * @param ownerId - Owner ID for access control (optional, skips check if not provided for backward compatibility)
 */
export function deleteTrip(tripId: string, ownerId?: string): boolean {
  if (!db) return false;

  try {
    let stmt: Database.Statement;

    if (ownerId) {
      // Only delete if the trip belongs to the owner
      stmt = db.prepare("DELETE FROM trips WHERE id = ? AND owner_id = ?");
      const result = stmt.run(tripId, ownerId);

      if (result.changes === 0) {
        logger.warn("Trip deletion failed: ownership check failed", { tripId, ownerId });
        return false;
      }

      invalidateCommuteStats(DEFAULT_COMMUTE_ID);
      logger.info("Trip deleted", { tripId, ownerId });
      return true;
    } else {
      // No ownership check (for admin operations or backward compatibility)
      const result = db.prepare("DELETE FROM trips WHERE id = ?").run(tripId);

      if (result.changes > 0) {
        invalidateCommuteStats(DEFAULT_COMMUTE_ID);
        logger.info("Trip deleted (admin)", { tripId });
        return true;
      }
      return false;
    }
  } catch (error) {
    logger.error("Failed to delete trip", error instanceof Error ? error : undefined);
    return false;
  }
}

// ============================================================================
// Journal Query API
// ============================================================================

/**
 * Get trip records with pagination and optional ownership filtering.
 *
 * @param params - Query parameters including optional ownerId for access control
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
  ownerId?: string; // For ownership filtering - if not provided, returns all trips (admin only)
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
    ownerId,
  } = params;

  const conditions: string[] = ["1=1"];
  const sqlParams: unknown[] = [];

  if (ownerId) {
    conditions.push("owner_id = ?");
    sqlParams.push(ownerId);
  }

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
        source, notes, owner_id
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
  owner_id: string;
}

function rowToTripRecord(row: TripRecordRow): TripRecord & { ownerId?: string } {
  return {
    id: row.id,
    date: row.date,
    origin: { stationId: row.origin_station_id, stationName: row.origin_station_name },
    destination: {
      stationId: row.destination_station_id,
      stationName: row.destination_station_name,
    },
    line: row.line,
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    actualDurationMinutes: row.actual_duration_minutes,
    scheduledDurationMinutes: row.scheduled_duration_minutes ?? undefined,
    source: row.source as TripSource,
    notes: row.notes ?? undefined,
    ownerId: row.owner_id,
  };
}

/**
 * Get a single trip by ID.
 */
export function getTripById(tripId: string): (TripRecord & { ownerId?: string }) | null {
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
        source, notes, owner_id
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

/**
 * Check if a trip belongs to a specific owner.
 *
 * @param tripId - Trip ID to check
 * @param ownerId - Owner ID to verify
 * @returns true if the trip belongs to the owner
 */
export function checkTripOwnership(tripId: string, ownerId: string): boolean {
  if (!db) return false;

  const row = db.prepare("SELECT owner_id FROM trips WHERE id = ?").get(tripId) as
    | { owner_id: string }
    | undefined;

  return row?.owner_id === ownerId || row?.owner_id === DEFAULT_OWNER_ID;
}

/**
 * Get the owner ID of a trip.
 *
 * @param tripId - Trip ID to query
 * @returns Owner ID or undefined if trip not found
 */
export function getTripOwner(tripId: string): string | undefined {
  if (!db) return undefined;

  const row = db.prepare("SELECT owner_id FROM trips WHERE id = ?").get(tripId) as
    | { owner_id: string }
    | undefined;

  return row?.owner_id;
}

// ============================================================================
// Statistics Calculation
// ============================================================================

/**
 * Calculate commute statistics for a route.
 *
 * @param commuteId - Commute ID to calculate stats for
 * @param ownerId - Optional owner ID for filtering user-specific stats
 */
export function calculateCommuteStats(
  commuteId: string = DEFAULT_COMMUTE_ID,
  ownerId?: string
): CommuteStats | null {
  if (!db) return null;

  // Check cache first (skip cache if owner-specific query)
  const cached = !ownerId ? getCachedCommuteStats(commuteId) : null;
  if (cached && Date.now() - cached.last_updated < 300_000) {
    // Cache valid for 5 minutes
    return {
      commuteId: cached.commute_id,
      averageDurationMinutes: cached.average_duration_minutes,
      medianDurationMinutes: cached.median_duration_minutes,
      stdDevMinutes: cached.std_dev_minutes,
      totalTrips: cached.total_trips,
      tripsThisWeek: cached.trips_this_week,
      trend: cached.trend,
      averageDelayMinutes: cached.average_delay_minutes,
      maxDelayMinutes: cached.max_delay_minutes,
      onTimePercentage: cached.on_time_percentage,
      records: getTrips({ limit: 90, ownerId }),
    };
  }

  // Get all trip records for statistics with ownership filter
  const allTrips = getTrips({ limit: 500, ownerId });

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

  // Cache the stats (only for non-owner-specific queries)
  if (!ownerId) {
    cacheCommuteStats(stats);
  }

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
