/**
 * AlertsScreen - Full alerts feed with filtering.
 *
 * Features:
 *   - Toggle between "My Lines" and "All Lines"
 *   - Grouped by severity (severe, warning, info)
 *   - Badge count on header
 *   - Pull-to-refresh (future)
 *   - Empty states for both modes
 */

import Screen from "../components/layout/Screen";
import { AlertList } from "../components/alerts";
import { useAlerts } from "../hooks/useAlerts";

export default function AlertsScreen() {
  const {
    alerts,
    myAlerts,
    myAlertsCount,
    status,
    refresh,
    filterMode,
    setFilterMode,
  } = useAlerts();

  const isMineMode = filterMode === "mine";
  const displayAlerts = isMineMode ? myAlerts : alerts;

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        {/* Header with toggle */}
        <header className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-text-primary dark:text-dark-text-primary">
              Alerts
            </h1>
            {/* Badge count for my alerts */}
            {myAlertsCount > 0 && (
              <span className="px-2 py-0.5 bg-mta-red text-white text-13 font-semibold rounded-full">
                {myAlertsCount}
              </span>
            )}
          </div>

          {/* Filter toggle */}
          <FilterToggle
            mode={filterMode}
            onChange={setFilterMode}
            myAlertsCount={myAlertsCount}
          />
        </header>

        {/* Active alerts */}
        <section aria-labelledby="active-heading" className="mb-6">
          <h2
            id="active-heading"
            className="text-lg font-semibold mb-3 text-text-primary dark:text-dark-text-primary"
          >
            {isMineMode ? "Your Lines" : "All Lines"}
          </h2>

          <AlertList
            alerts={displayAlerts}
            status={status}
            onRetry={refresh}
            emptyMessage={
              isMineMode
                ? "No alerts affecting your lines"
                : "No active alerts"
            }
          />
        </section>

        {/* Planned work section */}
        {displayAlerts.some((a) => a.cause === "PLANNED_WORK" || a.cause === "MAINTENANCE") && (
          <section aria-labelledby="planned-heading" className="mt-6">
            <h2
              id="planned-heading"
              className="text-lg font-semibold mb-4 text-text-primary dark:text-dark-text-primary"
            >
              Planned Work
            </h2>
            <AlertList
              alerts={displayAlerts.filter(
                (a) => a.cause === "PLANNED_WORK" || a.cause === "MAINTENANCE"
              )}
              status={status}
              emptyMessage="No planned work"
            />
          </section>
        )}
      </div>
    </Screen>
  );
}

/** Filter toggle between "My Lines" and "All Lines" */
function FilterToggle({
  mode,
  onChange,
  myAlertsCount,
}: {
  mode: "mine" | "all";
  onChange: (mode: "mine" | "all") => void;
  myAlertsCount: number;
}) {
  return (
    <div
      className="flex bg-surface dark:bg-dark-surface rounded-lg p-1"
      role="tablist"
      aria-label="Filter alerts"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "mine"}
        onClick={() => onChange("mine")}
        className={`flex-1 py-2 px-3 rounded-md text-14 font-medium transition-colors min-h-touch ${
          mode === "mine"
            ? "bg-mta-primary text-white"
            : "text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary"
        }`}
      >
        My Lines
        {myAlertsCount > 0 && (
          <span
            className={`ml-1.5 px-1.5 py-0.5 text-11 rounded-full ${
              mode === "mine"
                ? "bg-white/20 text-white"
                : "bg-mta-red text-white"
            }`}
          >
            {myAlertsCount}
          </span>
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "all"}
        onClick={() => onChange("all")}
        className={`flex-1 py-2 px-3 rounded-md text-14 font-medium transition-colors min-h-touch ${
          mode === "all"
            ? "bg-mta-primary text-white"
            : "text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary"
        }`}
      >
        All Lines
      </button>
    </div>
  );
}
