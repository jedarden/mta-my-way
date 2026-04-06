/**
 * NetworkRetryState - Fallback UI for network retry with countdown.
 *
 * Per plan.md Phase 4: Comprehensive error states with clear recovery options.
 *
 * Features:
 *   - Shows retry countdown with progress indication
 *   - Auto-retry with exponential backoff UI feedback
 *   - Manual retry button
 *   - Clear navigation options to escape error state
 *   - Accessible ARIA live regions
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface NetworkRetryStateProps {
  /** Current retry attempt number (1-indexed) */
  attempt: number;
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Seconds until next auto-retry */
  countdown: number;
  /** Whether a retry is currently in progress */
  isRetrying: boolean;
  /** Called when user taps retry manually */
  onRetry: () => void;
  /** Optional context for more specific messages */
  context?: string;
}

/**
 * Format retry message with attempt information
 */
function getRetryMessage(
  attempt: number,
  maxAttempts: number,
  context?: string
): {
  title: string;
  message: string;
} {
  const remainingAttempts = maxAttempts - attempt;

  if (context) {
    const contextLower = context.toLowerCase();
    if (contextLower.includes("trip")) {
      return {
        title: "Unable to track train",
        message:
          remainingAttempts > 0
            ? `Having trouble connecting. Retrying in {countdown} seconds... (${attempt}/${maxAttempts})`
            : "Couldn't establish connection after multiple attempts.",
      };
    }
    if (contextLower.includes("alert")) {
      return {
        title: "Unable to load alerts",
        message:
          remainingAttempts > 0
            ? `Service updates unavailable. Retrying in {countdown} seconds... (${attempt}/${maxAttempts})`
            : "Couldn't fetch alerts after multiple attempts.",
      };
    }
  }

  return {
    title: "Connection trouble",
    message:
      remainingAttempts > 0
        ? `Can't reach the server right now. Retrying in {countdown} seconds... (${attempt}/${maxAttempts})`
        : "Still having trouble connecting.",
  };
}

/**
 * NetworkRetryState - Shows retry countdown with manual retry option
 */
export function NetworkRetryState({
  attempt,
  maxAttempts,
  countdown,
  isRetrying,
  onRetry,
  context,
}: NetworkRetryStateProps) {
  const [displayCountdown, setDisplayCountdown] = useState(countdown);

  // Update displayed countdown every second
  useEffect(() => {
    setDisplayCountdown(countdown);
  }, [countdown]);

  const { title, message } = getRetryMessage(attempt, maxAttempts, context);
  const remainingAttempts = maxAttempts - attempt;
  const messageWithCountdown = message.replace("{countdown}", displayCountdown.toString());

  return (
    <div
      className="rounded-lg bg-surface dark:bg-dark-surface p-6 text-center"
      role="alert"
      aria-live="assertive"
      aria-busy={isRetrying}
    >
      {/* Connection issue icon */}
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
          className={isRetrying ? "animate-pulse" : ""}
        >
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>

      {/* Error message */}
      <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary mb-2">
        {title}
      </h2>
      <p className="text-14 text-text-secondary dark:text-dark-text-secondary mb-4">
        {messageWithCountdown}
      </p>

      {/* Visual progress indicator */}
      {remainingAttempts > 0 && (
        <div className="mb-4" aria-hidden="true">
          <div className="flex justify-center gap-1">
            {Array.from({ length: maxAttempts }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-8 rounded-full transition-colors duration-300 ${
                  i < attempt ? "bg-mta-primary" : "bg-surface dark:bg-dark-surface"
                }`}
                style={{ backgroundColor: i < attempt ? undefined : "" }}
              />
            ))}
          </div>
          <p className="text-11 text-text-secondary dark:text-dark-text-secondary mt-2">
            {remainingAttempts > 0
              ? `${remainingAttempts} retry ${remainingAttempts === 1 ? "attempt" : "attempts"} remaining`
              : "Max retries reached"}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="w-full px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          aria-label="Retry now"
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
                aria-hidden="true"
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
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Retry now
            </>
          )}
        </button>

        <Link
          to="/"
          className="w-full px-4 py-3 bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary border border-border dark:border-dark-border rounded-lg font-medium min-h-touch hover:bg-background dark:hover:bg-dark-background transition-colors text-center"
        >
          Go to home
        </Link>

        {/* Contextual secondary action */}
        {context?.includes("trip") && (
          <Link
            to="/search"
            className="w-full px-4 py-3 text-mta-primary font-medium min-h-touch hover:opacity-90 transition-opacity text-center"
          >
            Search for stations
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline version of NetworkRetryState for smaller spaces
 */
interface CompactNetworkRetryProps {
  /** Whether retry is in progress */
  isRetrying: boolean;
  /** Called when user taps retry */
  onRetry: () => void;
  /** Optional message override */
  message?: string;
}

export function CompactNetworkRetry({
  isRetrying,
  onRetry,
  message = "Having trouble connecting",
}: CompactNetworkRetryProps) {
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
          <path d="M1 1l22 22" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </span>
      <span className="flex-1 text-13 text-text-primary dark:text-dark-text-primary">
        {message}
      </span>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="text-13 text-mta-primary font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        type="button"
      >
        {isRetrying ? (
          <>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="animate-spin"
              aria-hidden="true"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Retrying...
          </>
        ) : (
          "Retry"
        )}
      </button>
    </div>
  );
}

export default NetworkRetryState;
