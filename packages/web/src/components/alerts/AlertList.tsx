/**
 * AlertList - Reusable list of alerts using DataState wrapper.
 *
 * Used in:
 *   - AlertsScreen (main alerts list)
 *   - Embedded in other screens (filtered to relevant alerts)
 *
 * Features:
 *   - Uses DataState wrapper for consistent loading/error/empty/stale handling
 *   - Grouped by severity (severe, warning, info)
 *   - Shaped skeleton during loading
 *   - Contextual empty state with retry
 */

import type { AlertSeverity, StationAlert } from "@mta-my-way/shared";
import type { AlertDataStatus } from "../../hooks/useAlerts";
import { DataState } from "../common/DataState";
import { EmptyAlerts } from "../common/EmptyState";
import { AlertListSkeleton } from "../common/Skeleton";
import { AlertCard } from "./AlertCard";

interface AlertListProps {
  alerts: StationAlert[];
  status: AlertDataStatus;
  /** Timestamp (ms) for stale data age calculation */
  updatedAt?: number | null;
  /** Called when retry is clicked on error */
  onRetry?: () => void;
  /** Show in compact mode */
  compact?: boolean;
  /** Custom empty message */
  emptyMessage?: string;
  /** Custom empty subtext */
  emptySubtext?: string;
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
  updatedAt,
  onRetry,
  compact = false,
  emptyMessage = "No active alerts",
  emptySubtext,
  maxAlerts,
}: AlertListProps) {
  // Derive error message for DataState
  const errorMessage = status === "error" ? "Couldn't load alerts" : null;

  return (
    <DataState
      status={status}
      data={alerts}
      error={errorMessage}
      skeleton={<AlertListSkeleton count={3} />}
      empty={<EmptyAlerts message={emptyMessage} subtext={emptySubtext} />}
      staleTimestamp={updatedAt}
      onRetry={onRetry}
    >
      {(data) => <AlertListContent alerts={data} compact={compact} maxAlerts={maxAlerts} />}
    </DataState>
  );
}

/** Inner content component for alerts list */
function AlertListContent({
  alerts,
  compact,
  maxAlerts,
}: {
  alerts: StationAlert[];
  compact: boolean;
  maxAlerts?: number;
}) {
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
            isRaw={alert.isRaw ?? false}
            isPredicted={alert.source === "predicted"}
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
            <h3 id={`${severity}-heading`} className={`text-sm font-semibold mb-2 ${className}`}>
              {label}
            </h3>
            <div className="space-y-2">
              {groupAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  isRaw={alert.isRaw ?? false}
                  isPredicted={alert.source === "predicted"}
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

export default AlertList;
