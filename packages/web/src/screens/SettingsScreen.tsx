import Screen from "../components/layout/Screen";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useSettingsStore } from "../stores/settingsStore";

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
