/**
 * StationPicker - Bottom-sheet station search and select.
 *
 * Overlays above CommuteEditor (z-[60]/z-[70]) to let users search for
 * and pick a station. Calls onSelect(StationRef) when a result is tapped.
 */

import type { StationRef } from "@mta-my-way/shared";
import { useMemo, useState } from "react";
import { useStationIndex } from "../../hooks/useStationIndex";
import { searchStations } from "../../lib/stationSearch";
import { LineBullet } from "../arrivals/LineBullet";
import { StationSearch } from "../search/StationSearch";

interface StationPickerProps {
  title: string;
  onSelect: (station: StationRef) => void;
  onClose: () => void;
}

export function StationPicker({ title, onSelect, onClose }: StationPickerProps) {
  const [query, setQuery] = useState("");
  const { stations, complexes, loading } = useStationIndex();

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return searchStations(query, stations, complexes);
  }, [query, stations, complexes]);

  return (
    <>
      {/* Backdrop - above CommuteEditor */}
      <div
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed bottom-0 left-0 right-0 z-[70] bg-background dark:bg-dark-background rounded-t-2xl shadow-lg h-[85dvh] flex flex-col pb-[env(safe-area-inset-bottom)]"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-surface dark:bg-dark-surface" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 min-h-touch min-w-touch flex items-center justify-center text-text-secondary dark:text-dark-text-secondary hover:text-text-primary dark:hover:text-dark-text-primary rounded-lg"
            aria-label="Cancel"
          >
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
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-text-primary dark:text-dark-text-primary">
            {title}
          </h2>
        </div>

        {/* Search input */}
        <div className="px-4 pb-3 shrink-0">
          <StationSearch
            value={query}
            onChange={setQuery}
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading && stations.length === 0 ? (
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary py-4 text-center">
              Loading stations...
            </p>
          ) : !query.trim() ? (
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary py-4 text-center">
              Start typing to search stations
            </p>
          ) : results.length === 0 ? (
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary py-4 text-center">
              No stations found for "{query}"
            </p>
          ) : (
            <div className="space-y-2" role="list">
              {results.map((result) => (
                <button
                  key={result.stationId}
                  type="button"
                  onClick={() => {
                    onSelect({ stationId: result.stationId, stationName: result.displayName });
                    onClose();
                  }}
                  className="w-full text-left p-4 bg-surface dark:bg-dark-surface rounded-lg hover:opacity-80 active:opacity-60 min-h-touch transition-opacity"
                  role="listitem"
                >
                  <div className="font-medium text-text-primary dark:text-dark-text-primary mb-1">
                    {result.displayName}
                  </div>
                  <div className="text-13 text-text-secondary dark:text-dark-text-secondary mb-2">
                    {result.borough}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.lines.slice(0, 8).map((line) => (
                      <LineBullet key={line} line={line} size="sm" />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default StationPicker;
