import { useState } from "react";
import Screen from "../components/layout/Screen";
import { useAuth } from "../hooks/useAuth";
import { clearLocalPreferences } from "../hooks/usePreferencesSync";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useSettingsStore } from "../stores/settingsStore";
import { usePreferencesSyncStore } from "../stores/syncStore";

function formatLastSynced(timestamp: number | null): string {
  if (!timestamp) return "Not yet synced";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export default function SettingsScreen() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const showUnassignedTrips = useSettingsStore((s) => s.showUnassignedTrips);
  const setShowUnassignedTrips = useSettingsStore((s) => s.setShowUnassignedTrips);
  const refreshInterval = useSettingsStore((s) => s.refreshInterval);
  const setRefreshInterval = useSettingsStore((s) => s.setRefreshInterval);
  const quietHours = useSettingsStore((s) => s.quietHours);
  const setQuietHours = useSettingsStore((s) => s.setQuietHours);
  const accessibleMode = useSettingsStore((s) => s.accessibleMode);
  const setAccessibleMode = useSettingsStore((s) => s.setAccessibleMode);

  const { auth, signOut } = useAuth();
  const syncStatus = usePreferencesSyncStore((state) => state.status);
  const lastSyncedAt = usePreferencesSyncStore((state) => state.lastSyncedAt);
  const hasPendingChanges = usePreferencesSyncStore((state) => state.hasPendingChanges);
  const requestSync = usePreferencesSyncStore((state) => state.requestSync);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const handleSignOut = async () => {
    const didSignOut = await signOut();
    if (!didSignOut) {
      setAccountError("We couldn't sign you out right now. Please try again.");
      return;
    }
    setAccountError(null);
  };

  const handleDeleteLocalData = async () => {
    const didSignOut = await signOut();
    if (!didSignOut) {
      setAccountError("We couldn't sign you out, so your local data was left unchanged.");
      return;
    }

    clearLocalPreferences();
    setAccountError(null);
    setConfirmDelete(false);
  };

  const {
    isSupported,
    isOldIOS,
    permission,
    isSubscribed,
    isLoading,
    error: pushError,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  function handlePushToggle() {
    if (isSubscribed) {
      void unsubscribe();
    } else {
      void subscribe();
    }
  }

  function renderPushSection() {
    if (isOldIOS) {
      return (
        <div className="p-4 text-13 text-text-secondary dark:text-dark-text-secondary">
          Push notifications require iOS 16.4 or later with the app added to your Home Screen.
        </div>
      );
    }

    if (!isSupported) {
      return (
        <div className="p-4 text-13 text-text-secondary dark:text-dark-text-secondary">
          Push notifications are not supported in this browser.
        </div>
      );
    }

    if (permission === "denied") {
      return (
        <div className="p-4 text-13 text-text-secondary dark:text-dark-text-secondary">
          Notifications are blocked. Enable them in your browser or OS settings.
        </div>
      );
    }

    return (
      <>
        <div className="p-4 border-b border-background dark:border-dark-background">
          <fieldset className="border-0 p-0 m-0">
            <legend className="text-base font-medium text-text-primary dark:text-dark-text-primary mb-2">
              Push notifications
            </legend>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-13 text-text-secondary dark:text-dark-text-secondary mt-0.5">
                  {isSubscribed
                    ? "Alert notifications are active for your favorite lines"
                    : "Get notified about service alerts on your favorite lines"}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isSubscribed}
                disabled={isLoading}
                onClick={handlePushToggle}
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  "focus-visible:outline-mta-primary disabled:opacity-50 disabled:cursor-not-allowed",
                  isSubscribed ? "bg-mta-primary" : "bg-gray-300 dark:bg-gray-600",
                ].join(" ")}
                aria-label={
                  isSubscribed ? "Disable push notifications" : "Enable push notifications"
                }
              >
                <span
                  className={[
                    "inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow-sm transition-transform",
                    isSubscribed ? "translate-x-5.5" : "translate-x-0.5",
                  ].join(" ")}
                  aria-hidden="true"
                />
              </button>
            </div>
          </fieldset>
        </div>

        {isSubscribed && (
          <div className="p-4 border-b border-background dark:border-dark-background">
            <fieldset className="border-0 p-0 m-0">
              <legend className="flex items-center justify-between w-full mb-3">
                <span className="text-text-primary dark:text-dark-text-primary font-medium">
                  Quiet hours
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={quietHours.enabled}
                  onClick={() => setQuietHours({ ...quietHours, enabled: !quietHours.enabled })}
                  className={[
                    "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                    "focus-visible:outline-mta-primary",
                    quietHours.enabled ? "bg-mta-primary" : "bg-gray-300 dark:bg-gray-600",
                  ].join(" ")}
                  aria-label={quietHours.enabled ? "Disable quiet hours" : "Enable quiet hours"}
                >
                  <span
                    className={[
                      "inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow-sm transition-transform",
                      quietHours.enabled ? "translate-x-5.5" : "translate-x-0.5",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                </button>
              </legend>
              {quietHours.enabled && (
                <div className="flex gap-4">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="quiet-hours-start"
                      className="text-13 text-text-secondary dark:text-dark-text-secondary"
                    >
                      From
                    </label>
                    <select
                      id="quiet-hours-start"
                      value={quietHours.startHour}
                      onChange={(e) =>
                        setQuietHours({ ...quietHours, startHour: Number(e.target.value) })
                      }
                      className="bg-background dark:bg-dark-background text-text-primary dark:text-dark-text-primary rounded px-2 py-1 min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
                      aria-label="Quiet hours start time"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="quiet-hours-end"
                      className="text-13 text-text-secondary dark:text-dark-text-secondary"
                    >
                      To
                    </label>
                    <select
                      id="quiet-hours-end"
                      value={quietHours.endHour}
                      onChange={(e) =>
                        setQuietHours({ ...quietHours, endHour: Number(e.target.value) })
                      }
                      className="bg-background dark:bg-dark-background text-text-primary dark:text-dark-text-primary rounded px-2 py-1 min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
                      aria-label="Quiet hours end time"
                    >
                      {Array.from({ length: 24 }, (_, i) => (
                        <option key={i} value={i}>
                          {String(i).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </fieldset>
          </div>
        )}

        {pushError && (
          <div
            className="px-4 py-3 text-13 text-red-600 dark:text-red-400"
            role="alert"
            aria-live="polite"
          >
            {pushError}
          </div>
        )}
      </>
    );
  }

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        <section aria-labelledby="sync-heading" className="mb-6">
          <h2
            id="sync-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Sync
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg">
            <div className="p-4 border-b border-background dark:border-dark-background">
              {auth.loading ? (
                <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
                  Checking sync status…
                </p>
              ) : auth.authenticated ? (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary dark:text-dark-text-primary">
                        {auth.profile?.name || auth.profile?.email || "Signed in"}
                      </p>
                      <p className="text-13 text-text-secondary dark:text-dark-text-secondary mt-0.5">
                        {syncStatus === "syncing"
                          ? "Syncing your preferences…"
                          : hasPendingChanges
                            ? "Changes are waiting to sync"
                            : "Sync is active"}
                      </p>
                    </div>
                    <span
                      className="rounded-full bg-green-100 px-2 py-1 text-12 font-medium text-green-800 dark:bg-green-900/50 dark:text-green-200"
                      aria-label="Signed in and syncing"
                    >
                      Signed in
                    </span>
                  </div>
                  <p className="mt-3 text-13 text-text-secondary dark:text-dark-text-secondary">
                    Last synced:{" "}
                    <time
                      dateTime={lastSyncedAt ? new Date(lastSyncedAt).toISOString() : undefined}
                    >
                      {formatLastSynced(lastSyncedAt)}
                    </time>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={requestSync}
                      disabled={syncStatus === "syncing"}
                      className="text-13 font-medium text-mta-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Sync now
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="text-13 text-red-600 hover:underline dark:text-red-400"
                    >
                      Sign out
                    </button>
                  </div>
                  {confirmDelete ? (
                    <div
                      className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40"
                      role="alertdialog"
                      aria-labelledby="delete-local-data-heading"
                    >
                      <p
                        id="delete-local-data-heading"
                        className="text-13 text-text-primary dark:text-dark-text-primary"
                      >
                        Delete favorites, commutes, and settings from this device? Your synced copy
                        will remain in your account.
                      </p>
                      <div className="mt-3 flex gap-3">
                        <button
                          type="button"
                          onClick={() => void handleDeleteLocalData()}
                          className="text-13 font-medium text-red-700 hover:underline dark:text-red-300"
                        >
                          Delete local data and sign out
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="text-13 text-text-secondary hover:underline dark:text-dark-text-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="mt-4 text-13 text-text-secondary hover:underline dark:text-dark-text-secondary"
                    >
                      Stop syncing and delete local data
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="font-medium text-text-primary dark:text-dark-text-primary">
                      Not signed in
                    </p>
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-12 font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      Local only
                    </span>
                  </div>
                  <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-3">
                    Sign in to sync your favorites, commutes, and settings across devices.
                  </p>
                  <div className="flex gap-2">
                    <a
                      href="/auth/google"
                      className="flex-1 bg-white dark:bg-gray-800 text-text-primary dark:text-dark-text-primary px-4 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <span className="text-13 font-medium">Continue with Google</span>
                    </a>
                    <a
                      href="/auth/github"
                      className="flex-1 bg-gray-900 dark:bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
                    >
                      <span className="text-13 font-medium">Continue with GitHub</span>
                    </a>
                  </div>
                </div>
              )}
              {accountError && (
                <p className="mt-3 text-13 text-red-600 dark:text-red-400" role="alert">
                  {accountError}
                </p>
              )}
            </div>
          </div>
        </section>
        <section aria-labelledby="appearance-heading" className="mb-6">
          <h2
            id="appearance-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Appearance
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg">
            <div className="p-4 border-b border-background dark:border-dark-background">
              <label htmlFor="theme-select" className="flex items-center justify-between">
                <span className="text-text-primary dark:text-dark-text-primary">Theme</span>
                <select
                  id="theme-select"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as "system" | "light" | "dark")}
                  className="bg-background dark:bg-dark-background text-text-primary dark:text-dark-text-primary rounded px-3 py-2 min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
                  aria-label="Select theme"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section aria-labelledby="data-heading" className="mb-6">
          <h2
            id="data-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Data
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg">
            <div className="p-4 border-b border-background dark:border-dark-background">
              <fieldset className="border-0 p-0 m-0">
                <legend className="flex items-center justify-between w-full">
                  <span className="text-text-primary dark:text-dark-text-primary">
                    Show unassigned trips
                  </span>
                  <input
                    type="checkbox"
                    checked={showUnassignedTrips}
                    onChange={(e) => setShowUnassignedTrips(e.target.checked)}
                    className="w-5 h-5 accent-mta-primary focus:outline-none focus:ring-2 focus:ring-mta-primary focus:ring-offset-2"
                    aria-label="Toggle showing unassigned trips"
                  />
                </legend>
              </fieldset>
            </div>
            <div className="p-4 border-b border-background dark:border-dark-background">
              <label
                htmlFor="refresh-interval-select"
                className="flex items-center justify-between"
              >
                <span className="text-text-primary dark:text-dark-text-primary">
                  Refresh interval
                </span>
                <select
                  id="refresh-interval-select"
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="bg-background dark:bg-dark-background text-text-primary dark:text-dark-text-primary rounded px-3 py-2 min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
                  aria-label="Set refresh interval"
                >
                  <option value="15">15 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">60 seconds</option>
                </select>
              </label>
            </div>
          </div>
        </section>

        <section aria-labelledby="accessibility-heading" className="mb-6">
          <h2
            id="accessibility-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Accessibility
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg">
            <div className="p-4">
              <fieldset className="border-0 p-0 m-0">
                <legend className="flex items-center justify-between w-full">
                  <div>
                    <span className="text-text-primary dark:text-dark-text-primary font-medium">
                      Accessible mode
                    </span>
                    <p className="text-13 text-text-secondary dark:text-dark-text-secondary mt-0.5">
                      Avoid stations with broken elevators in route suggestions
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={accessibleMode}
                    onClick={() => setAccessibleMode(!accessibleMode)}
                    className={[
                      "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors",
                      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                      "focus-visible:outline-mta-primary",
                      accessibleMode ? "bg-mta-primary" : "bg-gray-300 dark:bg-gray-600",
                    ].join(" ")}
                    aria-label={
                      accessibleMode ? "Disable accessible mode" : "Enable accessible mode"
                    }
                  >
                    <span
                      className={[
                        "inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow-sm transition-transform",
                        accessibleMode ? "translate-x-5.5" : "translate-x-0.5",
                      ].join(" ")}
                      aria-hidden="true"
                    />
                  </button>
                </legend>
              </fieldset>
            </div>
          </div>
        </section>

        <section aria-labelledby="notifications-heading" className="mb-6">
          <h2
            id="notifications-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            Notifications
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg">{renderPushSection()}</div>
        </section>

        <section aria-labelledby="about-heading">
          <h2
            id="about-heading"
            className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
          >
            About
          </h2>
          <div className="bg-surface dark:bg-dark-surface rounded-lg p-4">
            <p className="text-text-secondary dark:text-dark-text-secondary">MTA My Way v0.0.1</p>
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary mt-2">
              A mobile-first PWA for NYC subway commuters
            </p>
          </div>
        </section>
      </div>
    </Screen>
  );
}
