/**
 * SearchScreen — type-ahead station search.
 *
 * The station index (~94 KB) is loaded once from the API and cached in module
 * scope. Subsequent visits to this screen incur zero network requests.
 * The Service Worker additionally caches the API response across page loads.
 *
 * Search is fully client-side for instant responsiveness (no round-trip latency).
 */

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LineBullet } from "../components/arrivals/LineBullet";
import { SearchResults } from "../components/search/SearchResults";
import { StationSearch } from "../components/search/StationSearch";
import Screen from "../components/layout/Screen";
import { useStationIndex } from "../hooks/useStationIndex";
import { searchStations } from "../lib/stationSearch";

const POPULAR_STATIONS = [
  {
    id: "725",
    name: "Times Sq-42 St",
    lines: ["1", "2", "3", "7", "N", "Q", "R", "W"],
    borough: "Manhattan",
  },
  {
    id: "635",
    name: "Grand Central-42 St",
    lines: ["4", "5", "6", "7", "S"],
    borough: "Manhattan",
  },
  {
    id: "127",
    name: "34 St-Penn Station",
    lines: ["1", "2", "3"],
    borough: "Manhattan",
  },
  {
    id: "631",
    name: "Union Sq-14 St",
    lines: ["4", "5", "6", "L", "N", "Q", "R", "W"],
    borough: "Manhattan",
  },
  {
    id: "A27",
    name: "Jay St-MetroTech",
    lines: ["A", "C", "F", "R"],
    borough: "Brooklyn",
  },
];

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const { stations, complexes, loading, error } = useStationIndex();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchStations(query, stations, complexes);
  }, [query, stations, complexes]);

  const hasQuery = query.trim().length > 0;

  return (
    <Screen>
      <div className="px-4 pt-2 pb-4">
        <StationSearch value={query} onChange={setQuery} autoFocus />

      <div className="mt-4">
        {error && !hasQuery && (
          <p className="text-13 text-text-secondary dark:text-dark-text-secondary text-center py-4">
            Could not load station data. Check your connection and try again.
          </p>
        )}

        {hasQuery ? (
          <SearchResults
            results={results}
            query={query}
            loading={loading && stations.length === 0}
          />
        ) : (
          <PopularStations />
        )}
      </div>
    </Screen>
  );
}

function PopularStations() {
  return (
    <div>
      <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-2">
        Popular stations
      </p>
      <div className="space-y-2" role="list">
        {POPULAR_STATIONS.map((station) => (
          <Link
            key={station.id}
            to={`/station/${station.id}`}
            className="block p-4 bg-surface dark:bg-dark-surface rounded-lg hover:opacity-80 active:opacity-60 transition-opacity"
            role="listitem"
          >
            <div className="font-medium text-text-primary dark:text-dark-text-primary mb-1">
              {station.name}
            </div>
            <div className="text-13 text-text-secondary dark:text-dark-text-secondary mb-2">
              {station.borough}
            </div>
            <div className="flex flex-wrap gap-1">
              {station.lines.map((line) => (
                <LineBullet key={line} line={line} size="sm" />
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
