/**
 * Context-aware user state detection types
 */

/**
 * Primary user context states
 */
export type UserContext =
  | "commuting" // User is actively commuting (detected via location or time patterns)
  | "planning" // User is planning a future trip (browsing stations, checking schedules)
  | "reviewing" // User is reviewing past trips or commute history
  | "idle" // No specific activity detected
  | "at_station"; // User is at/near a station (geofence detected)

/**
 * Confidence level for context detection
 */
export type ContextConfidence = "low" | "medium" | "high";

/**
 * Context detection factors
 */
export interface ContextFactors {
  /** Location-based detection (geofence, GPS) */
  location: {
    /** Whether user is near a known station */
    nearStation: boolean;
    /** Station ID if near one */
    stationId?: string;
    /** Distance in meters */
    distance?: number;
  };
  /** Time-based detection (rush hours, commute patterns) */
  time: {
    /** Current time bucket */
    timeBucket: "early_morning" | "morning_rush" | "midday" | "evening_rush" | "night";
    /** Day category */
    dayCategory: "weekday" | "saturday" | "sunday";
    /** Whether in typical commute hours */
    isCommuteHours: boolean;
  };
  /** Pattern-based detection (tap history, usage patterns) */
  patterns: {
    /** Frequent stations at current time/day */
    frequentStations: string[];
    /** Tap frequency score (0-1) */
    tapFrequency: number;
    /** Whether user has established patterns */
    hasPatterns: boolean;
  };
  /** Activity-based detection (what user is doing in the app) */
  activity: {
    /** Current screen/route */
    currentScreen: string;
    /** Time spent on current screen (seconds) */
    screenTime: number;
    /** Recent actions */
    recentActions: string[];
  };
}

/**
 * Context state with metadata
 */
export interface ContextState {
  /** Current detected context */
  context: UserContext;
  /** Confidence in this detection */
  confidence: ContextConfidence;
  /** Factors that contributed to this detection */
  factors: ContextFactors;
  /** Timestamp of detection (ISO) */
  detectedAt: string;
  /** Whether context was manually overridden by user */
  isManualOverride: boolean;
}

/**
 * Context transition for tracking state changes
 */
export interface ContextTransition {
  /** Previous context */
  from: UserContext;
  /** New context */
  to: UserContext;
  /** Timestamp of transition (ISO) */
  at: string;
  /** What triggered the transition */
  trigger: "location" | "time" | "pattern" | "activity" | "manual";
}

/**
 * User preference for context-aware features
 */
export interface ContextSettings {
  /** Whether context-aware switching is enabled */
  enabled: boolean;
  /** Whether to show context indicator in UI */
  showIndicator: boolean;
  /** Manual context override (if set) */
  manualOverride?: UserContext;
  /** Whether to use location for context detection */
  useLocation: boolean;
  /** Whether to use time patterns for context detection */
  useTimePatterns: boolean;
  /** Whether to learn from usage patterns */
  learnPatterns: boolean;
}

/**
 * UI adaptation hints for each context
 */
export interface ContextUIHints {
  /** Preferred tab/screen for this context */
  preferredScreen: string;
  /** Whether to show commute shortcuts */
  showCommuteShortcuts: boolean;
  /** Whether to show recent/frequent stations */
  showFrequentStations: boolean;
  /** Whether to show trip history */
  showTripHistory: boolean;
  /** Data refresh priority (higher = more frequent) */
  refreshPriority: number;
  /** UI theme variant suggestion */
  themeVariant?: "subdued" | "normal" | "prominent";
}
