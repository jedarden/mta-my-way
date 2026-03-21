/**
 * AlertBanner - Inline alert banner for station and commute screens.
 *
 * Shows relevant alerts in a compact, dismissible or expandable format.
 * Color-coded by severity.
 */

import type { AlertSeverity, StationAlert } from "@mta-my-way/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineBullet } from "../arrivals/LineBullet";

/** Severity styles for banners */
const SEVERITY_STYLES: Record<AlertSeverity, { bg: string; border: string; text: string }> = {
  severe: {
    bg: "bg-mta-red/10 dark:bg-mta-red/20",
    border: "border border-mta-red/30",
    text: "text-mta-red dark:text-red-400",
  },
  warning: {
    bg: "bg-mta-yellow/10 dark:bg-mta-yellow/20",
    border: "border border-mta-yellow/30",
    text: "text-amber-700 dark:text-amber-400",
  },
  info: {
    bg: "bg-mta-gray/10 dark:bg-mta-gray/20",
    border: "border border-mta-gray/30",
    text: "text-gray-600 dark:text-gray-400",
  },
};

interface AlertBannerProps {
  alerts: StationAlert[];
  /** Optional title override */
  title?: string;
  /** Show link to full alerts screen */
  showLink?: boolean;
  /** Maximum alerts to show before "+N more" */
  maxVisible?: number;
}

/** Get the most severe alert from a list */
function getMostSevere(alerts: StationAlert[]): StationAlert | undefined {
  const order: Record<AlertSeverity, number> = { severe: 3, warning: 2, info: 1 };
  return alerts.reduce<StationAlert | undefined>((most, alert) => {
    if (!most || order[alert.severity] > order[most.severity]) return alert;
    return most;
  }, undefined);
}

/** Get combined severity (worst of all) */
function getCombinedSeverity(alerts: StationAlert[]): AlertSeverity {
  if (alerts.some((a) => a.severity === "severe")) return "severe";
  if (alerts.some((a) => a.severity === "warning")) return "warning";
  return "info";
}

/** Get unique affected lines from alerts */
function getAffectedLines(alerts: StationAlert[]): string[] {
  const lines = new Set<string>();
  for (const alert of alerts) {
    for (const line of alert.affectedLines) {
      lines.add(line);
    }
  }
  return Array.from(lines).sort();
}

export function AlertBanner({
  alerts,
  title: _title,
  showLink = true,
  maxVisible = 2,
}: AlertBannerProps) {
  void _title; // Reserved for future use in banner header
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const severity = getCombinedSeverity(alerts);
  const styles = SEVERITY_STYLES[severity];
  const affectedLines = getAffectedLines(alerts);
  const mostSevere = getMostSevere(alerts);
  const visibleAlerts = expanded ? alerts : alerts.slice(0, maxVisible);
  const hasMore = alerts.length > maxVisible;

  return (
    <aside
      className={`${styles.bg} ${styles.border} rounded-lg overflow-hidden`}
      role="alert"
      aria-live="polite"
    >
      {/* Header */}
      <div className="px-3 py-2.5">
        {/* Title row */}
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            {/* Alert count badge */}
            <span className={`${styles.text} text-13 font-semibold`}>
              {alerts.length === 1 ? "1 Alert" : `${alerts.length} Alerts`}
            </span>

            {/* Affected lines */}
            {affectedLines.length > 0 && (
              <div className="flex flex-wrap gap-0.5">
                {affectedLines.slice(0, 5).map((line) => (
                  <LineBullet key={line} line={line} size="sm" />
                ))}
                {affectedLines.length > 5 && (
                  <span className="text-11 text-text-secondary dark:text-dark-text-secondary">
                    +{affectedLines.length - 5}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Link to alerts screen */}
          {showLink && (
            <button
              type="button"
              onClick={() => navigate("/alerts")}
              className="text-13 text-mta-primary font-medium flex-shrink-0 min-h-touch px-2"
            >
              View all
            </button>
          )}
        </div>

        {/* Most severe alert headline */}
        {mostSevere && !expanded && (
          <p className="text-13 text-text-primary dark:text-dark-text-primary leading-snug">
            {mostSevere.headline}
          </p>
        )}
      </div>

      {/* Expandable alert list */}
      {(expanded || alerts.length > 1) && (
        <div className="border-t border-surface/50 dark:border-dark-surface/50 px-3 py-2 space-y-1.5">
          {visibleAlerts.map((alert) => (
            <div
              key={alert.id}
              className="text-13 text-text-primary dark:text-dark-text-primary"
            >
              <span className={`${SEVERITY_STYLES[alert.severity].text} font-medium`}>
                {alert.affectedLines.length > 0 ? `[${alert.affectedLines.join(", ")}] ` : ""}
              </span>
              {alert.headline}
            </div>
          ))}
        </div>
      )}

      {/* Show more / less toggle */}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`w-full text-13 ${styles.text} font-medium py-2 text-center hover:bg-surface/20 dark:hover:bg-dark-surface/20 transition-colors min-h-touch`}
        >
          {expanded ? "Show less" : `+${alerts.length - maxVisible} more alerts`}
        </button>
      )}
    </aside>
  );
}

/** Simple inline banner for a single alert */
export function SingleAlertBanner({ alert }: { alert: StationAlert }) {
  const styles = SEVERITY_STYLES[alert.severity];

  return (
    <div
      className={`${styles.bg} ${styles.border} rounded-lg px-3 py-2`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        {/* Affected lines */}
        {alert.affectedLines.length > 0 && (
          <div className="flex gap-0.5 flex-shrink-0">
            {alert.affectedLines.slice(0, 3).map((line) => (
              <LineBullet key={line} line={line} size="sm" />
            ))}
          </div>
        )}

        {/* Headline */}
        <p className="text-13 text-text-primary dark:text-dark-text-primary truncate flex-1">
          {alert.headline}
        </p>
      </div>
    </div>
  );
}

export default AlertBanner;
