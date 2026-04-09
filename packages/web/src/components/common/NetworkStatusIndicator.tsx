/**
 * NetworkStatusIndicator - Visual online/offline status indicator.
 *
 * Shows a compact status indicator in the header that displays:
 * - Green dot with checkmark when online
 * - Red/orange dot with wifi-off icon when offline
 *
 * Automatically updates based on navigator.onLine via useOnlineStatus.
 * Provides visual feedback about network connectivity state.
 */

import { useOnlineStatus } from "../../hooks/useOnlineStatus";

interface NetworkStatusIndicatorProps {
  /** Whether to show in compact mode (smaller size) */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function NetworkStatusIndicator({
  compact = false,
  className = "",
}: NetworkStatusIndicatorProps) {
  const isOnline = useOnlineStatus();

  const sizeClasses = compact ? "w-4 h-4" : "w-5 h-5";

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={isOnline ? "Online" : "Offline"}
    >
      {/* Status dot with icon */}
      <div
        className={`flex items-center justify-center rounded-full ${sizeClasses} ${isOnline ? "bg-green-500 dark:bg-green-600" : "bg-orange-500 dark:bg-orange-600"}`}
        aria-hidden="true"
      >
        {isOnline ? (
          // Checkmark for online
          <svg
            width={compact ? "10" : "12"}
            height={compact ? "10" : "12"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          // Wifi-off icon for offline
          <svg
            width={compact ? "10" : "12"}
            height={compact ? "10" : "12"}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        )}
      </div>
      {/* Text label (hidden in compact mode) */}
      {!compact && (
        <span className="text-13 font-medium text-text-secondary dark:text-dark-text-secondary">
          {isOnline ? "Online" : "Offline"}
        </span>
      )}
    </div>
  );
}

export default NetworkStatusIndicator;
