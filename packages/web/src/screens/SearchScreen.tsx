import { useState } from "react";
import { Link } from "react-router-dom";

export default function SearchScreen() {
  const [query, setQuery] = useState("");

  return (
    <div className="p-4">
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stations..."
          className="w-full px-4 py-3 bg-surface dark:bg-dark-surface rounded-lg text-text-primary dark:text-dark-text-primary placeholder:text-text-secondary dark:placeholder:text-dark-text-secondary min-h-touch focus:outline-none focus:ring-2 focus:ring-mta-primary"
          aria-label="Search stations"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      <div className="mt-4">
        {query ? (
          <p className="text-text-secondary dark:text-dark-text-secondary text-center py-8">
            Searching for "{query}"...
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-13 text-text-secondary dark:text-dark-text-secondary mb-2">
              Popular stations
            </p>
            {[
              { id: "725", name: "Times Sq-42 St", lines: ["1", "2", "3", "7", "N", "Q", "R", "W"] },
              { id: "635", name: "Grand Central-42 St", lines: ["4", "5", "6", "7", "S"] },
              { id: "101", name: "South Ferry", lines: ["1", "R", "W"] },
            ].map((station) => (
              <Link
                key={station.id}
                to={`/station/${station.id}`}
                className="block p-4 bg-surface dark:bg-dark-surface rounded-lg hover:opacity-80 transition-opacity"
              >
                <div className="font-medium text-text-primary dark:text-dark-text-primary">
                  {station.name}
                </div>
                <div className="flex gap-1 mt-1">
                  {station.lines.map((line) => (
                    <span
                      key={line}
                      className="line-bullet text-11"
                      style={{ backgroundColor: `var(--mta-${line.toLowerCase()})` }}
                    >
                      {line}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
