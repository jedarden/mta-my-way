/**
 * Context-aware switching service (Phase 5).
 *
 * Detects user context based on:
 * - Location (near station)
 * - Time patterns (commute hours)
 * - Usage patterns (tap history, frequent stations)
 * - Activity (current screen, recent actions)
 *
 * Stores context state and transitions in the database.
 */

import type {
  ContextConfidence,
  ContextFactors,
  ContextSettings,
  ContextState,
  ContextTransition,
  ContextUIHints,
  FavoriteTapEvent,
  StationIndex,
  UserContext,
} from "@mta-my-way/shared";
import type Database from "better-sqlite3";

import {
  detectContext as detectContextUtil,
  getContextIcon,
  getContextLabel,
  getContextUIHints,
  shouldTriggerUIRefresh,
} from "@mta-my-way/shared";
import { logger } from "./observability/logger.js";

// Database instance
let db: Database.Database | null = null;
let stations: StationIndex | null = null;

// Current context state (in-memory cache)
let currentContext: ContextState | null = null;
let currentSettings: ContextSettings = {
  enabled: true,
  showIndicator: true,
  useLocation: true,
  useTimePatterns: true,
  learnPatterns: true,
};

// Default context state
const DEFAULT_CONTEXT: ContextState = {
  context: "idle",
  confidence: "low",
  factors: {
    location: { nearStation: false },
    time: {
      timeBucket: "midday",
      dayCategory: "weekday",
      isCommuteHours: false,
    },
    patterns: {
      frequentStations: [],
      tapFrequency: 0,
      hasPatterns: false,
    },
    activity: {
      currentScreen: "home",
      screenTime: 0,
      recentActions: [],
    },
  },
  detectedAt: new Date().toISOString(),
  isManualOverride: false,
};

/**
 * Initialize context service.
 */
export function initContextService(database: Database.Database, stationData: StationIndex): void {
  db = database;
  stations = stationData;

  // Load most recent context from database
  loadCurrentContext();

  logger.info("Context service initialized", {
    currentContext: currentContext?.context ?? "none",
  });
}

/**
 * Load the most recent context state from database.
 */
function loadCurrentContext(): void {
  if (!db) return;

  const row = db
    .prepare(
      `SELECT * FROM user_context
       ORDER BY detected_at DESC
       LIMIT 1`
    )
    .get() as
    | {
        id: string;
        context: string;
        confidence: string;
        factors_json: string;
        detected_at: number;
        is_manual_override: number;
      }
    | undefined;

  if (row) {
    try {
      currentContext = {
        context: row.context as UserContext,
        confidence: row.confidence as ContextConfidence,
        factors: JSON.parse(row.factors_json) as ContextFactors,
        detectedAt: new Date(row.detected_at).toISOString(),
        isManualOverride: row.is_manual_override === 1,
      };
    } catch (error) {
      logger.error("Failed to parse stored context", error instanceof Error ? error : undefined);
      currentContext = { ...DEFAULT_CONTEXT };
    }
  } else {
    currentContext = { ...DEFAULT_CONTEXT };
  }
}

/**
 * Get current context state.
 */
export function getCurrentContext(): ContextState {
  return currentContext ?? { ...DEFAULT_CONTEXT };
}

/**
 * Update context settings.
 */
export function updateContextSettings(settings: Partial<ContextSettings>): void {
  currentSettings = { ...currentSettings, ...settings };

  logger.info("Context settings updated", {
    settings: currentSettings,
  });
}

/**
 * Get current context settings.
 */
export function getContextSettings(): ContextSettings {
  return { ...currentSettings };
}

/**
 * Detect and update context based on provided factors.
 */
export function detectAndUpdateContext(params: {
  nearStation: boolean;
  nearStationId?: string;
  distanceToStation?: number;
  tapHistory: FavoriteTapEvent[];
  currentScreen: string;
  screenTime: number;
  recentActions: string[];
  manualOverride?: UserContext;
}): { context: ContextState; transition: ContextTransition | null } {
  const previousContext = currentContext?.context ?? "idle";

  // Use utility function to detect context
  const detected = detectContextUtil(params);

  // Check if context changed
  const contextChanged = previousContext !== detected.context;

  // Store context in database
  saveContextState(detected);

  // Record transition if context changed
  let transition: ContextTransition | null = null;
  if (contextChanged) {
    transition = recordContextTransition(previousContext, detected.context, params);
  }

  // Update in-memory state
  currentContext = detected;

  // Log significant transitions
  if (contextChanged && shouldTriggerUIRefresh(previousContext, detected.context)) {
    logger.info("Context transition", {
      from: previousContext,
      to: detected.context,
      confidence: detected.confidence,
      trigger: transition?.trigger,
    });
  }

  return { context: detected, transition };
}

/**
 * Save context state to database.
 */
function saveContextState(state: ContextState): void {
  if (!db) return;

  const id = crypto.randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO user_context (
      id, context, confidence, factors_json,
      detected_at, is_manual_override, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    state.context,
    state.confidence,
    JSON.stringify(state.factors),
    now,
    state.isManualOverride ? 1 : 0,
    now,
    now
  );

  // Clean up old context states (keep last 100)
  db.prepare(
    `DELETE FROM user_context
     WHERE id NOT IN (
       SELECT id FROM user_context
       ORDER BY detected_at DESC
       LIMIT 100
     )`
  ).run();
}

/**
 * Record a context transition in the database.
 */
function recordContextTransition(
  from: UserContext,
  to: UserContext,
  params: {
    nearStation: boolean;
    nearStationId?: string;
    distanceToStation?: number;
    tapHistory: FavoriteTapEvent[];
    currentScreen: string;
    screenTime: number;
    recentActions: string[];
    manualOverride?: UserContext;
  }
): ContextTransition {
  if (!db) {
    return {
      from,
      to,
      at: new Date().toISOString(),
      trigger: "manual",
    };
  }

  // Determine what triggered the transition
  let trigger: ContextTransition["trigger"] = "manual";
  if (params.manualOverride !== undefined) {
    trigger = "manual";
  } else if (params.nearStation && params.nearStationId) {
    trigger = "location";
  } else if (params.currentScreen === "journal" || params.recentActions.includes("view_history")) {
    trigger = "activity";
  } else {
    trigger = "pattern";
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO context_transitions (
      id, from_context, to_context, triggered_at, trigger, factors_json
    ) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    from,
    to,
    now,
    trigger,
    JSON.stringify({
      nearStation: params.nearStation,
      stationId: params.nearStationId,
      distance: params.distanceToStation,
      screenTime: params.screenTime,
      tapCount: params.tapHistory.length,
    })
  );

  // Clean up old transitions (keep last 1000)
  db.prepare(
    `DELETE FROM context_transitions
     WHERE id NOT IN (
       SELECT id FROM context_transitions
       ORDER BY triggered_at DESC
       LIMIT 1000
     )`
  ).run();

  return {
    from,
    to,
    at: new Date(now).toISOString(),
    trigger,
  };
}

/**
 * Get recent context transitions.
 */
export function getContextTransitions(limit: number = 20): ContextTransition[] {
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT from_context, to_context, triggered_at, trigger
       FROM context_transitions
       ORDER BY triggered_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<{
    from_context: string;
    to_context: string;
    triggered_at: number;
    trigger: string;
  }>;

  return rows.map((row) => ({
    from: row.from_context as UserContext,
    to: row.to_context as UserContext,
    at: new Date(row.triggered_at).toISOString(),
    trigger: row.trigger as ContextTransition["trigger"],
  }));
}

/**
 * Get UI hints for the current context.
 */
export function getCurrentContextUIHints(): ContextUIHints {
  const context = currentContext?.context ?? "idle";
  return getContextUIHints(context);
}

/**
 * Get context label for display.
 */
export function getCurrentContextLabel(): string {
  const context = currentContext?.context ?? "idle";
  return getContextLabel(context);
}

/**
 * Get context icon name.
 */
export function getCurrentContextIcon(): string {
  const context = currentContext?.context ?? "idle";
  return getContextIcon(context);
}

/**
 * Manually set context (override).
 */
export function setManualContext(context: UserContext): ContextState {
  const params = {
    nearStation: currentContext?.factors.location.nearStation ?? false,
    nearStationId: currentContext?.factors.location.stationId,
    distanceToStation: currentContext?.factors.location.distance,
    tapHistory: [],
    currentScreen: currentContext?.factors.activity.currentScreen ?? "home",
    screenTime: currentContext?.factors.activity.screenTime ?? 0,
    recentActions: currentContext?.factors.activity.recentActions ?? [],
    manualOverride: context,
  };

  const result = detectAndUpdateContext(params);
  return result.context;
}

/**
 * Clear manual override and re-detect context.
 */
export function clearManualOverride(): ContextState {
  const params = {
    nearStation: currentContext?.factors.location.nearStation ?? false,
    nearStationId: currentContext?.factors.location.stationId,
    distanceToStation: currentContext?.factors.location.distance,
    tapHistory: [],
    currentScreen: currentContext?.factors.activity.currentScreen ?? "home",
    screenTime: currentContext?.factors.activity.screenTime ?? 0,
    recentActions: currentContext?.factors.activity.recentActions ?? [],
  };

  const result = detectAndUpdateContext(params);
  return result.context;
}

/**
 * Get context summary for API response.
 */
export function getContextSummary(): {
  current: ContextState;
  settings: ContextSettings;
  uiHints: ContextUIHints;
  label: string;
  icon: string;
  recentTransitions: ContextTransition[];
} {
  return {
    current: getCurrentContext(),
    settings: getContextSettings(),
    uiHints: getCurrentContextUIHints(),
    label: getCurrentContextLabel(),
    icon: getCurrentContextIcon(),
    recentTransitions: getContextTransitions(10),
  };
}

/**
 * Detect context from API request parameters.
 */
export function detectContextFromRequest(params: {
  latitude?: number;
  longitude?: number;
  tapHistory?: FavoriteTapEvent[];
  currentScreen?: string;
  screenTime?: number;
  recentActions?: string[];
}): ContextState {
  if (!stations) {
    return { ...DEFAULT_CONTEXT };
  }

  // Check if user is near a station
  let nearStation = false;
  let nearStationId: string | undefined;
  let distanceToStation: number | undefined;

  if (params.latitude !== undefined && params.longitude !== undefined) {
    // Find nearest station
    let minDistance = Infinity;
    for (const [id, station] of Object.entries(stations)) {
      if (station.location) {
        const distance = haversineDistance(
          params.latitude,
          params.longitude,
          station.location.lat,
          station.location.lon
        );
        if (distance < minDistance) {
          minDistance = distance;
          nearStationId = id;
        }
      }
    }

    // Consider "near station" if within 100 meters
    nearStation = minDistance < 100;
    if (nearStation) {
      distanceToStation = Math.round(minDistance);
    }
  }

  // Use utility to detect context
  return detectContextUtil({
    nearStation,
    nearStationId,
    distanceToStation,
    tapHistory: params.tapHistory ?? [],
    currentScreen: params.currentScreen ?? "home",
    screenTime: params.screenTime ?? 0,
    recentActions: params.recentActions ?? [],
  });
}

/**
 * Calculate distance between two points using Haversine formula.
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Reset context service (for testing).
 */
export function resetContextService(): void {
  currentContext = { ...DEFAULT_CONTEXT };
  currentSettings = {
    enabled: true,
    showIndicator: true,
    useLocation: true,
    useTimePatterns: true,
    learnPatterns: true,
  };
}
