/**
 * FullScreenLoadingState - Full-screen loading and fallback states.
 *
 * Per plan.md Phase 4: Comprehensive error states with clear recovery options.
 *
 * Features:
 *   - Initial app loading state with logo and progress
 *   - Timeout error state with navigation options
 *   - Accessible with proper ARIA labels
 *   - Supports custom messages for different contexts
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type LoadingState = "loading" | "timeout" | "error";

interface FullScreenLoadingStateProps {
  /** Current loading state */
  state: LoadingState;
  /** Timeout in milliseconds before showing timeout state */
  timeout?: number;
  /** Error message if state is "error" */
  error?: string | null;
  /** Called when user taps retry */
  onRetry?: () => void;
  /** Optional loading message */
  message?: string;
  /** Show app logo/branding */
  showBranding?: boolean;
}

/**
 * Animated loader component
 */
function AnimatedLoader() {
  return (
    <div className="relative w-16 h-16" aria-hidden="true">
      {/* Outer ring */}
      <div className="absolute inset-0 border-4 border-mta-primary/20 rounded-full" />
      {/* Animated spinner */}
      <div className="absolute inset-0 border-4 border-mta-primary rounded-full border-t-transparent animate-spin" />
      {/* Center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 bg-mta-primary rounded-full animate-pulse" />
      </div>
    </div>
  );
}

/**
 * FullScreenLoadingState - Shows full-screen loading or error state
 */
export function FullScreenLoadingState({
  state,
  timeout = 15000,
  error,
  onRetry,
  message = "Loading...",
  showBranding = true,
}: FullScreenLoadingStateProps) {
  const [hasTimedOut, setHasTimedOut] = useState(false);

  // Handle timeout
  useEffect(() => {
    if (state !== "loading") {
      setHasTimedOut(false);
      return;
    }

    const timer = setTimeout(() => {
      setHasTimedOut(true);
    }, timeout);

    return () => clearTimeout(timer);
  }, [state, timeout]);

  // Loading state
  if (state === "loading" && !hasTimedOut) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <AnimatedLoader />
        {showBranding && (
          <h1 className="mt-6 text-xl font-semibold text-text-primary dark:text-dark-text-primary">
            MTA My Way
          </h1>
        )}
        <p className="mt-4 text-14 text-text-secondary dark:text-dark-text-secondary">{message}</p>
      </div>
    );
  }

  // Timeout state
  if (state === "loading" && hasTimedOut) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4"
        role="alert"
        aria-live="assertive"
      >
        <div className="max-w-md w-full text-center">
          {/* Timeout icon */}
          <div className="flex justify-center mb-4 text-warning" aria-hidden="true">
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
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          {/* Message */}
          <h2 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary mb-2">
            Taking longer than expected
          </h2>
          <p className="text-14 text-text-secondary dark:text-dark-text-secondary mb-6">
            This is taking longer than usual. The server might be slow, or your connection might be
            unstable.
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="w-full px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
              >
                Try again
              </button>
            )}
            <Link
              to="/"
              className="w-full px-4 py-3 bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary border border-border dark:border-dark-border rounded-lg font-medium min-h-touch hover:bg-background dark:hover:bg-dark-background transition-colors"
            >
              Go to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen bg-background dark:bg-dark-background p-4"
        role="alert"
        aria-live="assertive"
      >
        <div className="max-w-md w-full text-center">
          {/* Error icon */}
          <div className="flex justify-center mb-4 text-severe" aria-hidden="true">
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
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* Message */}
          <h2 className="text-xl font-semibold text-text-primary dark:text-dark-text-primary mb-2">
            Something went wrong
          </h2>
          <p className="text-14 text-text-secondary dark:text-dark-text-secondary mb-6">
            {error || "An unexpected error occurred while loading the app."}
          </p>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="w-full px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
              >
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full px-4 py-3 bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary border border-border dark:border-dark-border rounded-lg font-medium min-h-touch hover:bg-background dark:hover:bg-dark-background transition-colors"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * InlineLoadingState - Compact loading state for inline use
 */
interface InlineLoadingStateProps {
  /** Loading message */
  message?: string;
  /** Size of the loader */
  size?: "sm" | "md" | "lg";
  /** Center the loader */
  centered?: boolean;
}

export function InlineLoadingState({
  message,
  size = "md",
  centered = true,
}: InlineLoadingStateProps) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

  const textSizeClasses = {
    sm: "text-12",
    md: "text-13",
    lg: "text-14",
  };

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 p-4 ${
        centered ? "w-full h-full min-h-[200px]" : ""
      }`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={`${sizeClasses[size]} relative`} aria-hidden="true">
        <div className={`absolute inset-0 border-3 border-mta-primary/20 rounded-full`} />
        <div
          className={`absolute inset-0 border-3 border-mta-primary rounded-full border-t-transparent animate-spin`}
        />
      </div>
      {message && (
        <p className={`${textSizeClasses[size]} text-text-secondary dark:text-dark-text-secondary`}>
          {message}
        </p>
      )}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

export default FullScreenLoadingState;
