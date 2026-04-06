/**
 * Migration: Add trips and commute journal tables
 */

import type Database from "better-sqlite3";

export const description = "Add trips table for trip tracking and commute journal";

export function up(db: Database.Database): void {
  // Main trips table for storing trip records
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      origin_station_id TEXT NOT NULL,
      origin_station_name TEXT NOT NULL,
      destination_station_id TEXT NOT NULL,
      destination_station_name TEXT NOT NULL,
      line TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('N', 'S')),
      departure_time INTEGER NOT NULL,
      arrival_time INTEGER NOT NULL,
      actual_duration_minutes INTEGER NOT NULL,
      scheduled_duration_minutes INTEGER,
      source TEXT NOT NULL CHECK(source IN ('tracked', 'inferred', 'manual')),
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trips_date ON trips(date);
    CREATE INDEX IF NOT EXISTS idx_trips_origin ON trips(origin_station_id);
    CREATE INDEX IF NOT EXISTS idx_trips_destination ON trips(destination_station_id);
    CREATE INDEX IF NOT EXISTS idx_trips_line ON trips(line, direction);
    CREATE INDEX IF NOT EXISTS idx_trips_departure_time ON trips(departure_time);
  `);

  // Commute stats cache table (materialized view)
  db.exec(`
    CREATE TABLE IF NOT EXISTS commute_stats (
      commute_id TEXT PRIMARY KEY,
      average_duration_minutes REAL NOT NULL,
      median_duration_minutes REAL NOT NULL,
      std_dev_minutes REAL NOT NULL,
      total_trips INTEGER NOT NULL,
      trips_this_week INTEGER NOT NULL,
      trend REAL NOT NULL,
      average_delay_minutes REAL NOT NULL,
      max_delay_minutes INTEGER NOT NULL,
      on_time_percentage REAL NOT NULL,
      last_updated INTEGER NOT NULL
    )
  `);

  // User context state table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_context (
      id TEXT PRIMARY KEY,
      context TEXT NOT NULL CHECK(context IN ('commuting', 'planning', 'reviewing', 'idle', 'at_station')),
      confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
      factors_json TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      is_manual_override INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Context transition history
  db.exec(`
    CREATE TABLE IF NOT EXISTS context_transitions (
      id TEXT PRIMARY KEY,
      from_context TEXT NOT NULL,
      to_context TEXT NOT NULL,
      triggered_at INTEGER NOT NULL,
      trigger TEXT NOT NULL CHECK(trigger IN ('location', 'time', 'pattern', 'activity', 'manual')),
      factors_json TEXT
    )
  `);

  // Index for context queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_context_detected_at ON user_context(detected_at);
    CREATE INDEX IF NOT EXISTS idx_context_transitions_triggered_at ON context_transitions(triggered_at);
  `);
}

export function down(db: Database.Database): void {
  db.exec(`DROP INDEX IF EXISTS idx_context_transitions_triggered_at`);
  db.exec(`DROP INDEX IF EXISTS idx_context_detected_at`);
  db.exec(`DROP TABLE IF EXISTS context_transitions`);
  db.exec(`DROP TABLE IF EXISTS user_context`);
  db.exec(`DROP TABLE IF EXISTS commute_stats`);
  db.exec(`DROP INDEX IF EXISTS idx_trips_departure_time`);
  db.exec(`DROP INDEX IF EXISTS idx_trips_line`);
  db.exec(`DROP INDEX IF EXISTS idx_trips_destination`);
  db.exec(`DROP INDEX IF EXISTS idx_trips_origin`);
  db.exec(`DROP INDEX IF EXISTS idx_trips_date`);
  db.exec(`DROP TABLE IF EXISTS trips`);
}
