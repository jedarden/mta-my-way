/**
 * AlertsScreen - Full alerts feed with filtering.
 *
 * Features:
 *   - Toggle between "My Lines" and "All Lines"
 *   - Grouped by severity (severe, warning, info)
 *   - Badge count on header
 *   - System status strip linking to /health and the per-line diagrams
 *   - Pull-to-refresh (future)
 *   - Empty states for both modes
 */

import type { LineStatus, StationAlert } from "@mta-my-way/shared";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertList } from "../components/alerts";
import { LineBullet } from "../components/arrivals/LineBullet";
import Screen from "../components/layout/Screen";
import type { AlertDataStatus } from "../hooks/useAlerts";
import { useAlerts } from "../hooks/useAlerts";
import { computeLineHealth } from "../hooks/useSystemHealth";

export default function AlertsScreen() {
  const { alerts, myAlerts, myAlertsCount, status, updatedAt, refresh, filterMode, setFilterMode } =
    useAlerts();

  const isMineMode = filterMode === "mine";
  const displayAlerts = isMineMode ? myAlerts : alerts;

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        {/* Filter toggle header */}
        <div className="mb-4">
          {myAlertsCount > 0 && (
            <p className="sr-only" aria-live="polite">
              {myAlertsCount} alert{myAlertsCount === 1 ? "" : "s"} affecting your lines
            </p>
          )}
          <FilterToggle mode={filterMode} onChange={setFilterMode} myAlertsCount={myAlertsCount} />
        </div>

        {/* System status strip — the in-app entry points for /health and /line/:lineId */}
        <SystemStatusStrip alerts={alerts} status={status} />

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
            updatedAt={updatedAt}
            onRetry={refresh}
            emptyMessage={isMineMode ? "No alerts affecting your lines" : "No active alerts"}
            emptySubtext={isMineMode ? "Add favorites to see relevant alerts" : undefined}
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
              updatedAt={updatedAt}
              emptyMessage="No planned work"
            />
          </section>
        )}
      </div>
    </Screen>
  );
}

/** Severity ranking so the worst disruptions sort first in the status strip */
const STATUS_RANK: Record<LineStatus, number> = {
  normal: 0,
  minor_delays: 1,
  significant_delays: 2,
  suspended: 3,
};

/** How many affected-line bullets to show before collapsing into an overflow count */
const MAX_STRIP_LINES = 6;

/**
 * SystemStatusStrip - overall service status with the navigation entry points
 * for HealthScreen (/health) and the line diagram (/line/:lineId).
 *
 * Neither route has a BottomNav item, so without this strip both are only
 * reachable by typing the URL. The Health link renders unconditionally so the
 * entry point survives an empty or failed alerts load; the affected-line
 * bullets give the diagram a direct tap path from the disruptions a rider is
 * already reading about. Line status is derived from the alerts this screen
 * already fetched — no second /api/alerts request.
 */
function SystemStatusStrip({
  alerts,
  status,
}: {
  alerts: StationAlert[];
  status: AlertDataStatus;
}) {
  const navigate = useNavigate();
  const hasData = status !== "idle" && status !== "loading";

  const { lines, healthPercentage } = useMemo(() => computeLineHealth(alerts), [alerts]);
  const affected = useMemo(
    () =>
      lines
        .filter((l) => l.status !== "normal")
        .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]),
    [lines]
  );

  // Never claim the system is healthy off a feed that failed — say so instead.
  const summary =
    status === "error" || status === "offline"
      ? "Status unavailable"
      : !hasData
        ? "Status for every line"
        : affected.length === 0
          ? "All lines running normally"
          : `${affected.length} ${affected.length === 1 ? "line" : "lines"} with issues`;

  // Green when nothing is wrong, amber for delays, red once anything is suspended
  const worst = affected[0]?.status;
  const statusColor =
    affected.length === 0
      ? "bg-green-500 dark:bg-green-400"
      : worst === "suspended"
        ? "bg-red-500 dark:bg-red-400"
        : "bg-yellow-400 dark:bg-yellow-500";

  return (
    <section aria-labelledby="system-status-heading" className="mb-6">
      <h2 id="system-status-heading" className="sr-only">
        System status
      </h2>
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface dark:bg-dark-surface">
        <Link
          to="/health"
          className="flex items-center gap-3 min-h-touch min-w-0 flex-1"
          aria-label={`System Health: ${summary}, ${healthPercentage}% of lines normal`}
        >
          <span className={`w-3 h-3 rounded-full shrink-0 ${statusColor}`} aria-hidden="true" />
          <span className="flex flex-col min-w-0">
            <span className="text-13 font-semibold text-text-primary dark:text-dark-text-primary">
              System Health
            </span>
            <span className="text-11 text-text-tertiary dark:text-dark-text-tertiary truncate">
              {summary}
            </span>
          </span>
        </Link>

        {affected.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-end shrink-0">
            {affected.slice(0, MAX_STRIP_LINES).map((line) => (
              <LineBullet
                key={line.lineId}
                line={line.lineId}
                size="sm"
                onClick={() => void navigate(`/line/${line.lineId}`)}
              />
            ))}
            {affected.length > MAX_STRIP_LINES && (
              <span className="text-11 text-text-tertiary dark:text-dark-text-tertiary self-center">
                +{affected.length - MAX_STRIP_LINES}
              </span>
            )}
          </div>
        )}
      </div>
    </section>
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
              mode === "mine" ? "bg-white/20 text-white" : "bg-mta-red text-white"
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
