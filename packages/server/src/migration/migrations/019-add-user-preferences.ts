/**
 * Migration: Add durable authenticated user preference snapshots.
 */

import type Database from "better-sqlite3";

export const description = "Add SQLite storage for authenticated user preferences";

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      preferences_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS user_preferences`);
}
