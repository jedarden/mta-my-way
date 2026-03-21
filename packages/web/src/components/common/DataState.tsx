/**
 * DataState - Wrapper component for async data views.
 *
 * Handles the full lifecycle:
 *   loading  → skeleton that matches the shape of real content
 *   empty    → empty-state slot (no data and no error)
 *   error    → error message with optional retry
 *   offline  → offline banner, still renders stale data if available
 *   stale    → renders data with a "refreshing…" indicator
 *   success  → renders data normally
 */

import type { DataStatus } from "../../hooks/useArrivals";

interface DataStateProps<T> {
  status: DataStatus;
  data: T | null;
  error?: string | null;
  /** Rendered while loading with no data (no cached fallback) */
  skeleton?: React.ReactNode;
  /** Rendered when status is success/stale but data is empty */
  empty?: React.ReactNode;
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
  onRetry,
  children,
}: DataStateProps<T>) {
  // Pure loading: no data yet
  if ((status === "loading" || status === "idle") && !data) {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }

  // Error with no fallback data
  if (status === "error" && !data) {
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
  if (status === "offline" && !data) {
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
  const hasData = data !== null;

  return (
    <div className="relative">
      {/* Offline or error banner when we still have stale data */}
      {status === "offline" && hasData && (
        <div className="mb-2 px-3 py-1.5 bg-warning/10 rounded text-13 text-text-secondary dark:text-dark-text-secondary">
          Offline — showing last known data
        </div>
      )}
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

      {/* Stale refresh indicator */}
      {status === "stale" && (
        <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-mta-warning animate-pulse" />
      )}

      {/* Actual content */}
      {hasData ? (
        data !== null && Array.isArray(data) && (data as unknown[]).length === 0 && empty ? (
          <>{empty}</>
        ) : (
          <>{children(data as T)}</>
        )
      ) : null}
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
