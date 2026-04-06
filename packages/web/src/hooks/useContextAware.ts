/**
 * useContextAware — hook for context-aware switching based on user state
 *
 * Detects user's current context (commuting, planning, reviewing, at_station, idle)
 * by analyzing:
 * - Location (geofence detection near stations)
 * - Time patterns (rush hours, commute times)
 * - Usage patterns (tap history, frequent stations)
 * - Activity (current screen, recent actions)
 *
 * Returns:
 * - Current context state with confidence level
 * - UI hints for adapting the interface
 * - Settings for controlling context detection behavior
 */

import { getContextLabel, getContextUIHints, shouldTriggerUIRefresh } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useContextStore } from "../stores/contextStore";
import { initializeTapHistoryBridge } from "../stores/contextStore";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useGeofence } from "./useGeofence";

/** Global window interface for action recording */
declare global {
  interface Window {
    __mta_record_action?: (action: string) => void;
  }
}

export interface UseContextAwareReturn {
  /** Current detected context */
  context: ReturnType<typeof useContextStore>["currentState"]["currentContext"]["context"];
  /** Confidence level (low, medium, high) */
  confidence: ReturnType<typeof useContextStore>["currentState"]["currentContext"]["confidence"];
  /** Human-readable context label */
  contextLabel: string;
  /** Context-specific UI hints */
  uiHints: ReturnType<typeof getContextUIHints>;
  /** Whether context detection is enabled */
  enabled: boolean;
  /** Whether to show context indicator in UI */
  showIndicator: boolean;
  /** Manually override context (undefined = auto) */
  manualOverride: string | undefined;
  /** Set manual context override */
  setManualOverride: (context: string | undefined) => void;
  /** Update context settings */
  setSettings: (settings: {
    enabled?: boolean;
    showIndicator?: boolean;
    useLocation?: boolean;
    useTimePatterns?: boolean;
    learnPatterns?: boolean;
  }) => void;
}

/** Screen time tracking for activity detection */
interface ScreenTimeTracker {
  screen: string;
  startTime: number;
}

/**
 * Hook for context-aware UI adaptation
 */
export function useContextAware(): UseContextAwareReturn {
  const location = useLocation();
  const { tapHistory } = useFavoritesStore();
  const updateContext = useContextStore((s) => s.updateContext);
  const currentContext = useContextStore((s) => s.currentContext);
  const settings = useContextStore((s) => s.settings);
  const setSettings = useContextStore((s) => s.setSettings);
  const setManualOverride = useContextStore((s) => s.setManualOverride);

  // Track screen time for activity detection
  const screenTimeTracker = useRef<ScreenTimeTracker>({
    screen: location.pathname,
    startTime: Date.now(),
  });

  // Track recent actions for activity detection
  const recentActions = useRef<string[]>([]);

  // Initialize tap history bridge
  useEffect(() => {
    initializeTapHistoryBridge(tapHistory);
  }, [tapHistory]);

  // Geofence for location-based context detection
  const { lastEvent: geofenceEvent } = useGeofence({
    enabled: settings.enabled && settings.useLocation,
    radius: 200, // 200m geofence radius
  });

  // Detect context changes
  const detectAndUpdateContext = useCallback(() => {
    if (!settings.enabled) return;

    const now = Date.now();
    const currentScreen = location.pathname;

    // Calculate screen time
    let screenTime = 0;
    if (screenTimeTracker.current.screen === currentScreen) {
      screenTime = (now - screenTimeTracker.current.startTime) / 1000;
    } else {
      // Screen changed - reset tracker
      screenTimeTracker.current = {
        screen: currentScreen,
        startTime: now,
      };
    }

    // Determine if near station from geofence
    const nearStation = geofenceEvent !== null;
    const nearStationId = geofenceEvent?.stationId;
    const distanceToStation = geofenceEvent?.distanceM;

    // Extract screen name from path
    const screenName = currentScreen.split("/")[1] || "home";

    updateContext({
      nearStation,
      nearStationId,
      distanceToStation,
      currentScreen: screenName,
      screenTime,
      recentActions: recentActions.current.slice(-5), // Keep last 5 actions
    });
  }, [settings.enabled, settings.useLocation, geofenceEvent, location.pathname, updateContext]);

  // Update context periodically
  useEffect(() => {
    detectAndUpdateContext();

    // Re-detect every 30 seconds or when significant factors change
    const interval = setInterval(detectAndUpdateContext, 30000);

    return () => clearInterval(interval);
  }, [detectAndUpdateContext]);

  // Detect context transitions that should trigger UI refresh
  const previousContext = useRef(currentContext.context);
  useEffect(() => {
    if (previousContext.current !== currentContext.context) {
      const shouldRefresh = shouldTriggerUIRefresh(previousContext.current, currentContext.context);

      if (shouldRefresh) {
        // Trigger a data refresh by dispatching custom event
        window.dispatchEvent(
          new CustomEvent("mta:context-changed", {
            detail: {
              from: previousContext.current,
              to: currentContext.context,
            },
          })
        );
      }

      previousContext.current = currentContext.context;
    }
  }, [currentContext.context]);

  // Record user actions for activity detection
  const recordAction = useCallback((action: string) => {
    recentActions.current.push(action);
    // Keep only last 10 actions
    if (recentActions.current.length > 10) {
      recentActions.current.shift();
    }
  }, []);

  // Expose action recording globally for components to use
  useEffect(() => {
    window.__mta_record_action = recordAction;
  }, [recordAction]);

  const uiHints = getContextUIHints(currentContext.context);

  return {
    context: currentContext.context,
    confidence: currentContext.confidence,
    contextLabel: getContextLabel(currentContext.context),
    uiHints,
    enabled: settings.enabled,
    showIndicator: settings.showIndicator,
    manualOverride: settings.manualOverride,
    setManualOverride: (ctx) => setManualOverride(ctx),
    setSettings,
  };
}

/**
 * Hook to record user actions for activity detection
 * Components can use this to record meaningful actions like "search_station", "view_history", etc.
 */
export function useRecordAction() {
  return useCallback((action: string) => {
    window.__mta_record_action?.(action);
  }, []);
}
