/**
 * EmptyState - Contextual empty state components for each data type.
 *
 * Per plan.md Section 13:
 *   empty → Contextual guidance with optional action
 *
 * Each empty state:
 *   - Explains why there's no data
 *   - Provides a clear action to resolve it (when applicable)
 *   - Uses consistent styling
 */

import { Link } from "react-router-dom";

interface EmptyStateBaseProps {
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * EmptyFavorites - Shown when user has no favorite stations
 */
export function EmptyFavorites({ className = "" }: EmptyStateBaseProps) {
  return (
    <div
      className={`bg-surface dark:bg-dark-surface rounded-lg p-6 text-center ${className}`}
      role="status"
    >
      <p className="text-text-secondary dark:text-dark-text-secondary mb-1 text-base">
        No favorites yet
      </p>
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-4">
        Search for a station to add it here
      </p>
      <Link
        to="/search"
        className="inline-flex items-center justify-center px-5 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
      >
        Add your first station
      </Link>
    </div>
  );
}

/**
 * EmptyCommutes - Shown when user has no configured commutes
 */
export function EmptyCommutes({
  onAdd,
  className = "",
}: EmptyStateBaseProps & { onAdd: () => void }) {
  return (
    <div
      className={`bg-surface dark:bg-dark-surface rounded-lg p-6 text-center ${className}`}
      role="status"
    >
      <p className="text-text-secondary dark:text-dark-text-secondary mb-1 text-base">
        No commutes configured
      </p>
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-4">
        Add a commute to see transfer analysis and route comparisons
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center justify-center px-4 py-3 bg-mta-primary text-white rounded-lg font-medium min-h-touch hover:opacity-90 transition-opacity"
      >
        Plan a commute
      </button>
    </div>
  );
}

/**
 * EmptyArrivals - Shown when a station has no upcoming arrivals
 * (e.g., overnight service gap)
 */
export function EmptyArrivals({
  message = "No upcoming arrivals",
  subtext = "Trains may not be running at this hour",
  className = "",
}: EmptyStateBaseProps & {
  message?: string;
  subtext?: string;
}) {
  return (
    <div
      className={`bg-surface dark:bg-dark-surface rounded-lg p-6 text-center ${className}`}
      role="status"
    >
      <p className="text-text-secondary dark:text-dark-text-secondary mb-1 text-base">{message}</p>
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary">{subtext}</p>
    </div>
  );
}

/**
 * EmptyAlerts - Shown when there are no alerts to display
 */
export function EmptyAlerts({
  message = "No active alerts",
  subtext,
  className = "",
}: EmptyStateBaseProps & {
  message?: string;
  subtext?: string;
}) {
  return (
    <div
      className={`bg-surface dark:bg-dark-surface rounded-lg p-6 text-center ${className}`}
      role="status"
    >
      <p className="text-text-secondary dark:text-dark-text-secondary mb-1 text-base">{message}</p>
      {subtext && (
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">{subtext}</p>
      )}
    </div>
  );
}

/**
 * EmptySearchResults - Shown when station search returns no matches
 */
export function EmptySearchResults({
  query,
  className = "",
}: EmptyStateBaseProps & { query: string }) {
  return (
    <div
      className={`bg-surface dark:bg-dark-surface rounded-lg p-6 text-center ${className}`}
      role="status"
    >
      <p className="text-text-secondary dark:text-dark-text-secondary mb-1 text-base">
        No stations found
      </p>
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
        No results for "{query}". Try a different search term.
      </p>
    </div>
  );
}

/**
 * EmptyJournal - Shown when the trip journal is empty (Phase 5)
 */
export function EmptyJournal({ className = "" }: EmptyStateBaseProps) {
  return (
    <div
      className={`bg-surface dark:bg-dark-surface rounded-lg p-6 text-center ${className}`}
      role="status"
    >
      <p className="text-text-secondary dark:text-dark-text-secondary">
        Your trip history will appear here
      </p>
    </div>
  );
}

export default EmptyFavorites;
