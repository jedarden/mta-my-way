/**
 * DataState - Wrapper component for async data views.
 *
 * Handles the full lifecycle per plan.md Section 13:
 *   loading  → skeleton that matches the shape of real content (never a spinner)
 *   empty    → contextual guidance with optional action
 *   error    → plain-language explanation + retry button
 *   offline  → offline banner, still renders stale data if available
 *   stale    → renders data with amber "Updated X min ago" banner
 *   success  → renders data normally
 *
 * Usage:
 *   <DataState
 *     status={query.status}
 *     data={query.data}
 *     error={query.error}
 *     skeleton={<FavoriteCardSkeleton count={3} />}
 *     empty={<EmptyFavorites />}
 *     staleTimestamp={query.updatedAt}
 *     onRetry={() => query.refetch()}
 *   >
 *     {(data) => <FavoritesList favorites={data} />}
 *   </DataState>
 */

import { formatTimeAgo } from "@mta-my-way/shared";
import { useEffect, useState } from "react";
import type { DataStatus } from "../../hooks/useArrivals";

interface DataStateProps<T> {
  /** Current data fetch status */
  status: DataStatus;
  /** The fetched data (may be null during loading) */
  data: T | null;
  /** Error message if status is 'error' */
  error?: string | null;
  /** Rendered while loading with no data (no cached fallback) */
  skeleton?: React.ReactNode;
  /** Rendered when status is success/stale but data is empty array */
  empty?: React.ReactNode;
  /** Timestamp (ms) for stale data age calculation */
  staleTimestamp?: number | null;
  /** Called when the user taps the retry button on error */
  onRetry?: () => void;
  /** Renders actual content; called whenever data is non-null */
  children: (data: T) => React.ReactNode;
}

export function DataState<T>({
  status,
  data,
  error,
  skeleton,
  empty,
  staleTimestamp,
  onRetry,
  children,
}: DataStateProps<T>) {
  // Track stale time text for "Updated X min ago" display
  const [staleTimeText, setStaleTimeText] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "stale" || !staleTimestamp) {
      setStaleTimeText(null);
      return;
    }

    const update = () => {
      const seconds = Math.floor((Date.now() - staleTimestamp) / 1000);
      setStaleTimeText(formatTimeAgo(seconds));
    };

    update();
    const interval = setInterval(update, 15_000);
    return () => clearInterval(interval);
  }, [status, staleTimestamp]);

  // True when we have no meaningful data to show (null or empty array)
  const isDataEmpty = !data || (Array.isArray(data) && (data as unknown[]).length === 0);

  // Pure loading: no data yet (null) or initial empty array before first fetch
  if ((status === "loading" || status === "idle") && isDataEmpty) {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }

  // Error with no fallback data
  if (status === "error" && isDataEmpty) {
    return (
      <div className="rounded-lg bg-surface dark:bg-dark-surface p-4 text-center">
        <p className="text-base text-text-primary dark:text-dark-text-primary mb-1">
          Unable to load data
        </p>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-3">
          {error ?? "Something went wrong"}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-mta-primary text-white rounded font-medium text-13 min-h-touch"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  // Offline with no fallback data
  if (status === "offline" && isDataEmpty) {
    return (
      <div className="rounded-lg bg-surface dark:bg-dark-surface p-4 text-center">
        <p className="text-base text-text-primary dark:text-dark-text-primary mb-1">
          You're offline
        </p>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
          No cached data available
        </p>
      </div>
    );
  }

  // We have data (possibly stale or with an offline/error overlay)
  const hasData = !isDataEmpty;
  const isEmptyArray = data !== null && Array.isArray(data) && (data as unknown[]).length === 0;

  return (
    <div className="relative">
      {/* Stale data banner - amber "Updated X min ago" */}
      {status === "stale" && hasData && staleTimeText && (
        <div className="stale-banner mb-2" role="status" aria-live="polite">
          <svg
            width="14"
            height="14"
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
          <span>Updated {staleTimeText}</span>
        </div>
      )}

      {/* Offline banner when we still have stale data */}
      {status === "offline" && hasData && (
        <div
          className="mb-2 px-3 py-1.5 bg-warning/10 rounded text-13 text-text-secondary dark:text-dark-text-secondary flex items-center gap-1.5"
          role="status"
          aria-live="polite"
        >
          <svg
            width="14"
            height="14"
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
          Offline — showing last known data
        </div>
      )}

      {/* Error banner when we still have stale data */}
      {status === "error" && hasData && (
        <div className="mb-2 px-3 py-1.5 flex items-center justify-between gap-2 bg-surface dark:bg-dark-surface rounded">
          <span className="text-13 text-text-secondary dark:text-dark-text-secondary">
            {error ?? "Update failed"}
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-13 text-mta-primary font-medium min-h-touch px-2"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Actual content */}
      {hasData ? isEmptyArray && empty ? <>{empty}</> : <>{children(data as T)}</> : null}
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-16 rounded-lg animate-pulse bg-surface dark:bg-dark-surface" />
      ))}
    </div>
  );
}

export default DataState;
