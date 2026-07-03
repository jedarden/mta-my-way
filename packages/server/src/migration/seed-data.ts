/**
 * Seed data definitions for different environments.
 *
 * Provides initial data for development and testing environments.
 * Seed data includes:
 * - Reference data (lookup tables, configuration)
 * - Test data (sample users, trips, subscriptions)
 */

import type { SeedData } from "./seeding.js";

/**
 * Development environment seed data.
 * Includes realistic sample data for local development.
 */
export const devSeedData: SeedData[] = [
  {
    table: "trips",
    data: [
      {
        id: "dev-trip-001",
        date: "2024-01-15",
        origin_station_id: "001",
        origin_station_name: "Times Square - 42nd St",
        destination_station_id: "002",
        destination_station_name: "Grand Central - 42nd St",
        line: "1",
        direction: "S",
        departure_time: 1705340400000,
        arrival_time: 1705341000000,
        actual_duration_minutes: 10,
        scheduled_duration_minutes: 8,
        source: "tracked",
        notes: "Regular commute",
        created_at: 1705341000000,
        updated_at: 1705341000000,
        owner_id: "dev-user-001",
      },
      {
        id: "dev-trip-002",
        date: "2024-01-16",
        origin_station_id: "002",
        origin_station_name: "Grand Central - 42nd St",
        destination_station_id: "001",
        destination_station_name: "Times Square - 42nd St",
        line: "1",
        direction: "N",
        departure_time: 1705426800000,
        arrival_time: 1705427400000,
        actual_duration_minutes: 10,
        scheduled_duration_minutes: 8,
        source: "tracked",
        notes: "Return trip",
        created_at: 1705427400000,
        updated_at: 1705427400000,
        owner_id: "dev-user-001",
      },
    ],
    skipDuplicates: true,
  },
  {
    table: "user_context",
    data: [
      {
        id: "dev-context-001",
        context: "idle",
        confidence: "high",
        factors_json: '{"time_of_day": "morning", "location": "home"}',
        detected_at: 1705341000000,
        is_manual_override: 0,
        created_at: 1705341000000,
        updated_at: 1705341000000,
        owner_id: "dev-user-001",
      },
    ],
    skipDuplicates: true,
  },
  {
    table: "push_subscriptions",
    data: [
      {
        id: "dev-sub-001",
        user_id: "dev-user-001",
        endpoint: "https://fcm.googleapis.com/fcm/send/dev-token",
        keys_p256h: "test-key-p256h",
        keys_auth: "test-key-auth",
        created_at: 1705341000000,
        updated_at: 1705341000000,
        owner_id: "dev-user-001",
      },
    ],
    skipDuplicates: true,
  },
];

/**
 * Test environment seed data.
 * Includes minimal data for running tests.
 */
export const testSeedData: SeedData[] = [
  {
    table: "trips",
    data: [
      {
        id: "test-trip-001",
        date: "2024-01-15",
        origin_station_id: "001",
        origin_station_name: "Test Origin",
        destination_station_id: "002",
        destination_station_name: "Test Destination",
        line: "1",
        direction: "S",
        departure_time: 1705340400000,
        arrival_time: 1705341000000,
        actual_duration_minutes: 10,
        scheduled_duration_minutes: 8,
        source: "manual",
        notes: "Test trip",
        created_at: 1705341000000,
        updated_at: 1705341000000,
        owner_id: "test-user-001",
      },
    ],
    skipDuplicates: true,
  },
  {
    table: "user_context",
    data: [
      {
        id: "test-context-001",
        context: "idle",
        confidence: "high",
        factors_json: "{}",
        detected_at: 1705341000000,
        is_manual_override: 0,
        created_at: 1705341000000,
        updated_at: 1705341000000,
        owner_id: "test-user-001",
      },
    ],
    skipDuplicates: true,
  },
];

/**
 * Get seed data for a specific environment.
 *
 * @param environment - Environment name (dev, test, prod)
 * @returns Array of seed data entries
 */
export function getSeedDataForEnvironment(
  environment: "dev" | "test" | "prod"
): SeedData[] {
  switch (environment) {
    case "dev":
      return devSeedData;
    case "test":
      return testSeedData;
    case "prod":
      // Production environment should not have seed data
      return [];
    default:
      return [];
  }
}

/**
 * Validate that all tables referenced in seed data exist.
 *
 * @param tables - Array of table names that should exist
 * @returns Validation result
 */
export function validateSeedDataTables(tables: string[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Expected tables for seed data
  const expectedTables = ["trips", "user_context", "push_subscriptions"];

  for (const table of tables) {
    if (!expectedTables.includes(table)) {
      errors.push(`Unexpected table in seed data: ${table}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
