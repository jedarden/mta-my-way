/**
 * AlertList - Reusable list of alerts.
 *
 * Used in:
 *   - AlertsScreen (main alerts list)
 *   - Embedded in other screens (filtered to relevant alerts)
 *
 * Features:
 *   - Grouped by severity (severe, warning, info)
 *   - Empty state when no alerts
 *   - Loading skeleton
 */

import type { AlertSeverity, StationAlert } from "@mta-my-way/shared";
import type { AlertDataStatus } from "../../hooks/useAlerts";
import { AlertCard } from "./AlertCard";

interface AlertListProps {
  alerts: StationAlert[];
  status: AlertDataStatus;
  /** Called when retry is clicked on error */
  onRetry?: () => void;
  /** Show in compact mode */
  compact?: boolean;
  /** Custom empty message */
  emptyMessage?: string;
  /** Maximum alerts to show (for embedded use) */
  maxAlerts?: number;
}

/** Group alerts by severity */
function groupBySeverity(alerts: StationAlert[]): Map<AlertSeverity, StationAlert[]> {
  const groups = new Map<AlertSeverity, StationAlert[]>([
    ["severe", []],
    ["warning", []],
    ["info", []],
  ]);

  for (const alert of alerts) {
    const group = groups.get(alert.severity);
    if (group) {
      group.push(alert);
    }
  }

  return groups;
}

/** Section labels for severity groups */
const SEVERITY_LABELS: Record<AlertSeverity, { label: string; className: string }> = {
  severe: {
    label: "Service Suspended",
    className: "text-mta-red dark:text-red-400",
  },
  warning: {
    label: "Delays",
    className: "text-amber-700 dark:text-amber-400",
  },
  info: {
    label: "Planned Work & Info",
    className: "text-gray-600 dark:text-gray-400",
  },
};

export function AlertList({
  alerts,
  status,
  onRetry,
  compact = false,
  emptyMessage = "No active alerts",
  maxAlerts,
}: AlertListProps) {
  // Loading state
  if (status === "loading" || status === "idle") {
    return <AlertListSkeleton count={3} />;
  }

  // Error state
  if (status === "error" && alerts.length === 0) {
    return (
      <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
        <p className="text-text-secondary dark:text-dark-text-secondary mb-3">
          Couldn't load alerts
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 bg-mta-primary text-white rounded font-medium text-13 min-h-touch"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  // Empty state
  if (alerts.length === 0) {
    return (
      <div className="bg-surface dark:bg-dark-surface rounded-lg p-6 text-center">
        <p className="text-text-secondary dark:text-dark-text-secondary">
          {emptyMessage}
        </p>
      </div>
    );
  }

  // Apply max alerts limit
  const displayedAlerts = maxAlerts ? alerts.slice(0, maxAlerts) : alerts;

  // Compact mode: flat list
  if (compact) {
    return (
      <div className="space-y-2" role="list" aria-label="Alerts">
        {displayedAlerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            compact
            isRaw={alert.source === "predicted"}
          />
        ))}
        {maxAlerts && alerts.length > maxAlerts && (
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary text-center py-1">
            +{alerts.length - maxAlerts} more alerts
          </p>
        )}
      </div>
    );
  }

  // Full mode: grouped by severity
  const groups = groupBySeverity(displayedAlerts);

  return (
    <div className="space-y-6" role="list" aria-label="Alerts">
      {(["severe", "warning", "info"] as AlertSeverity[]).map((severity) => {
        const groupAlerts = groups.get(severity);
        if (!groupAlerts || groupAlerts.length === 0) return null;

        const { label, className } = SEVERITY_LABELS[severity];

        return (
          <section key={severity} aria-labelledby={`${severity}-heading`}>
            <h3
              id={`${severity}-heading`}
              className={`text-sm font-semibold mb-2 ${className}`}
            >
              {label}
            </h3>
            <div className="space-y-2">
              {groupAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  isRaw={alert.source === "predicted"}
                />
              ))}
            </div>
          </section>
        );
      })}

      {maxAlerts && alerts.length > maxAlerts && (
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary text-center py-2">
          +{alerts.length - maxAlerts} more alerts
        </p>
      )}
    </div>
  );
}

/** Loading skeleton for alert list */
export function AlertListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading alerts">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-20 rounded-lg animate-pulse bg-surface dark:bg-dark-surface"
        />
      ))}
    </div>
  );
}

export default AlertList;
