/**
 * ContextIndicator - Displays the current detected user context
 *
 * Shows a small indicator when the app detects a meaningful context
 * (commuting, at_station, planning, reviewing) with:
 * - Context label
 * - Visual indicator (dot with color based on context)
 * - Confidence indicator
 *
 * Only shows when context is not "idle" and setting is enabled.
 */

import type { ContextConfidence, UserContext } from "@mta-my-way/shared";
import { getContextLabel } from "@mta-my-way/shared";

interface ContextIndicatorProps {
  /** Current detected context */
  context: UserContext;
  /** Confidence level */
  confidence: ContextConfidence;
  /** Whether to show the indicator */
  show: boolean;
  /** Compact mode (smaller) */
  compact?: boolean;
}

/** Context colors (tailwind classes) */
const CONTEXT_COLORS: Record<UserContext, string> = {
  commuting: "bg-green-500 dark:bg-green-600",
  planning: "bg-blue-500 dark:bg-blue-600",
  reviewing: "bg-purple-500 dark:bg-purple-600",
  idle: "bg-gray-400 dark:bg-gray-600",
  at_station: "bg-orange-500 dark:bg-orange-600",
};

/** Context icon paths */
const CONTEXT_ICONS: Record<UserContext, string> = {
  commuting: "M13 2L3 14h9l-1 8 10-12h-9l1-8z", // Lightning bolt
  planning: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z", // Map pin
  reviewing: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", // Clock
  idle: "",
  at_station: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", // Location/building
};

export function ContextIndicator({
  context,
  confidence,
  show,
  compact = false,
}: ContextIndicatorProps) {
  // Don't show if idle or disabled
  if (!show || context === "idle") {
    return null;
  }

  const label = getContextLabel(context);
  const colorClass = CONTEXT_COLORS[context];
  const iconPath = CONTEXT_ICONS[context];

  // Size classes based on compact mode
  const sizeClasses = compact ? "px-2 py-1 text-xs gap-1.5" : "px-2.5 py-1.5 text-13 gap-2";

  const dotSize = compact ? "w-1.5 h-1.5" : "w-2 h-2";
  const iconSize = compact ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <div
      className={`inline-flex items-center rounded-full bg-surface-container dark:bg-dark-surface-container ${sizeClasses}`}
      role="status"
      aria-label={`Current context: ${label}, confidence: ${confidence}`}
    >
      {/* Context color dot */}
      <span className={`rounded-full ${colorClass} ${dotSize}`} aria-hidden="true" />

      {/* Context icon (if available) */}
      {iconPath && (
        <svg
          className={`${iconSize} text-text-secondary dark:text-dark-text-secondary`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={iconPath} />
        </svg>
      )}

      {/* Context label */}
      <span className="font-medium text-text-primary dark:text-dark-text-primary">{label}</span>

      {/* Confidence indicator (subtle) */}
      {confidence === "high" && (
        <svg
          className={`${iconSize} text-green-600 dark:text-green-500`}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
      )}
    </div>
  );
}

export default ContextIndicator;
