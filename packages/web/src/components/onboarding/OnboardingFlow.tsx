/**
 * OnboardingFlow — GPS-powered 60-second first-time user setup.
 *
 * Flow:
 * 1. Location permission request
 * 2. Nearby stations (from GPS) → select as favorites
 * 3. Commute destination setup (optional)
 *
 * Each step has a "Skip" option. The flow creates REAL favorites,
 * not a separate "suggested" state.
 */

import { useState, useCallback, useEffect } from "react";
import { useFavoritesStore } from "../../stores";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useStationIndex } from "../../hooks/useStationIndex";
import { findNearbyStations, isInNYCArea, formatDistance } from "../../lib/nearbyStations";
import { getLineColor, getLineTextColor } from "@mta-my-way/shared";
import { StationSearch } from "../search/StationSearch";
import type { NearbyStation } from "../../lib/nearbyStations";
import type { Station } from "../../lib/api";

type OnboardingStep = "location" | "nearby" | "commute" | "search-fallback";

interface SelectedStation {
  stationId: string;
  stationName: string;
  lines: string[];
}

export default function OnboardingFlow() {
  const [step, setStep] = useState<OnboardingStep>("location");
  const [selectedStations, setSelectedStations] = useState<SelectedStation[]>([]);
  const [commuteDestination, setCommuteDestination] = useState<Station | null>(null);
  const [commuteName, setCommuteName] = useState("Work");

  const { addFavorite, addCommute, completeOnboarding } = useFavoritesStore();
  const { coordinates, permission, loading: geoLoading, error: geoError, requestLocation } = useGeolocation();
  const { stations, complexes, loading: stationsLoading } = useStationIndex();

  // When we get coordinates, find nearby stations
  const nearbyStations: NearbyStation[] = coordinates && !stationsLoading
    ? findNearbyStations(coordinates.lat, coordinates.lon, stations, complexes)
    : [];

  // If user is not in NYC area, fall back to search
  const userInNYC = coordinates ? isInNYCArea(coordinates.lat, coordinates.lon) : true;

  // Auto-advance when location is granted and we have nearby stations
  useEffect(() => {
    if (step === "location" && coordinates && !geoLoading) {
      if (!userInNYC || nearbyStations.length === 0) {
        setStep("search-fallback");
      } else {
        setStep("nearby");
      }
    }
  }, [step, coordinates, geoLoading, userInNYC, nearbyStations.length]);

  // Pre-select all nearby stations
  useEffect(() => {
    if (step === "nearby" && nearbyStations.length > 0) {
      setSelectedStations(
        nearbyStations.map((s) => ({
          stationId: s.stationId,
          stationName: s.stationName,
          lines: s.lines,
        }))
      );
    }
  }, [step, nearbyStations]);

  const handleSkip = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  const handleAllowLocation = useCallback(() => {
    requestLocation();
  }, [requestLocation]);

  const handleDenyLocation = useCallback(() => {
    setStep("search-fallback");
  }, []);

  const toggleStation = useCallback((stationId: string) => {
    setSelectedStations((prev) => {
      const exists = prev.find((s) => s.stationId === stationId);
      if (exists) {
        return prev.filter((s) => s.stationId !== stationId);
      }
      const station = nearbyStations.find((s) => s.stationId === stationId);
      if (station) {
        return [...prev, { stationId: station.stationId, stationName: station.stationName, lines: station.lines }];
      }
      return prev;
    });
  }, [nearbyStations]);

  const handleNearbyContinue = useCallback(() => {
    // Add selected stations as favorites
    selectedStations.forEach((station) => {
      addFavorite({
        stationId: station.stationId,
        stationName: station.stationName,
        lines: station.lines,
        direction: "both",
        label: undefined,
      });
    });
    setStep("commute");
  }, [selectedStations, addFavorite]);

  const handleSkipCommute = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  const handleAddCommute = useCallback(() => {
    if (commuteDestination && selectedStations.length > 0) {
      // Use the first selected station as origin
      const origin = selectedStations[0]!;
      addCommute({
        name: commuteName,
        origin: { stationId: origin.stationId, stationName: origin.stationName },
        destination: { stationId: commuteDestination.id, stationName: commuteDestination.name },
        preferredLines: [],
        enableTransferSuggestions: true,
      });
    }
    completeOnboarding();
  }, [commuteDestination, selectedStations, commuteName, addCommute, completeOnboarding]);

  const handleSearchFallbackSelect = useCallback((station: Station) => {
    addFavorite({
      stationId: station.id,
      stationName: station.name,
      lines: station.lines,
      direction: "both",
      label: undefined,
    });
    setCommuteDestination(station);
    setStep("commute");
  }, [addFavorite]);

  const handleSearchFallbackSkip = useCallback(() => {
    completeOnboarding();
  }, [completeOnboarding]);

  // Render based on step
  if (step === "location") {
    return (
      <LocationStep
        permission={permission}
        loading={geoLoading}
        error={geoError}
        onAllow={handleAllowLocation}
        onDeny={handleDenyLocation}
        onSkip={handleSkip}
      />
    );
  }

  if (step === "nearby") {
    return (
      <NearbyStationsStep
        stations={nearbyStations}
        selected={selectedStations}
        onToggle={toggleStation}
        onContinue={handleNearbyContinue}
        onSkip={handleSkip}
      />
    );
  }

  if (step === "search-fallback") {
    return (
      <SearchFallbackStep
        onSelect={handleSearchFallbackSelect}
        onSkip={handleSearchFallbackSkip}
      />
    );
  }

  if (step === "commute") {
    return (
      <CommuteSetupStep
        originName={selectedStations[0]?.stationName ?? "your station"}
        destination={commuteDestination}
        commuteName={commuteName}
        onCommuteNameChange={setCommuteName}
        onDestinationChange={setCommuteDestination}
        onAddCommute={handleAddCommute}
        onSkip={handleSkipCommute}
      />
    );
  }

  return null;
}

// =============================================================================
// Step Components
// =============================================================================

interface LocationStepProps {
  permission: string;
  loading: boolean;
  error: string | null;
  onAllow: () => void;
  onDeny: () => void;
  onSkip: () => void;
}

function LocationStep({ permission, loading, error, onAllow, onDeny, onSkip }: LocationStepProps) {
  const isDenied = permission === "denied";

  return (
    <div className="flex flex-col items-center justify-center min-h-[80dvh] text-center px-6">
      <div className="w-20 h-20 mb-6 rounded-full bg-mta-primary flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="w-10 h-10 text-white"
        >
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-2">
        Find nearby stations
      </h2>

      <p className="text-text-secondary dark:text-dark-text-secondary mb-6 max-w-xs">
        We'll find the 3 closest subway stations to get you started in under 60 seconds.
      </p>

      {error && (
        <p className="text-red-500 text-sm mb-4 max-w-xs">
          {error}
        </p>
      )}

      {isDenied ? (
        <>
          <p className="text-text-secondary dark:text-dark-text-secondary text-sm mb-4 max-w-xs">
            Location access was denied. You can search for stations manually instead.
          </p>
          <button
            type="button"
            onClick={onDeny}
            className="w-full max-w-xs px-6 py-3 bg-mta-primary text-white rounded-lg font-semibold mb-3 min-h-touch"
          >
            Search for stations
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onAllow}
          disabled={loading}
          className="w-full max-w-xs px-6 py-3 bg-mta-primary text-white rounded-lg font-semibold mb-3 min-h-touch disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Getting location...
            </span>
          ) : (
            "Allow Location Access"
          )}
        </button>
      )}

      <button
        type="button"
        onClick={onSkip}
        className="text-text-secondary dark:text-dark-text-secondary min-h-touch px-4"
      >
        Skip for now
      </button>
    </div>
  );
}

interface NearbyStationsStepProps {
  stations: NearbyStation[];
  selected: SelectedStation[];
  onToggle: (stationId: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}

function NearbyStationsStep({ stations, selected, onToggle, onContinue, onSkip }: NearbyStationsStepProps) {
  const selectedSet = new Set(selected.map((s) => s.stationId));

  return (
    <div className="flex flex-col min-h-[80dvh] px-4 py-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-2">
          Nearby Stations
        </h2>
        <p className="text-text-secondary dark:text-dark-text-secondary">
          Tap to keep or remove. We found {stations.length} stations near you.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {stations.map((station) => {
          const isSelected = selectedSet.has(station.stationId);
          return (
            <button
              key={station.stationId}
              type="button"
              onClick={() => onToggle(station.stationId)}
              className={`w-full p-4 rounded-xl text-left transition-all min-h-touch ${
                isSelected
                  ? "bg-mta-primary text-white shadow-md scale-[1.02]"
                  : "bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{station.stationName}</div>
                  <div className={`text-sm ${isSelected ? "text-white/80" : "text-text-secondary dark:text-dark-text-secondary"}`}>
                    {station.borough} • {formatDistance(station.distanceKm)} • {station.walkingMinutes} min walk
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {station.lines.slice(0, 5).map((line) => (
                    <span
                      key={line}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: isSelected ? "#fff" : getLineColor(line),
                        color: isSelected ? getLineColor(line) : getLineTextColor(line),
                      }}
                    >
                      {line}
                    </span>
                  ))}
                  {station.lines.length > 5 && (
                    <span className={`text-xs ${isSelected ? "text-white/80" : "text-text-secondary"}`}>
                      +{station.lines.length - 5}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="pt-4 space-y-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={selected.length === 0}
          className="w-full px-6 py-3 bg-mta-primary text-white rounded-lg font-semibold disabled:opacity-50 min-h-touch"
        >
          Continue {selected.length > 0 && `(${selected.length} selected)`}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-text-secondary dark:text-dark-text-secondary min-h-touch"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

interface SearchFallbackStepProps {
  onSelect: (station: Station) => void;
  onSkip: () => void;
}

function SearchFallbackStep({ onSelect, onSkip }: SearchFallbackStepProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Station[]>([]);
  const { stations } = useStationIndex();

  // Simple client-side search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    const query = searchQuery.toLowerCase();
    const filtered = stations
      .filter((s) =>
        s.name.toLowerCase().includes(query) ||
        s.lines.some((l) => l.toLowerCase() === query)
      )
      .slice(0, 10);
    setResults(filtered);
  }, [searchQuery, stations]);

  return (
    <div className="flex flex-col min-h-[80dvh] px-4 py-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-2">
          Add Your First Station
        </h2>
        <p className="text-text-secondary dark:text-dark-text-secondary">
          Search for a station you use regularly.
        </p>
      </div>

      <StationSearch
        value={searchQuery}
        onChange={setSearchQuery}
        autoFocus
      />

      <div className="flex-1 mt-4 overflow-y-auto">
        {results.length > 0 ? (
          <div className="space-y-2">
            {results.map((station) => (
              <button
                key={station.id}
                type="button"
                onClick={() => onSelect(station)}
                className="w-full p-4 bg-surface dark:bg-dark-surface rounded-lg text-left hover:bg-opacity-80 transition-colors min-h-touch"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-text-primary dark:text-dark-text-primary">
                      {station.name}
                    </div>
                    <div className="text-sm text-text-secondary dark:text-dark-text-secondary">
                      {station.borough}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {station.lines.slice(0, 4).map((line) => (
                      <span
                        key={line}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                        style={{
                          backgroundColor: getLineColor(line),
                          color: getLineTextColor(line),
                        }}
                      >
                        {line}
                      </span>
                    ))}
                    {station.lines.length > 4 && (
                      <span className="text-xs text-text-secondary">
                        +{station.lines.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : searchQuery ? (
          <p className="text-center text-text-secondary dark:text-dark-text-secondary mt-8">
            No stations found. Try a different search.
          </p>
        ) : (
          <div className="text-center mt-8">
            <p className="text-text-secondary dark:text-dark-text-secondary mb-4">
              Search by station name or line (e.g., "Times Sq" or "1")
            </p>
          </div>
        )}
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-text-secondary dark:text-dark-text-secondary min-h-touch"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

interface CommuteSetupStepProps {
  originName: string;
  destination: Station | null;
  commuteName: string;
  onCommuteNameChange: (name: string) => void;
  onDestinationChange: (station: Station | null) => void;
  onAddCommute: () => void;
  onSkip: () => void;
}

function CommuteSetupStep({
  originName,
  destination,
  commuteName,
  onCommuteNameChange,
  onDestinationChange,
  onAddCommute,
  onSkip,
}: CommuteSetupStepProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Station[]>([]);
  const { stations } = useStationIndex();

  // Simple client-side search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }
    const query = searchQuery.toLowerCase();
    const filtered = stations
      .filter((s) =>
        s.name.toLowerCase().includes(query) ||
        s.lines.some((l) => l.toLowerCase() === query)
      )
      .slice(0, 8);
    setResults(filtered);
  }, [searchQuery, stations]);

  const handleSelectDestination = (station: Station) => {
    onDestinationChange(station);
    setSearchQuery("");
  };

  return (
    <div className="flex flex-col min-h-[80dvh] px-4 py-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface dark:bg-dark-surface flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-8 h-8 text-text-primary dark:text-dark-text-primary"
          >
            <path d="M12 22c-4.2 0-7-1.667-7-5 4-2 3-6 0-8 0-3.333 2.8-5 7-5s7 1.667 7 5c-3 2-4 6 0 8 0 3.333-2.8 5-7 5Z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text-primary dark:text-dark-text-primary mb-2">
          Where do you commute to?
        </h2>
        <p className="text-text-secondary dark:text-dark-text-secondary">
          Add your regular commute and we'll suggest the fastest routes.
        </p>
      </div>

      <div className="flex-1 space-y-4">
        {/* Commute name */}
        <div>
          <label className="block text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
            Commute name
          </label>
          <div className="flex gap-2">
            {["Work", "Home", "School"].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onCommuteNameChange(name)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors min-h-touch ${
                  commuteName === name
                    ? "bg-mta-primary text-white"
                    : "bg-surface dark:bg-dark-surface text-text-primary dark:text-dark-text-primary"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Origin (display only) */}
        <div>
          <label className="block text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
            From
          </label>
          <div className="px-4 py-3 bg-surface dark:bg-dark-surface rounded-lg text-text-primary dark:text-dark-text-primary">
            {originName}
          </div>
        </div>

        {/* Destination search */}
        <div>
          <label className="block text-sm font-medium text-text-secondary dark:text-dark-text-secondary mb-1">
            To
          </label>
          {destination ? (
            <div className="flex items-center justify-between px-4 py-3 bg-surface dark:bg-dark-surface rounded-lg">
              <span className="text-text-primary dark:text-dark-text-primary font-medium">
                {destination.name}
              </span>
              <button
                type="button"
                onClick={() => onDestinationChange(null)}
                className="text-text-secondary hover:text-text-primary min-h-touch min-w-touch flex items-center justify-center"
                aria-label="Clear destination"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <StationSearch
                value={searchQuery}
                onChange={setSearchQuery}
              />
              {results.length > 0 && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {results.map((station) => (
                    <button
                      key={station.id}
                      type="button"
                      onClick={() => handleSelectDestination(station)}
                      className="w-full p-3 bg-surface dark:bg-dark-surface rounded-lg text-left hover:bg-opacity-80 transition-colors min-h-touch"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-text-primary dark:text-dark-text-primary font-medium">
                          {station.name}
                        </span>
                        <div className="flex gap-1">
                          {station.lines.slice(0, 3).map((line) => (
                            <span
                              key={line}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                              style={{
                                backgroundColor: getLineColor(line),
                                color: getLineTextColor(line),
                              }}
                            >
                              {line}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="pt-4 space-y-3">
        <button
          type="button"
          onClick={onAddCommute}
          disabled={!destination}
          className="w-full px-6 py-3 bg-mta-primary text-white rounded-lg font-semibold disabled:opacity-50 min-h-touch"
        >
          Add Commute
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-text-secondary dark:text-dark-text-secondary min-h-touch"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
