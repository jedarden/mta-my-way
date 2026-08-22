/**
 * Durable storage for authenticated user preferences.
 *
 * Preferences share the SQLite database used by other stateful user data so
 * they remain available across process restarts and devices.
 */

import type { UserPreferences } from "@mta-my-way/shared";
import { logger } from "./observability/logger.js";
import { withPushDatabase } from "./push/subscriptions.js";

const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS: UserPreferences["settings"] = {
  theme: "system",
  showUnassignedTrips: false,
  refreshInterval: 30,
  alertSeverityFilter: "delays",
  hapticFeedback: true,
  accessibleMode: false,
  quietHours: { enabled: false, startHour: 22, endHour: 7 },
};

interface PreferenceRow {
  preferencesJson: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createDefaultSettings(): UserPreferences["settings"] {
  return {
    ...DEFAULT_SETTINGS,
    quietHours: { enabled: false, startHour: 22, endHour: 7 },
  };
}

/** Return a fresh default preferences snapshot for a new user. */
export function createDefaultUserPreferences(): UserPreferences {
  return {
    favorites: [],
    commutes: [],
    settings: createDefaultSettings(),
    pushSubscription: null,
    schemaVersion: SCHEMA_VERSION,
    tapHistory: [],
    onboardingComplete: false,
  };
}

/**
 * Normalize stored data from a prior version to the current complete
 * local-storage model. The route validates the required array fields before
 * writing, while this protects reads of legacy or partially populated rows.
 */
export function normalizeUserPreferences(value: unknown): UserPreferences {
  if (!isRecord(value)) {
    return createDefaultUserPreferences();
  }

  const defaults = createDefaultUserPreferences();
  const settings = isRecord(value["settings"])
    ? { ...defaults.settings, ...value["settings"] }
    : defaults.settings;

  return {
    favorites: Array.isArray(value["favorites"])
      ? (value["favorites"] as UserPreferences["favorites"])
      : defaults.favorites,
    commutes: Array.isArray(value["commutes"])
      ? (value["commutes"] as UserPreferences["commutes"])
      : defaults.commutes,
    settings: settings as UserPreferences["settings"],
    pushSubscription: isRecord(value["pushSubscription"])
      ? value["pushSubscription"]
      : defaults.pushSubscription,
    schemaVersion:
      typeof value["schemaVersion"] === "number" ? value["schemaVersion"] : defaults.schemaVersion,
    tapHistory: Array.isArray(value["tapHistory"])
      ? (value["tapHistory"] as UserPreferences["tapHistory"])
      : defaults.tapHistory,
    onboardingComplete:
      typeof value["onboardingComplete"] === "boolean"
        ? value["onboardingComplete"]
        : defaults.onboardingComplete,
  };
}

function ensurePreferencesTable(database: {
  exec(sql: string): void;
}): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      preferences_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

/** Retrieve a user's complete preferences, or a fresh default snapshot. */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  return withPushDatabase((database) => {
    ensurePreferencesTable(database);

    const row = database
      .prepare("SELECT preferences_json AS preferencesJson FROM user_preferences WHERE user_id = ?")
      .get(userId) as PreferenceRow | undefined;

    if (!row) {
      return createDefaultUserPreferences();
    }

    try {
      return normalizeUserPreferences(JSON.parse(row.preferencesJson));
    } catch (error) {
      logger.warn("Stored user preferences could not be parsed; returning defaults", {
        error: error instanceof Error ? error.message : String(error),
      });
      return createDefaultUserPreferences();
    }
  });
}

/**
 * Replace the saved preference snapshot for a user.
 *
 * PUT uses replacement semantics because clients submit their complete
 * local-storage snapshot. This makes removed favorites and commutes persist
 * correctly instead of being resurrected by a server-side merge.
 */
export async function replaceUserPreferences(
  userId: string,
  preferences: UserPreferences
): Promise<UserPreferences> {
  const normalized = normalizeUserPreferences(preferences);

  await withPushDatabase((database) => {
    ensurePreferencesTable(database);
    database
      .prepare(
        `INSERT INTO user_preferences (user_id, preferences_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           preferences_json = excluded.preferences_json,
           updated_at = excluded.updated_at`
      )
      .run(userId, JSON.stringify(normalized), Date.now());
  });

  logger.info("User preferences saved", {
    favoritesCount: normalized.favorites.length,
    commutesCount: normalized.commutes.length,
  });

  return normalized;
}
