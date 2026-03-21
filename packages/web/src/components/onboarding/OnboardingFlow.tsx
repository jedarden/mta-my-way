import { useState } from "react";
import { useFavoritesStore } from "../../stores";

/** GPS-powered 60-second onboarding flow */
export default function OnboardingFlow() {
  const [step, setStep] = useState<"location" | "nearby" | "commute" | "done">("location");
  const { addFavorite, completeOnboarding } = useFavoritesStore();

  const handleSkip = () => {
    completeOnboarding();
  };

  const handleAllowLocation = () => {
    // In a real implementation, we'd request geolocation here
    // For now, just move to the next step
    setStep("nearby");
  };

  const handleSelectStations = (selectedStations: Array<{ stationId: string; stationName: string; lines: string[] }>) => {
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
  };

  const handleSkipCommute = () => {
    completeOnboarding();
  };

  const handleAddCommute = () => {
    // In a real implementation, this would open a commute configuration modal
    completeOnboarding();
  };

  if (step === "location") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="w-20 h-20 mb-6 rounded-full bg-[#0039A6] flex items-center justify-center">
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
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
          Find nearby stations
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-6 max-w-xs">
          We'll find the 3 closest subway stations to get you started quickly
        </p>
        <button
          type="button"
          onClick={handleAllowLocation}
          className="w-full max-w-xs px-6 py-3 bg-[#0039A6] text-white rounded-lg font-semibold mb-3"
        >
          Allow Location Access
        </button>
        <button
          type="button"
          onClick={handleSkip}
          className="text-[var(--color-text-secondary)]"
        >
          Skip for now
        </button>
      </div>
    );
  }

  if (step === "nearby") {
    // Mock nearby stations - in real implementation this would use geolocation
    const nearbyStations = [
      { stationId: "725", stationName: "Times Sq-42 St", lines: ["1", "2", "3", "7"] },
      { stationId: "635", stationName: "34 St-Herald Sq", lines: ["B", "D", "F", "M", "N", "Q", "R", "W"] },
      { stationId: "127", stationName: "14 St-Union Sq", lines: ["4", "5", "6", "L", "N", "Q", "R", "W"] },
    ];

    return (
      <NearbyStationsStep
        stations={nearbyStations}
        onSelect={handleSelectStations}
        onSkip={handleSkip}
      />
    );
  }

  if (step === "commute") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="w-20 h-20 mb-6 rounded-full bg-[var(--color-surface)] flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-10 h-10 text-[var(--color-text-primary)]"
          >
            <path d="M12 22c-4.2 0-7-1.667-7-5 4-2 3-6 0-8 0-3.333 2.8-5 7-5s7 1.667 7 5c-3 2-4 6 0 8 0 3.333-2.8 5-7 5Z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
          Where do you commute to?
        </h2>
        <p className="text-[var(--color-text-secondary)] mb-6 max-w-xs">
          Add your regular commute and we'll suggest the fastest routes
        </p>
        <button
          type="button"
          onClick={handleAddCommute}
          className="w-full max-w-xs px-6 py-3 bg-[#0039A6] text-white rounded-lg font-semibold mb-3"
        >
          Add Commute
        </button>
        <button
          type="button"
          onClick={handleSkipCommute}
          className="text-[var(--color-text-secondary)]"
        >
          Skip for now
        </button>
      </div>
    );
  }

  return null;
}

interface NearbyStationsStepProps {
  stations: Array<{ stationId: string; stationName: string; lines: string[] }>;
  onSelect: (selected: Array<{ stationId: string; stationName: string; lines: string[] }>) => void;
  onSkip: () => void;
}

function NearbyStationsStep({ stations, onSelect, onSkip }: NearbyStationsStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(stations.map((s) => s.stationId)));

  const toggleStation = (stationId: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(stationId)) {
      newSelected.delete(stationId);
    } else {
      newSelected.add(stationId);
    }
    setSelected(newSelected);
  };

  const handleContinue = () => {
    const selectedStations = stations.filter((s) => selected.has(s.stationId));
    onSelect(selectedStations);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">
          Nearby Stations
        </h2>
        <p className="text-[var(--color-text-secondary)]">
          Keep the ones you use, remove the rest
        </p>
      </div>

      <div className="flex-1 space-y-3">
        {stations.map((station) => (
          <button
            key={station.stationId}
            type="button"
            onClick={() => toggleStation(station.stationId)}
            className={`w-full p-4 rounded-lg text-left transition-colors ${
              selected.has(station.stationId)
                ? "bg-[#0039A6] text-white"
                : "bg-[var(--color-surface)] text-[var(--color-text-primary)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{station.stationName}</span>
              <div className="flex gap-1">
                {station.lines.map((line) => (
                  <span
                    key={line}
                    className="line-bullet text-xs"
                    style={{ backgroundColor: selected.has(station.stationId) ? "#fff" : getLineColor(line), color: selected.has(station.stationId) ? "#0039A6" : "#fff" }}
                  >
                    {line.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="pt-4 space-y-3">
        <button
          type="button"
          onClick={handleContinue}
          disabled={selected.size === 0}
          className="w-full px-6 py-3 bg-[#0039A6] text-white rounded-lg font-semibold disabled:opacity-50"
        >
          Continue ({selected.size} selected)
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-[var(--color-text-secondary)]"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function getLineColor(line: string): string {
  const colors: Record<string, string> = {
    "1": "#EE352E", "2": "#EE352E", "3": "#EE352E",
    "4": "#00933C", "5": "#00933C", "6": "#00933C",
    "7": "#B933AD",
    a: "#0039A6", c: "#0039A6", e: "#0039A6",
    b: "#FF6319", d: "#FF6319", f: "#FF6319", m: "#FF6319",
    g: "#6CBE45",
    j: "#996633", z: "#996633",
    l: "#A7A9AC",
    n: "#FCCC0A", q: "#FCCC0A", r: "#FCCC0A", w: "#FCCC0A",
    s: "#808183",
  };
  return colors[line.toLowerCase()] ?? "#808183";
}
