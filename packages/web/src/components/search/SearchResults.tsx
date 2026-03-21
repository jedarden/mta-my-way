/**
 * SearchResults — renders a list of matching stations.
 *
 * Each row shows the station/complex name, borough, and line bullets.
 * Tapping a row navigates to /station/:stationId.
 */

import { Link } from "react-router-dom";
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
      {results.map((result) => (
        <Link
          key={result.stationId}
          to={`/station/${result.stationId}`}
          className="block p-4 bg-surface dark:bg-dark-surface rounded-lg hover:opacity-80 active:opacity-60 transition-opacity"
          role="listitem"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <div className="font-medium text-text-primary dark:text-dark-text-primary truncate">
                {result.displayName}
              </div>
              <div className="text-13 text-text-secondary dark:text-dark-text-secondary mt-0.5">
                {BOROUGH_LABELS[result.borough] ?? result.borough}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {result.lines.map((line) => (
              <LineBullet key={line} line={line} size="sm" />
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
