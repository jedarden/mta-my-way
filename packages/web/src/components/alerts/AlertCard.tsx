/**
 * AlertCard - Display a single service alert.
 *
 * Features:
 *   - Severity color coding (red = severe, yellow = warning, gray = info)
 *   - Line bullets for affected lines
 *   - Expandable description
 *   - "Since" timestamp
 *   - Raw alert indicator for unmatched patterns (dashed border, muted style)
 */

import type { AlertSeverity, StationAlert } from "@mta-my-way/shared";
import { formatTimeAgo } from "@mta-my-way/shared";
import { useEffect, useState } from "react";
import { LineBullet } from "../arrivals/LineBullet";

/** Severity colors and styles */
const SEVERITY_STYLES: Record<AlertSeverity, { bg: string; border: string; text: string; icon: string }> = {
  severe: {
    bg: "bg-mta-red/10 dark:bg-mta-red/20",
    border: "border-l-4 border-mta-red",
    text: "text-mta-red dark:text-red-400",
    icon: "octagon",
  },
  warning: {
    bg: "bg-mta-yellow/10 dark:bg-mta-yellow/20",
    border: "border-l-4 border-mta-yellow",
    text: "text-amber-700 dark:text-amber-400",
    icon: "triangle",
  },
  info: {
    bg: "bg-mta-gray/10 dark:bg-mta-gray/20",
    border: "border-l-4 border-mta-gray",
    text: "text-gray-600 dark:text-gray-400",
    icon: "circle",
  },
};

/** Severity icons */
function SeverityIcon({ severity }: { severity: AlertSeverity }) {
  const iconClass = "w-4 h-4";

  if (severity === "severe") {
    // Octagon (stop sign)
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86L7.86 2z" />
      </svg>
    );
  }

  if (severity === "warning") {
    // Triangle with exclamation
    return (
      <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L1 21h22L12 2zm0 3.5L19.5 19h-15L12 5.5z" />
        <path d="M11 10h2v5h-2zm0 6h2v2h-2z" />
      </svg>
    );
  }

  // Circle (info)
  return (
    <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

interface AlertCardProps {
  alert: StationAlert;
  /** Whether to start expanded */
  initiallyExpanded?: boolean;
  /** Whether this is a "raw" alert (unmatched pattern) */
  isRaw?: boolean;
  /** Compact mode for inline use */
  compact?: boolean;
}

export function AlertCard({ alert, initiallyExpanded = false, isRaw = false, compact = false }: AlertCardProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  const styles = SEVERITY_STYLES[alert.severity];
  const hasDescription = alert.description && alert.description !== alert.headline;

  // Calculate "since" time
  const [sinceText, setSinceText] = useState(() => formatSince(alert.activePeriod.start));

  useEffect(() => {
    const update = () => {
      setSinceText(formatSince(alert.activePeriod.start));
    };
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [alert.activePeriod.start]);

  // Raw alert style (dashed border, muted)
  const rawClass = isRaw
    ? "border-dashed opacity-75"
    : "";

  if (compact) {
    return (
      <CompactAlertCard
        alert={alert}
        isRaw={isRaw}
        styles={styles}
        sinceText={sinceText}
      />
    );
  }

  return (
    <article
      className={`rounded-lg ${styles.bg} ${styles.border} ${rawClass} overflow-hidden`}
      role="article"
      aria-label={`${alert.severity} alert: ${alert.headline}`}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => hasDescription && setExpanded(!expanded)}
        className={`w-full text-left p-3 ${hasDescription ? "cursor-pointer" : "cursor-default"}`}
        aria-expanded={hasDescription ? expanded : undefined}
        aria-label={
          hasDescription
            ? `${expanded ? "Collapse" : "Expand"} details for: ${alert.headline}`
            : alert.headline
        }
      >
        <div className="flex items-start gap-2">
          {/* Severity icon */}
          <span className={`${styles.text} mt-0.5 flex-shrink-0`}>
            <SeverityIcon severity={alert.severity} />
          </span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Affected lines */}
            {alert.affectedLines.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {alert.affectedLines.map((line) => (
                  <LineBullet key={line} line={line} size="sm" />
                ))}
              </div>
            )}

            {/* Headline */}
            <h3 className="text-sm font-medium text-text-primary dark:text-dark-text-primary leading-snug">
              {alert.headline}
              {isRaw && (
                <span className="ml-2 text-11 text-text-secondary dark:text-dark-text-secondary font-normal">
                  (raw alert)
                </span>
              )}
            </h3>

            {/* Since timestamp */}
            <p className={`text-11 ${styles.text} mt-1`}>
              Since {sinceText}
            </p>
          </div>

          {/* Expand indicator */}
          {hasDescription && (
            <span className={`${styles.text} flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </span>
          )}
        </div>
      </button>

      {/* Expandable description */}
      {expanded && hasDescription && (
        <div className="px-3 pb-3 pt-0">
          <div className="pl-6 text-13 text-text-secondary dark:text-dark-text-secondary leading-relaxed border-t border-surface dark:border-dark-surface pt-2">
            {alert.description}
          </div>
        </div>
      )}
    </article>
  );
}

/** Compact alert card for inline use in banners */
function CompactAlertCard({
  alert,
  isRaw,
  styles,
  sinceText,
}: {
  alert: StationAlert;
  isRaw: boolean;
  styles: typeof SEVERITY_STYLES[AlertSeverity];
  sinceText: string;
}) {
  const rawClass = isRaw ? "border-dashed opacity-75" : "";

  return (
    <div
      className={`rounded-lg ${styles.bg} ${styles.border} ${rawClass} p-2.5`}
      role="alert"
    >
      <div className="flex items-center gap-2">
        {/* Severity icon */}
        <span className={`${styles.text} flex-shrink-0`}>
          <SeverityIcon severity={alert.severity} />
        </span>

        {/* Affected lines */}
        {alert.affectedLines.length > 0 && (
          <div className="flex flex-wrap gap-0.5 flex-shrink-0">
            {alert.affectedLines.slice(0, 3).map((line) => (
              <LineBullet key={line} line={line} size="sm" />
            ))}
            {alert.affectedLines.length > 3 && (
              <span className="text-11 text-text-secondary dark:text-dark-text-secondary">
                +{alert.affectedLines.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Headline */}
        <p className="text-13 font-medium text-text-primary dark:text-dark-text-primary truncate flex-1">
          {alert.headline}
        </p>

        {/* Since timestamp */}
        <span className={`text-11 ${styles.text} flex-shrink-0`}>
          {sinceText}
        </span>
      </div>
    </div>
  );
}

/** Format a timestamp as "since" text */
function formatSince(timestamp: number): string {
  const now = Date.now();
  const diff = Math.floor((now - timestamp * 1000) / 1000);

  if (diff < 60) {
    return "just now";
  }

  return formatTimeAgo(diff);
}

export default AlertCard;
