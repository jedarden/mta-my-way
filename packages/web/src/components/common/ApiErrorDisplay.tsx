/**
 * ApiErrorDisplay - User-friendly error display with recovery options.
 *
 * Per plan.md Phase 4: Comprehensive error states.
 *
 * Features:
 *   - Clear, actionable error messages
 *   - Retry button for retryable errors
 *   - Offline-specific messaging
 *   - Accessibility features (ARIA live regions)
 *   - Optional dismiss action
 *   - Uses getUserErrorMessage for consistent, contextual error messages
 *
 * Security: All SVG icons are rendered as React components to prevent XSS attacks.
 * No dangerouslySetInnerHTML is used.
 */

import type { ApiErrorType } from "../../lib/apiEnhanced";
import { ErrorCategory, type UserErrorMessage, getUserErrorMessage } from "../../lib/errorMessages";

interface ApiErrorDisplayProps {
  error: string;
  errorType?: ApiErrorType | null;
  canRetry?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
  onDismiss?: () => void;
  compact?: boolean;
  /** Optional context for more specific error messages (e.g., "trip", "equipment", "alerts") */
  context?: string;
}

/** SVG icon components for each error type - rendered as React to prevent XSS */
const ErrorIcons = {
  Network: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 1l22 22" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  ),
  Timeout: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  Server: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  ),
  NotFound: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Unauthorized: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Parse: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  ),
  Offline: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  ),
  Unknown: () => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

/** Error type to icon component and color class mapping */
const ERROR_ICON_CONFIG: Record<
  ApiErrorType | "default",
  { Icon: () => React.JSX.Element; color: string }
> = {
  network: { Icon: ErrorIcons.Network, color: "text-warning" },
  timeout: { Icon: ErrorIcons.Timeout, color: "text-warning" },
  server: { Icon: ErrorIcons.Server, color: "text-warning" },
  not_found: { Icon: ErrorIcons.NotFound, color: "text-text-secondary" },
  unauthorized: { Icon: ErrorIcons.Unauthorized, color: "text-warning" },
  parse: { Icon: ErrorIcons.Parse, color: "text-warning" },
  offline: { Icon: ErrorIcons.Offline, color: "text-text-secondary" },
  unknown: { Icon: ErrorIcons.Unknown, color: "text-severe" },
  default: { Icon: ErrorIcons.Unknown, color: "text-severe" },
};

export function ApiErrorDisplay({
  error,
  errorType,
  canRetry = true,
  isRetrying = false,
  onRetry,
  onDismiss,
  compact = false,
  context,
}: ApiErrorDisplayProps) {
  // Get user-friendly error message based on error type and context
  const userError: UserErrorMessage = errorType
    ? getUserErrorMessage(errorType, context)
    : {
        title: "Something went wrong",
        message: error,
        retryable: canRetry,
        category: ErrorCategory.UNKNOWN,
      };

  const iconData = ERROR_ICON_CONFIG[errorType || "default"];
  const IconComponent = iconData.Icon;

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 bg-warning/10 rounded-lg"
        role="alert"
        aria-live="polite"
      >
        <span className={iconData.color}>
          <IconComponent />
        </span>
        <span className="flex-1 text-13 text-text-primary dark:text-dark-text-primary">
          {userError.message}
        </span>
        {userError.retryable && onRetry && !isRetrying && (
          <button
            onClick={onRetry}
            className="text-13 text-mta-primary font-medium whitespace-nowrap"
            type="button"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg bg-surface dark:bg-dark-surface p-4 text-center"
      role="alert"
      aria-live="assertive"
    >
      {/* Error icon */}
      <div className={`flex justify-center mb-3 ${iconData.color}`}>
        <IconComponent />
      </div>

      {/* Error message */}
      <p className="text-base text-text-primary dark:text-dark-text-primary mb-1">
        {userError.title}
      </p>
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-4">
        {userError.message}
      </p>
      {userError.suggestion && (
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-4 italic">
          {userError.suggestion}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {userError.retryable && onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="w-full px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            type="button"
          >
            {isRetrying ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-spin"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Retrying...
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Try again
              </>
            )}
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-full px-4 py-3 bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary border border-border dark:border-dark-border rounded-lg font-medium min-h-touch hover:bg-background dark:hover:bg-dark-background transition-colors"
            type="button"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

export default ApiErrorDisplay;
