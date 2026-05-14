/**
 * useContextAware — Context-aware UI adaptation hook.
 *
 * Detects user context (commuting, planning, reviewing, at_station, idle) by
 * combining:
 *   - Geofence events (user near a station)
 *   - Screen time and navigation history
 *   - Tap history (bridged from favoritesStore)
 *
 * Re-detects every 30 seconds and on significant input changes. Fires a
 * "mta:context-changed" window event on transitions that warrant a data refresh,
 * so sibling components can react without prop drilling.
 *
 * useRecordAction() is a lightweight companion that lets any component log a
 * user action (e.g. "search_station") into the detection signal.
 */

import type { ContextSettings, ContextUIHints, UserContext } from "@mta-my-way/shared";
import { getContextLabel, getContextUIHints, shouldTriggerUIRefresh } from "@mta-my-way/shared";
import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { initializeTapHistoryBridge, useContextStore } from "../stores/contextStore";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useGeofence } from "./useGeofence";

export interface UseContextAwareReturn {
  context: UserContext;
  confidence: "low" | "medium" | "high";
  contextLabel: string;
  uiHints: ContextUIHints;
  enabled: boolean;
  showIndicator: boolean;
  manualOverride: UserContext | undefined;
  setManualOverride: (context: UserContext | undefined) => void;
  setSettings: (settings: Partial<ContextSettings>) => void;
}

export function useContextAware(): UseContextAwareReturn {
  const location = useLocation();
  const tapHistory = useFavoritesStore((s) => s.tapHistory);

  const updateContext = useContextStore((s) => s.updateContext);
  const currentContext = useContextStore((s) => s.currentContext);
  const settings = useContextStore((s) => s.settings);
  const setSettings = useContextStore((s) => s.setSettings);
  const setManualOverride = useContextStore((s) => s.setManualOverride);

  // Track screen time for activity detection
  const screenTimeTracker = useRef({ screen: location.pathname, startTime: Date.now() });

  // Track recent actions for activity detection
  const recentActions = useRef<string[]>([]);

  // Keep tap history bridge in sync
  useEffect(() => {
    initializeTapHistoryBridge(tapHistory);
  }, [tapHistory]);

  // Geofence for location-based context detection
  const { lastEvent: geofenceEvent } = useGeofence({
    enabled: settings.enabled && settings.useLocation,
    radius: 200,
  });

  const detectAndUpdateContext = useCallback(() => {
    if (!settings.enabled) return;

    const now = Date.now();
    const currentScreen = location.pathname;

    let screenTime = 0;
    if (screenTimeTracker.current.screen === currentScreen) {
      screenTime = (now - screenTimeTracker.current.startTime) / 1000;
    } else {
      screenTimeTracker.current = { screen: currentScreen, startTime: now };
    }

    const nearStation = geofenceEvent !== null;
    const nearStationId = geofenceEvent?.stationId;
    const distanceToStation = geofenceEvent?.distanceM;
    const screenName = currentScreen.split("/")[1] || "home";

    updateContext({
      nearStation,
      nearStationId,
      distanceToStation,
      currentScreen: screenName,
      screenTime,
      recentActions: recentActions.current.slice(-5),
    });
  }, [settings.enabled, geofenceEvent, location.pathname, updateContext]);

  // Re-detect every 30 seconds or when key inputs change
  useEffect(() => {
    detectAndUpdateContext();
    const interval = setInterval(detectAndUpdateContext, 30_000);
    return () => clearInterval(interval);
  }, [detectAndUpdateContext]);

  // Fire mta:context-changed on significant transitions
  const previousContext = useRef(currentContext.context);
  useEffect(() => {
    if (previousContext.current !== currentContext.context) {
      if (shouldTriggerUIRefresh(previousContext.current, currentContext.context)) {
        window.dispatchEvent(
          new CustomEvent("mta:context-changed", {
            detail: { from: previousContext.current, to: currentContext.context },
          })
        );
      }
      previousContext.current = currentContext.context;
    }
  }, [currentContext.context]);

  // Expose action recording globally for components to use
  const recordAction = useCallback((action: string) => {
    recentActions.current.push(action);
    if (recentActions.current.length > 10) {
      recentActions.current.shift();
    }
  }, []);

  useEffect(() => {
    window.__mta_record_action = recordAction;
  }, [recordAction]);

  return {
    context: currentContext.context,
    confidence: currentContext.confidence,
    contextLabel: getContextLabel(currentContext.context),
    uiHints: getContextUIHints(currentContext.context),
    enabled: settings.enabled,
    showIndicator: settings.showIndicator,
    manualOverride: settings.manualOverride,
    setManualOverride: (ctx) => setManualOverride(ctx),
    setSettings,
  };
}

/**
 * Hook to record user actions for activity-based context detection.
 * Call from any component to log meaningful interactions like
 * "search_station", "view_history", "view_commute".
 */
export function useRecordAction(): (action: string) => void {
  return useCallback((action: string) => {
    window.__mta_record_action?.(action);
  }, []);
}
