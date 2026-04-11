/**
 * SearchResults — renders a list of matching stations.
 *
 * Each row shows the station/complex name, borough, and line bullets.
 * Tapping a row navigates to /station/:stationId.
 * Includes a quick-add button to add/remove stations from favorites.
 */

import { Link } from "react-router-dom";
import { useFavorites } from "../../hooks/useFavorites";
import { encodeForAria, sanitizeUserInput } from "../../lib/outputEncoding";
import type { SearchResult } from "../../lib/stationSearch";
import { LineBullet } from "../arrivals/LineBullet";

const BOROUGH_LABELS: Record<string, string> = {
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  queens: "Queens",
  bronx: "The Bronx",
  statenisland: "Staten Island",
};

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  /** Show skeleton rows while station index is loading */
  loading?: boolean;
}

export function SearchResults({ results, query, loading }: SearchResultsProps) {
  const { favorites, addFavorite, removeFavorite } = useFavorites();

  // Helper to check if a station is favorited
  const isFavorited = (stationId: string) => {
    return favorites.some((f) => f.stationId === stationId);
  };

  // Handle favorite toggle - stop propagation to prevent navigation
  const handleFavoriteToggle = (e: React.MouseEvent<HTMLButtonElement>, result: SearchResult) => {
    e.preventDefault();
    e.stopPropagation();

    if (isFavorited(result.stationId)) {
      const favorite = favorites.find((f) => f.stationId === result.stationId);
      if (favorite) {
        removeFavorite(favorite.id);
      }
    } else {
      addFavorite({
        stationId: result.stationId,
        stationName: result.displayName,
        lines: result.lines,
        direction: "both",
        pinned: false,
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading stations">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg animate-pulse bg-surface dark:bg-dark-surface" />
        ))}
      </div>
    );
  }

  if (query.trim() && results.length === 0) {
    return (
      <div className="py-12 text-center" role="status">
        <p className="text-base font-medium text-text-primary dark:text-dark-text-primary mb-1">
          No stations found
        </p>
        <p className="text-13 text-text-secondary dark:text-dark-text-secondary">
          Try a different name, line letter, or neighborhood
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2" role="list" aria-label="Station search results">
      {results.map((result) => {
        const favorited = isFavorited(result.stationId);
        return (
          <Link
            key={result.stationId}
            to={`/station/${result.stationId}`}
            className="block p-4 bg-surface dark:bg-dark-surface rounded-lg hover:opacity-80 active:opacity-60 transition-opacity"
            role="listitem"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-text-primary dark:text-dark-text-primary truncate">
                  {sanitizeUserInput(result.displayName)}
                </div>
                <div className="text-13 text-text-secondary dark:text-dark-text-secondary mt-0.5">
                  {BOROUGH_LABELS[result.borough] ?? result.borough}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => handleFavoriteToggle(e, result)}
                aria-label={
                  favorited
                    ? `Remove ${encodeForAria(result.displayName)} from favorites`
                    : `Add ${encodeForAria(result.displayName)} to favorites`
                }
                aria-pressed={favorited}
                className="shrink-0 min-h-touch min-w-touch flex items-center justify-center p-1 -mr-1 -mt-1"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill={favorited ? "#0039A6" : "none"}
                  stroke={favorited ? "#0039A6" : "currentColor"}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {result.lines.map((line) => (
                <LineBullet key={line} line={line} size="sm" />
              ))}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
