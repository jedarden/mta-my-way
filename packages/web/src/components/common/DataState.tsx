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
 *
 * Per plan.md Phase 4: Enhanced with ApiErrorDisplay for better error UX.
 */

import { formatTimeAgo } from "@mta-my-way/shared";
import { useEffect, useState } from "react";
import type { DataStatus } from "../../hooks/useArrivals";
import { ApiErrorType } from "../../lib/apiEnhanced";
import { ApiErrorDisplay } from "./ApiErrorDisplay";

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
      <ApiErrorDisplay
        error={error ?? "Something went wrong"}
        errorType={ApiErrorType.UNKNOWN}
        canRetry={!!onRetry}
        isRetrying={false}
        onRetry={onRetry}
      />
    );
  }

  // Offline with no fallback data
  if (status === "offline" && isDataEmpty) {
    return (
      <ApiErrorDisplay
        error={error ?? "No cached data available"}
        errorType={ApiErrorType.OFFLINE}
        canRetry={!!onRetry}
        isRetrying={false}
        onRetry={onRetry}
      />
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
        <div className="mb-2">
          <ApiErrorDisplay
            error="Offline — showing last known data"
            errorType={ApiErrorType.OFFLINE}
            canRetry={!!onRetry}
            isRetrying={false}
            onRetry={onRetry}
            compact
          />
        </div>
      )}

      {/* Error banner when we still have stale data */}
      {status === "error" && hasData && (
        <div className="mb-2">
          <ApiErrorDisplay
            error={error ?? "Update failed"}
            errorType={ApiErrorType.UNKNOWN}
            canRetry={!!onRetry}
            isRetrying={false}
            onRetry={onRetry}
            compact
          />
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
