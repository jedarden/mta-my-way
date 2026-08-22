/**
 * Keeps locally persisted favorites, commutes, and settings in sync with an
 * optional OAuth account. Local-only use remains fully supported: no request
 * is made until the browser has a valid session cookie.
 */

import type { Commute, Favorite, UserPreferences } from "@mta-my-way/shared";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFavoritesStore } from "../stores/favoritesStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePreferencesSyncStore } from "../stores/syncStore";
import { useAuth } from "./useAuth";

const PENDING_SYNC_KEY = "mta-pending-preferences-sync";
const RETRY_DELAY_MS = 15_000;

type PreferencesSnapshot = UserPreferences;

interface QueuedPreferences {
  snapshot: PreferencesSnapshot;
  queuedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPreferencesSnapshot(value: unknown): value is PreferencesSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.favorites) &&
    Array.isArray(value.commutes) &&
    isRecord(value.settings) &&
    Array.isArray(value.tapHistory) &&
    typeof value.onboardingComplete === "boolean"
  );
}

function serialize(snapshot: PreferencesSnapshot): string {
  return JSON.stringify(snapshot);
}

function readQueuedPreferences(): QueuedPreferences | null {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return null;

    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isPreferencesSnapshot(value.snapshot)) return null;
    return { snapshot: value.snapshot, queuedAt: Number(value.queuedAt) || Date.now() };
  } catch {
    return null;
  }
}

function queuePreferences(snapshot: PreferencesSnapshot): void {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify({ snapshot, queuedAt: Date.now() }));
  } catch {
    // The current stores are already persisted locally. A full localStorage
    // quota must not turn a sync failure into a data-loss path.
  }
}

function clearQueuedPreferences(): void {
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch {
    // Storage can be unavailable in a private browser session.
  }
}

function snapshotFromStores(
  pushSubscription: Record<string, unknown> | null = null
): PreferencesSnapshot {
  const favorites = useFavoritesStore.getState();
  const settings = useSettingsStore.getState();

  return {
    favorites: favorites.favorites,
    commutes: favorites.commutes,
    tapHistory: favorites.tapHistory,
    onboardingComplete: favorites.onboardingComplete,
    settings: {
      theme: settings.theme,
      showUnassignedTrips: settings.showUnassignedTrips,
      refreshInterval: settings.refreshInterval,
      alertSeverityFilter: settings.alertSeverityFilter,
      hapticFeedback: settings.hapticFeedback,
      accessibleMode: settings.accessibleMode,
      quietHours: settings.quietHours,
    },
    pushSubscription,
    schemaVersion: 1,
  };
}

/** Keep unmatched local entries and let the server win when identifiers match. */
function mergeById<T extends { id: string }>(server: T[], local: T[]): T[] {
  const serverIds = new Set(server.map((item) => item.id));
  return [...server, ...local.filter((item) => !serverIds.has(item.id))];
}

/**
 * Merge a fetched server snapshot with current local data. The server owns
 * conflicting favorites, commutes, settings, and onboarding state; local-only
 * favorites and commutes are retained so a first sign-in can upload them.
 */
export function mergeServerPreferences(
  server: PreferencesSnapshot,
  local: PreferencesSnapshot
): PreferencesSnapshot {
  return {
    ...server,
    favorites: mergeById<Favorite>(server.favorites, local.favorites).map((favorite, index) => ({
      ...favorite,
      sortOrder: index,
    })),
    commutes: mergeById<Commute>(server.commutes, local.commutes),
    settings: server.settings,
    tapHistory: server.tapHistory,
    onboardingComplete: server.onboardingComplete,
  };
}

function applySnapshot(snapshot: PreferencesSnapshot): void {
  useFavoritesStore.getState().replaceFromSync({
    favorites: snapshot.favorites,
    commutes: snapshot.commutes,
    tapHistory: snapshot.tapHistory,
    onboardingComplete: snapshot.onboardingComplete,
  });
  useSettingsStore.getState().replaceFromSync(snapshot.settings);
}

/**
 * Remove all local preferences after the user explicitly opts out. This does
 * not delete the server copy; it first accompanies a successful sign-out.
 */
export function clearLocalPreferences(): void {
  useFavoritesStore.getState().clearLocalData();
  useSettingsStore.getState().clearLocalData();
  clearQueuedPreferences();
}

/** Synchronize preferences for the whole app. Mount exactly once in AppRoutes. */
export function usePreferencesSync() {
  const { auth, refreshAuth } = useAuth();
  const favorites = useFavoritesStore((state) => state.favorites);
  const commutes = useFavoritesStore((state) => state.commutes);
  const tapHistory = useFavoritesStore((state) => state.tapHistory);
  const onboardingComplete = useFavoritesStore((state) => state.onboardingComplete);
  const theme = useSettingsStore((state) => state.theme);
  const showUnassignedTrips = useSettingsStore((state) => state.showUnassignedTrips);
  const refreshInterval = useSettingsStore((state) => state.refreshInterval);
  const alertSeverityFilter = useSettingsStore((state) => state.alertSeverityFilter);
  const hapticFeedback = useSettingsStore((state) => state.hapticFeedback);
  const accessibleMode = useSettingsStore((state) => state.accessibleMode);
  const quietHours = useSettingsStore((state) => state.quietHours);

  const manualSyncRequest = usePreferencesSyncStore((state) => state.manualSyncRequest);
  const remoteLoadRequest = usePreferencesSyncStore((state) => state.remoteLoadRequest);
  const readyVersion = usePreferencesSyncStore((state) => state.readyVersion);
  const hasPendingChanges = usePreferencesSyncStore((state) => state.hasPendingChanges);
  const setSyncing = usePreferencesSyncStore((state) => state.setSyncing);
  const setSynced = usePreferencesSyncStore((state) => state.setSynced);
  const setError = usePreferencesSyncStore((state) => state.setError);
  const setNotSignedIn = usePreferencesSyncStore((state) => state.setNotSignedIn);
  const markReady = usePreferencesSyncStore((state) => state.markReady);
  const setPending = usePreferencesSyncStore((state) => state.setPending);
  const requestSync = usePreferencesSyncStore((state) => state.requestSync);
  const requestRemoteLoad = usePreferencesSyncStore((state) => state.requestRemoteLoad);

  const loadedUserRef = useRef<string | null>(null);
  const lastSyncedSnapshotRef = useRef<string | null>(null);
  const pushSubscriptionRef = useRef<Record<string, unknown> | null>(null);
  const syncInFlightRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousManualRequestRef = useRef(0);

  const userKey = auth.profile?.userId ?? "current-session";
  const localSignature = useMemo(
    () =>
      JSON.stringify({
        favorites,
        commutes,
        tapHistory,
        onboardingComplete,
        theme,
        showUnassignedTrips,
        refreshInterval,
        alertSeverityFilter,
        hapticFeedback,
        accessibleMode,
        quietHours,
      }),
    [
      accessibleMode,
      alertSeverityFilter,
      commutes,
      favorites,
      hapticFeedback,
      onboardingComplete,
      quietHours,
      refreshInterval,
      showUnassignedTrips,
      tapHistory,
      theme,
    ]
  );

  const scheduleRetry = useCallback(
    (reloadRemoteSnapshot = false) => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(
        () => (reloadRemoteSnapshot ? requestRemoteLoad() : requestSync()),
        RETRY_DELAY_MS
      );
    },
    [requestRemoteLoad, requestSync]
  );

  const persistSnapshot = useCallback(
    async (snapshot: PreferencesSnapshot) => {
      if (syncInFlightRef.current) {
        queuePreferences(snapshot);
        setPending();
        return;
      }

      const signature = serialize(snapshot);
      syncInFlightRef.current = true;
      setSyncing();

      try {
        const response = await fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: signature,
        });
        if (!response.ok) {
          throw new Error(`Preferences update failed (${response.status})`);
        }

        lastSyncedSnapshotRef.current = signature;
        const queued = readQueuedPreferences();
        if (!queued || serialize(queued.snapshot) === signature) {
          clearQueuedPreferences();
          setSynced();
        } else {
          setPending();
          scheduleRetry();
        }
      } catch {
        queuePreferences(snapshot);
        setError(
          "Your changes are saved on this device and will sync when the connection is restored.",
          true
        );
        scheduleRetry();
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [scheduleRetry, setError, setPending, setSynced, setSyncing]
  );

  // Check the HttpOnly session cookie once when the app starts (and after an
  // OAuth callback reloads the application).
  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  // Fetch the remote snapshot after a successful sign-in. The server is used
  // for conflicts, while local-only favorites/commutes are retained and then
  // uploaded by the mutation effect below.
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.authenticated) {
      loadedUserRef.current = null;
      lastSyncedSnapshotRef.current = null;
      setNotSignedIn();
      return;
    }

    let cancelled = false;
    loadedUserRef.current = null;
    setSyncing();

    void (async () => {
      try {
        const response = await fetch("/api/preferences");
        if (!response.ok) {
          throw new Error(`Preferences load failed (${response.status})`);
        }

        const serverData: unknown = await response.json();
        if (!isPreferencesSnapshot(serverData)) {
          throw new Error("Preferences load returned an invalid snapshot");
        }
        if (cancelled) return;

        pushSubscriptionRef.current = serverData.pushSubscription;
        const merged = mergeServerPreferences(
          serverData,
          snapshotFromStores(pushSubscriptionRef.current)
        );
        lastSyncedSnapshotRef.current = serialize(serverData);
        clearQueuedPreferences();
        applySnapshot(merged);
        loadedUserRef.current = userKey;
        markReady();
        setSynced();
      } catch {
        if (cancelled) return;
        setError(
          "Preferences could not be loaded. Your data remains available on this device.",
          false
        );
        scheduleRetry(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    auth.authenticated,
    auth.loading,
    markReady,
    setError,
    setNotSignedIn,
    scheduleRetry,
    setSynced,
    setSyncing,
    remoteLoadRequest,
    userKey,
  ]);

  // Persist a change after the initial remote merge. This is mounted at the
  // application level, so edits made from Favorites or Commute screens sync
  // even when Settings has never been opened.
  useEffect(() => {
    if (!auth.authenticated || loadedUserRef.current !== userKey) return;

    const snapshot = snapshotFromStores(pushSubscriptionRef.current);
    if (serialize(snapshot) === lastSyncedSnapshotRef.current) return;

    const timeout = setTimeout(() => {
      void persistSnapshot(snapshot);
    }, 750);
    return () => clearTimeout(timeout);
  }, [auth.authenticated, localSignature, persistSnapshot, readyVersion, userKey]);

  // A manual retry is used by the Settings button, the retry timer, and the
  // browser's online event. It reuses the latest local data, not a stale body.
  useEffect(() => {
    if (manualSyncRequest === 0 || manualSyncRequest === previousManualRequestRef.current) return;
    previousManualRequestRef.current = manualSyncRequest;
    if (!auth.authenticated || loadedUserRef.current !== userKey) return;
    void persistSnapshot(snapshotFromStores(pushSubscriptionRef.current));
  }, [auth.authenticated, manualSyncRequest, persistSnapshot, userKey]);

  useEffect(() => {
    const retryWhenOnline = () => {
      if (!auth.authenticated) return;
      if (loadedUserRef.current === userKey) requestSync();
      else requestRemoteLoad();
    };

    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [auth.authenticated, requestRemoteLoad, requestSync, userKey]);

  useEffect(() => {
    if (!hasPendingChanges || !auth.authenticated || loadedUserRef.current !== userKey) return;
    scheduleRetry();
  }, [auth.authenticated, hasPendingChanges, scheduleRetry, userKey]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return { requestSync };
}
