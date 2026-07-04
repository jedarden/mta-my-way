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
  ContextState,
  ContextTransition,
  FavoriteTapEvent,
  StationIndex,
} from "@mta-my-way/shared";
import {
  detectContext as detectContextUtil,
  getContextIcon,
  getContextLabel,
  getContextUIHints,
  shouldTriggerUIRefresh,
} from "@mta-my-way/shared";
import type Database from "better-sqlite3";
import {
  recordContextDetection,
  recordContextOverride,
  recordContextTransition as recordContextTransitionMetric,
} from "./middleware/metrics.js";
import { logger } from "./observability/logger.js";

// Database instance
let db: Database.Database | null = null;
let stations: StationIndex | null = null;

// Default owner ID for unauthenticated or legacy data
export const DEFAULT_OWNER_ID = "anonymous";

// Current context state (in-memory cache)
let currentContext: ContextState | null = null;
let currentSettings = {
  enabled: true,
  showIndicator: true,
  useLocation: true,
  useTimePatterns: true,
  learnPatterns: true,
};

// Default context state - exported for use in other modules
export const DEFAULT_CONTEXT: ContextState = {
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

interface DetectParams {
  nearStation: boolean;
  nearStationId?: string;
  distanceToStation?: number;
  tapHistory: FavoriteTapEvent[];
  currentScreen: string;
  screenTime: number;
  recentActions: string[];
  manualOverride?: ContextState["context"];
}

/**
 * Initialize context service.
 */
export function initContextService(database: Database.Database, stationData: StationIndex): void {
  db = database;
  stations = stationData;
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
        context: ContextState["context"];
        confidence: ContextState["confidence"];
        factors_json: string;
        detected_at: number;
        is_manual_override: number;
      }
    | undefined;

  if (row) {
    try {
      currentContext = {
        context: row.context,
        confidence: row.confidence,
        factors: JSON.parse(row.factors_json) as ContextState["factors"],
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
export function updateContextSettings(settings: Partial<typeof currentSettings>): void {
  currentSettings = { ...currentSettings, ...settings };
  logger.info("Context settings updated", { settings: currentSettings });
}

/**
 * Get current context settings.
 */
export function getContextSettings(): typeof currentSettings {
  return { ...currentSettings };
}

/**
 * Detect and update context based on provided factors.
 * Uses default owner ID for backward compatibility.
 */
export function detectAndUpdateContext(params: DetectParams): {
  context: ContextState;
  transition: ContextTransition | null;
} {
  return detectAndUpdateContextWithOwner(params, DEFAULT_OWNER_ID);
}

/**
 * Record a context transition in the database.
 */
function recordContextTransition(
  from: ContextState["context"],
  to: ContextState["context"],
  params: DetectParams
): ContextTransition {
  if (!db) {
    return { from, to, at: new Date().toISOString(), trigger: "manual" };
  }

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

  // Keep last 1000 transitions
  db.prepare(
    `DELETE FROM context_transitions
     WHERE id NOT IN (
       SELECT id FROM context_transitions
       ORDER BY triggered_at DESC
       LIMIT 1000
     )`
  ).run();

  return { from, to, at: new Date(now).toISOString(), trigger };
}

/**
 * Get recent context transitions.
 */
export function getContextTransitions(limit = 20): ContextTransition[] {
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT from_context, to_context, triggered_at, trigger
       FROM context_transitions
       ORDER BY triggered_at DESC
       LIMIT ?`
    )
    .all(limit) as {
    from_context: ContextState["context"];
    to_context: ContextState["context"];
    triggered_at: number;
    trigger: ContextTransition["trigger"];
  }[];

  return rows.map((row) => ({
    from: row.from_context,
    to: row.to_context,
    at: new Date(row.triggered_at).toISOString(),
    trigger: row.trigger,
  }));
}

/**
 * Get UI hints for the current context.
 */
export function getCurrentContextUIHints() {
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
export function setManualContext(context: ContextState["context"]): ContextState {
  const params: DetectParams = {
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
 * Uses default owner ID for backward compatibility.
 */
export function clearManualOverride(): ContextState {
  return clearManualOverrideForOwner(DEFAULT_OWNER_ID);
}

/**
 * Clear manual override for a specific owner and re-detect context.
 */
export function clearManualOverrideForOwner(ownerId = DEFAULT_OWNER_ID): ContextState {
  const params: DetectParams = {
    nearStation: currentContext?.factors.location.nearStation ?? false,
    nearStationId: currentContext?.factors.location.stationId,
    distanceToStation: currentContext?.factors.location.distance,
    tapHistory: [],
    currentScreen: currentContext?.factors.activity.currentScreen ?? "home",
    screenTime: currentContext?.factors.activity.screenTime ?? 0,
    recentActions: currentContext?.factors.activity.recentActions ?? [],
  };
  const result = detectAndUpdateContextWithOwner(params, ownerId);
  return result.context;
}

/**
 * Get context summary for API response.
 */
export function getContextSummary() {
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

  let nearStation = false;
  let nearStationId: string | undefined;
  let distanceToStation: number | undefined;

  if (params.latitude !== undefined && params.longitude !== undefined) {
    let minDistance = Infinity;
    for (const [id, station] of Object.entries(stations)) {
      const loc = (station as { location?: { lat: number; lon: number } }).location;
      if (loc) {
        const distance = haversineDistance(params.latitude, params.longitude, loc.lat, loc.lon);
        if (distance < minDistance) {
          minDistance = distance;
          nearStationId = id;
        }
      }
    }
    nearStation = minDistance < 100;
    if (nearStation) {
      distanceToStation = Math.round(minDistance);
    }
  }

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
  const R = 6371e3;
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
  db = null;
  stations = null;
  currentContext = { ...DEFAULT_CONTEXT };
  currentSettings = {
    enabled: true,
    showIndicator: true,
    useLocation: true,
    useTimePatterns: true,
    learnPatterns: true,
  };
}

// ============================================================================
// Resource Ownership Support
// ============================================================================

/**
 * Get the most recent context state for a specific owner.
 */
export function getContextByOwner(ownerId: string): ContextState | null {
  if (!db) return null;

  const row = db
    .prepare(
      `SELECT * FROM user_context
       WHERE owner_id = ?
       ORDER BY detected_at DESC
       LIMIT 1`
    )
    .get(ownerId) as
    | {
        context: ContextState["context"];
        confidence: ContextState["confidence"];
        factors_json: string;
        detected_at: number;
        is_manual_override: number;
      }
    | undefined;

  if (!row) return null;

  try {
    return {
      context: row.context,
      confidence: row.confidence,
      factors: JSON.parse(row.factors_json) as ContextState["factors"],
      detectedAt: new Date(row.detected_at).toISOString(),
      isManualOverride: row.is_manual_override === 1,
    };
  } catch (error) {
    logger.error("Failed to parse stored context", error instanceof Error ? error : undefined);
    return null;
  }
}

/**
 * Get context transitions for a specific owner with ownership check.
 */
export function getContextTransitionsForOwner(
  ownerId: string,
  requestingOwnerId: string,
  limit = 20
): ContextTransition[] | null {
  if (ownerId !== requestingOwnerId) {
    return null;
  }
  return getContextTransitionsByOwner(ownerId, limit);
}

/**
 * Check if a context state belongs to a specific owner.
 */
export function checkContextOwnership(contextId: string, ownerId: string): boolean {
  if (!db) return false;
  const row = db.prepare("SELECT owner_id FROM user_context WHERE id = ?").get(contextId) as
    | { owner_id: string }
    | undefined;
  return row?.owner_id === ownerId || row?.owner_id === DEFAULT_OWNER_ID;
}

/**
 * Get the owner ID of a context state.
 */
export function getContextOwner(contextId: string): string | undefined {
  if (!db) return undefined;
  const row = db.prepare("SELECT owner_id FROM user_context WHERE id = ?").get(contextId) as
    | { owner_id: string }
    | undefined;
  return row?.owner_id;
}

/**
 * Save context state to database with owner ID.
 */
function saveContextState(state: ContextState, ownerId = DEFAULT_OWNER_ID): void {
  if (!db) return;

  const id = crypto.randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO user_context (
      id, context, confidence, factors_json,
      detected_at, is_manual_override, created_at, updated_at, owner_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    state.context,
    state.confidence,
    JSON.stringify(state.factors),
    now,
    state.isManualOverride ? 1 : 0,
    now,
    now,
    ownerId
  );

  // Keep last 100 context states
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
 * Detect and update context based on provided factors with owner ID.
 */
export function detectAndUpdateContextWithOwner(
  params: DetectParams,
  ownerId = "anonymous"
): { context: ContextState; transition: ContextTransition | null } {
  const previousContext = currentContext?.context ?? "idle";

  const detected = detectContextUtil(params);

  recordContextDetection(detected.context, detected.confidence);

  const contextChanged = previousContext !== detected.context;

  saveContextState(detected, ownerId);

  let transition: ContextTransition | null = null;
  if (contextChanged) {
    transition = recordContextTransition(previousContext, detected.context, params);
    recordContextTransitionMetric(previousContext, detected.context);
  }

  if (params.manualOverride !== undefined) {
    recordContextOverride(params.manualOverride);
  }

  currentContext = detected;

  if (contextChanged && shouldTriggerUIRefresh(previousContext, detected.context)) {
    logger.info("Context transition", {
      from: previousContext,
      to: detected.context,
      confidence: detected.confidence,
      trigger: transition?.trigger,
      ownerId,
    });
  }

  return { context: detected, transition };
}

/**
 * Get context transitions for a specific owner.
 */
export function getContextTransitionsByOwner(ownerId: string, limit = 20): ContextTransition[] {
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT ct.from_context, ct.to_context, ct.triggered_at, ct.trigger
       FROM context_transitions ct
       JOIN user_context uc ON ct.triggered_at >= uc.detected_at
       WHERE uc.owner_id = ?
       ORDER BY ct.triggered_at DESC
       LIMIT ?`
    )
    .all(ownerId, limit) as {
    from_context: ContextState["context"];
    to_context: ContextState["context"];
    triggered_at: number;
    trigger: ContextTransition["trigger"];
  }[];

  return rows.map((row) => ({
    from: row.from_context,
    to: row.to_context,
    at: new Date(row.triggered_at).toISOString(),
    trigger: row.trigger,
  }));
}

/**
 * Delete context states for a specific owner.
 */
export function deleteContextsByOwner(ownerId: string): number {
  if (!db) return 0;
  const result = db.prepare("DELETE FROM user_context WHERE owner_id = ?").run(ownerId);
  logger.info("Contexts deleted for owner", { ownerId, count: result.changes });
  return result.changes;
}
