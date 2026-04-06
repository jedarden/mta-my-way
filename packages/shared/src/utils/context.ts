/**
 * Context-aware detection utilities
 * Analyzes location, time, and usage patterns to determine user context
 */

import type {
  ContextConfidence,
  ContextFactors,
  ContextState,
  ContextUIHints,
  FavoriteTapEvent,
  UserContext,
} from "../types/index.js";

import { getCurrentDayCategory, getCurrentTimeBucket } from "./patterns.js";
import { getCurrentDayOfWeek, getCurrentHour } from "./time.js";

/**
 * Default context state
 */
export const DEFAULT_CONTEXT_STATE: ContextState = {
  context: "idle",
  confidence: "low",
  factors: {
    location: { nearStation: false },
    time: {
      timeBucket: getCurrentTimeBucket(),
      dayCategory: getCurrentDayCategory(),
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
 * Check if current time is during typical commute hours
 */
function isCommuteHour(hour: number): boolean {
  // Morning rush: 6-10am, Evening rush: 3-7pm
  return (hour >= 6 && hour < 10) || (hour >= 15 && hour < 19);
}

/**
 * Get UI hints for a given context
 */
export function getContextUIHints(context: UserContext): ContextUIHints {
  const hints: Record<UserContext, ContextUIHints> = {
    commuting: {
      preferredScreen: "home",
      showCommuteShortcuts: true,
      showFrequentStations: true,
      showTripHistory: false,
      refreshPriority: 10, // Highest priority
      themeVariant: "prominent",
    },
    planning: {
      preferredScreen: "home",
      showCommuteShortcuts: true,
      showFrequentStations: true,
      showTripHistory: false,
      refreshPriority: 5,
      themeVariant: "normal",
    },
    reviewing: {
      preferredScreen: "journal",
      showCommuteShortcuts: false,
      showFrequentStations: false,
      showTripHistory: true,
      refreshPriority: 2,
      themeVariant: "subdued",
    },
    idle: {
      preferredScreen: "home",
      showCommuteShortcuts: false,
      showFrequentStations: true,
      showTripHistory: false,
      refreshPriority: 3,
      themeVariant: "normal",
    },
    at_station: {
      preferredScreen: "home",
      showCommuteShortcuts: true,
      showFrequentStations: true,
      showTripHistory: false,
      refreshPriority: 9, // Near real-time
      themeVariant: "prominent",
    },
  };
  return hints[context];
}

/**
 * Get context label for display
 */
export function getContextLabel(context: UserContext): string {
  const labels: Record<UserContext, string> = {
    commuting: "Commute",
    planning: "Planning",
    reviewing: "Reviewing",
    idle: "",
    at_station: "At Station",
  };
  return labels[context];
}

/**
 * Get context icon name
 */
export function getContextIcon(context: UserContext): string {
  const icons: Record<UserContext, string> = {
    commuting: "train",
    planning: "map",
    reviewing: "clock",
    idle: "",
    at_station: "location",
  };
  return icons[context];
}

/**
 * Calculate tap frequency score for a station at current time
 * Returns 0-1 score based on how often user taps this station at similar times
 */
export function calculateTapFrequency(
  favoriteId: string,
  tapHistory: FavoriteTapEvent[],
  timeWindowMinutes: number = 60
): number {
  if (tapHistory.length === 0) return 0;

  const currentDayOfWeek = getCurrentDayOfWeek();
  const currentHour = getCurrentHour();

  // Count taps within time window (±timeWindowMinutes) and same day type
  const hourWindow = Math.ceil(timeWindowMinutes / 60);
  let matchingTaps = 0;
  let totalTaps = 0;

  for (const tap of tapHistory) {
    totalTaps++;

    // Check if same day type (weekday vs weekend)
    const isTapWeekday = tap.dayOfWeek >= 1 && tap.dayOfWeek <= 5;
    const isCurrentWeekday = currentDayOfWeek >= 1 && currentDayOfWeek <= 5;

    if (isTapWeekday !== isCurrentWeekday) continue;

    // Check if within time window
    const hourDiff = Math.abs(tap.hour - currentHour);
    if (hourDiff <= hourWindow || hourDiff >= 24 - hourWindow) {
      if (tap.favoriteId === favoriteId) {
        matchingTaps++;
      }
    }
  }

  if (totalTaps === 0) return 0;

  // Return normalized frequency (0-1)
  return Math.min(matchingTaps / 10, 1); // Cap at 10 taps for max score
}

/**
 * Get frequently used stations at current time
 */
export function getFrequentStationsAtCurrentTime(
  tapHistory: FavoriteTapEvent[],
  minFrequency: number = 0.2
): string[] {
  const frequencies = new Map<string, number>();

  for (const tap of tapHistory) {
    const freq = calculateTapFrequency(tap.favoriteId, tapHistory);
    if (freq >= minFrequency) {
      frequencies.set(tap.favoriteId, Math.max(frequencies.get(tap.favoriteId) || 0, freq));
    }
  }

  // Sort by frequency and return station IDs
  return Array.from(frequencies.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/**
 * Calculate overall pattern confidence based on tap history
 */
export function calculatePatternConfidence(tapHistory: FavoriteTapEvent[]): {
  hasPatterns: boolean;
  confidence: number;
} {
  if (tapHistory.length < 10) {
    return { hasPatterns: false, confidence: 0 };
  }

  // Check for consistent patterns
  const stationDays = new Map<string, Set<number>>();
  const stationHours = new Map<string, Set<number>>();

  for (const tap of tapHistory) {
    if (!stationDays.has(tap.favoriteId)) {
      stationDays.set(tap.favoriteId, new Set());
      stationHours.set(tap.favoriteId, new Set());
    }
    stationDays.get(tap.favoriteId)!.add(tap.dayOfWeek);
    stationHours.get(tap.favoriteId)!.add(tap.hour);
  }

  // Check if any station has consistent day/time patterns
  let patternCount = 0;
  for (const [stationId, days] of stationDays) {
    const hours = stationHours.get(stationId)!;
    // A station has a pattern if it's tapped on similar days/hours
    if (days.size <= 3 && hours.size <= 6) {
      patternCount++;
    }
  }

  const confidence = Math.min(patternCount / Math.max(stationDays.size, 1), 1);
  return { hasPatterns: patternCount > 0, confidence };
}

/**
 * Detect user context based on all available factors
 */
export function detectContext(params: {
  /** Whether user is near a station */
  nearStation: boolean;
  /** Station ID if near one */
  nearStationId?: string;
  /** Distance to station in meters */
  distanceToStation?: number;
  /** Tap history for pattern analysis */
  tapHistory: FavoriteTapEvent[];
  /** Current screen user is viewing */
  currentScreen: string;
  /** Time spent on current screen in seconds */
  screenTime: number;
  /** Recent user actions (route names, button clicks, etc.) */
  recentActions: string[];
  /** Manual override if set */
  manualOverride?: UserContext;
}): ContextState {
  const {
    nearStation,
    nearStationId,
    distanceToStation,
    tapHistory,
    currentScreen,
    screenTime,
    recentActions,
    manualOverride,
  } = params;

  const currentHour = getCurrentHour();
  const timeBucket = getCurrentTimeBucket();
  const dayCategory = getCurrentDayCategory();
  const isCommuteHours = isCommuteHour(currentHour);

  // If manual override is set, use it
  if (manualOverride) {
    return {
      context: manualOverride,
      confidence: "high",
      factors: {
        location: {
          nearStation,
          stationId: nearStationId,
          distance: distanceToStation,
        },
        time: { timeBucket, dayCategory, isCommuteHours },
        patterns: {
          frequentStations: getFrequentStationsAtCurrentTime(tapHistory),
          tapFrequency: calculateTapFrequency(nearStationId || "", tapHistory),
          hasPatterns: calculatePatternConfidence(tapHistory).hasPatterns,
        },
        activity: {
          currentScreen,
          screenTime,
          recentActions,
        },
      },
      detectedAt: new Date().toISOString(),
      isManualOverride: true,
    };
  }

  // Detect context based on factors
  let detectedContext: UserContext = "idle";
  let confidence: ContextConfidence = "low";
  const factors: ContextFactors = {
    location: {
      nearStation,
      stationId: nearStationId,
      distance: distanceToStation,
    },
    time: { timeBucket, dayCategory, isCommuteHours },
    patterns: {
      frequentStations: getFrequentStationsAtCurrentTime(tapHistory),
      tapFrequency: calculateTapFrequency(nearStationId || "", tapHistory),
      hasPatterns: calculatePatternConfidence(tapHistory).hasPatterns,
    },
    activity: {
      currentScreen,
      screenTime,
      recentActions,
    },
  };

  // Priority 1: At station (geofence detection) - high confidence
  if (nearStation && nearStationId) {
    detectedContext = "at_station";
    confidence = "high";

    // If in commute hours and has patterns, upgrade to "commuting"
    if (isCommuteHours && factors.patterns.tapFrequency > 0.3) {
      detectedContext = "commuting";
    }
  }
  // Priority 2: Commuting - detected via time + patterns
  else if (isCommuteHours && factors.patterns.hasPatterns && factors.patterns.tapFrequency > 0.2) {
    detectedContext = "commuting";
    confidence = factors.patterns.tapFrequency > 0.5 ? "high" : "medium";
  }
  // Priority 3: Reviewing - detected via activity patterns
  else if (
    currentScreen === "journal" ||
    (currentScreen === "home" && recentActions.includes("view_history"))
  ) {
    detectedContext = "reviewing";
    confidence = screenTime > 10 ? "high" : "medium";
  }
  // Priority 4: Planning - detected via browsing behavior
  else if (
    currentScreen === "explore" ||
    recentActions.includes("search_station") ||
    recentActions.includes("view_commute")
  ) {
    detectedContext = "planning";
    confidence = screenTime > 5 ? "medium" : "low";
  }
  // Default: idle
  else {
    detectedContext = "idle";
    confidence = "low";
  }

  return {
    context: detectedContext,
    confidence,
    factors,
    detectedAt: new Date().toISOString(),
    isManualOverride: false,
  };
}

/**
 * Check if a context transition should trigger a UI refresh
 */
export function shouldTriggerUIRefresh(from: UserContext, to: UserContext): boolean {
  // Transitions that should trigger immediate UI refresh
  const significantTransitions: Array<[UserContext, UserContext]> = [
    ["idle", "commuting"],
    ["idle", "at_station"],
    ["idle", "planning"],
    ["commuting", "at_station"],
    ["at_station", "commuting"],
    ["reviewing", "commuting"],
    ["reviewing", "planning"],
  ];

  return significantTransitions.some(
    ([f, t]) => (f === from && t === to) || (f === to && t === from)
  );
}
