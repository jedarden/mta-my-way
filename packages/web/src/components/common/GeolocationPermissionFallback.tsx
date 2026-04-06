/**
 * GeolocationPermissionFallback - Fallback UI for geolocation permission issues.
 *
 * Per plan.md Phase 4: Comprehensive error states with clear recovery options.
 *
 * Features:
 *   - Clear explanation of why location is needed
 *   - Step-by-step instructions to enable location
 *   - Alternative action (search manually)
 *   - Platform-specific instructions (iOS vs Android)
 *   - Accessible with proper ARIA labels
 */

import { Link } from "react-router-dom";
import type { GeolocationPermissionState } from "../../hooks/useGeolocation";

interface GeolocationPermissionFallbackProps {
  /** Current permission state */
  permission: GeolocationPermissionState;
  /** Error message if location fetch failed */
  error?: string | null;
  /** Called when user taps to request permission again */
  onRequestPermission: () => void;
  /** Optional context for more specific messaging */
  context?: string;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

/**
 * Detect user's platform for instructions
 */
function getPlatform(): "ios" | "android" | "desktop" {
  const ua = navigator.userAgent;

  if (/iPad|iPhone|iPod/.test(ua)) {
    return "ios";
  }
  if (/Android/.test(ua)) {
    return "android";
  }
  return "desktop";
}

/**
 * Get permission-specific message and instructions
 */
function getPermissionContent(
  permission: GeolocationPermissionState,
  error: string | null | undefined,
  context?: string
): {
  title: string;
  message: string;
  suggestion?: string;
  canRequest: boolean;
} {
  const platform = getPlatform();

  if (permission === "denied") {
    const instructions = {
      ios: "To enable location: Settings → Safari → Location → Allow",
      android: "To enable location: Chrome menu (⋮) → Settings → Site settings → Location → Allow",
      desktop:
        "To enable location: Click the lock/icon in your address bar → Site settings → Location → Allow",
    };

    return {
      title: "Location access denied",
      message: context?.includes("nearby")
        ? "To find stations near you, please enable location access."
        : "Location access helps us show relevant stations and service information.",
      suggestion: instructions[platform],
      canRequest: false,
    };
  }

  if (permission === "unavailable") {
    return {
      title: "Location not available",
      message:
        "Your device doesn't support location services, or it's disabled in your browser settings.",
      suggestion: "You can search for stations manually instead.",
      canRequest: false,
    };
  }

  if (error) {
    return {
      title: "Couldn't get your location",
      message: error,
      suggestion: "Try again or search for stations manually.",
      canRequest: true,
    };
  }

  // Default prompt state
  return {
    title: "Enable location",
    message: context?.includes("nearby")
      ? "Find stations near you by enabling location access."
      : "Allow location access to see stations and service information relevant to your area.",
    canRequest: true,
  };
}

/**
 * GeolocationPermissionFallback - Shows when location permission is denied/unavailable
 */
export function GeolocationPermissionFallback({
  permission,
  error,
  onRequestPermission,
  context,
  compact = false,
}: GeolocationPermissionFallbackProps) {
  const { title, message, suggestion, canRequest } = getPermissionContent(
    permission,
    error,
    context
  );

  // Compact mode for inline use
  if (compact) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-warning/10 rounded-lg"
        role="status"
        aria-live="polite"
      >
        <span className="text-warning" aria-hidden="true">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </span>
        <span className="flex-1 text-13 text-text-primary dark:text-dark-text-primary">
          {message}
        </span>
        {canRequest && (
          <button
            type="button"
            onClick={onRequestPermission}
            className="text-13 text-mta-primary font-medium whitespace-nowrap"
          >
            Enable
          </button>
        )}
        <Link to="/search" className="text-13 text-mta-primary font-medium whitespace-nowrap">
          Search
        </Link>
      </div>
    );
  }

  // Full-size fallback UI
  const platform = getPlatform();
  const isIOS = platform === "ios";

  return (
    <div
      className="rounded-lg bg-surface dark:bg-dark-surface p-6 text-center"
      role="status"
      aria-live="assertive"
    >
      {/* Location icon */}
      <div
        className="flex justify-center mb-4 text-text-secondary dark:text-dark-text-secondary"
        aria-hidden="true"
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
          {permission === "denied" && (
            <>
              <line x1="8" y1="8" x2="16" y2="16" />
              <line x1="16" y1="8" x2="8" y2="16" />
            </>
          )}
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-2">
        {title}
      </h2>
      <p className="text-14 text-text-secondary dark:text-dark-text-secondary mb-4">{message}</p>

      {/* Platform-specific instructions */}
      {suggestion && (
        <div className="mb-4 p-3 bg-background dark:bg-dark-background rounded-lg text-left">
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
            <span className="font-medium text-text-primary dark:text-dark-text-primary">
              {isIOS ? "iPhone/iPad: " : platform === "android" ? "Android: " : ""}
            </span>
            {suggestion}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {canRequest && (
          <button
            type="button"
            onClick={onRequestPermission}
            className="w-full px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Enable location access
          </button>
        )}

        <Link
          to="/search"
          className="w-full px-4 py-3 bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary border border-border dark:border-dark-border rounded-lg font-medium min-h-touch hover:bg-background dark:hover:bg-dark-background transition-colors flex items-center justify-center gap-2"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search for stations
        </Link>
      </div>
    </div>
  );
}

/**
 * Compact banner version for showing at the top of a screen
 */
interface GeolocationBannerProps {
  /** Current permission state */
  permission: GeolocationPermissionState;
  /** Called when user taps to request permission */
  onRequestPermission: () => void;
  /** Called when user dismisses the banner */
  onDismiss: () => void;
}

export function GeolocationPermissionBanner({
  permission,
  onRequestPermission,
  onDismiss,
}: GeolocationBannerProps) {
  if (permission === "granted") {
    return null;
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 bg-warning/10 border-b border-warning/20"
      role="alert"
      aria-live="polite"
    >
      <span className="text-warning flex-shrink-0" aria-hidden="true">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </span>
      <p className="flex-1 text-13 text-text-primary dark:text-dark-text-primary">
        {permission === "denied"
          ? "Location access denied. Search manually or enable in settings."
          : "Enable location to find nearby stations."}
      </p>
      {permission !== "denied" && (
        <button
          type="button"
          onClick={onRequestPermission}
          className="text-13 text-mta-primary font-medium whitespace-nowrap min-h-touch px-2"
        >
          Enable
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="text-text-secondary dark:text-dark-text-secondary min-h-touch px-2"
        aria-label="Dismiss"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default GeolocationPermissionFallback;
