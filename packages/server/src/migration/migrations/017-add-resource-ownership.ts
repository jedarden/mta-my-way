/**
 * Migration: Add resource ownership for access control
 *
 * Adds owner_id columns to trips and push_subscriptions tables
 * to enable resource-level access control. Users can only access
 * their own resources, while admins can access all resources.
 */

import type Database from "better-sqlite3";

export const description = "Add owner_id columns for resource-level access control";

/**
 * Apply the migration.
 *
 * @param db - Better-sqlite3 database instance
 */
export function up(db: Database.Database): void {
  // Add owner_id to trips table
  try {
    db.exec(`ALTER TABLE trips ADD COLUMN owner_id TEXT`);
    // Create index for ownership queries
    db.exec(`CREATE INDEX IF NOT EXISTS idx_trips_owner_id ON trips(owner_id)`);
  } catch {
    // Column already exists
  }

  // Add owner_id to push_subscriptions table
  try {
    db.exec(`ALTER TABLE push_subscriptions ADD COLUMN owner_id TEXT`);
    // Create index for ownership queries
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner_id ON push_subscriptions(owner_id)`
    );
  } catch {
    // Column already exists
  }

  // Add owner_id to user_context table for context ownership
  try {
    db.exec(`ALTER TABLE user_context ADD COLUMN owner_id TEXT`);
    // Create index for ownership queries
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user_context_owner_id ON user_context(owner_id)`);
  } catch {
    // Column already exists
  }
}

/**
 * Rollback the migration.
 *
 * @param db - Better-sqlite3 database instance
 */
export function down(db: Database.Database): void {
  // SQLite doesn't support DROP COLUMN directly, so we need to recreate tables
  // This is a simplified rollback - in production you'd want to preserve data

  // Drop indexes
  db.exec(`DROP INDEX IF EXISTS idx_trips_owner_id`);
  db.exec(`DROP INDEX IF EXISTS idx_push_subscriptions_owner_id`);
  db.exec(`DROP INDEX IF EXISTS idx_user_context_owner_id`);

  // Note: The columns themselves will remain until the table is recreated
  // This is a known SQLite limitation
}
