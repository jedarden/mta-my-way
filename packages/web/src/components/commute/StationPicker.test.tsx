/**
 * Tests for StationPicker component
 *
 * Covers the bottom-sheet station search:
 * - Dialog role/label and focus hand-off to the search input
 * - Loading, empty-query, no-result and result states (real search logic)
 * - Complex-aware display names and the 8-line cap on result badges
 * - Selection callbacks, cancel, backdrop and Escape dismissal
 */

import type { Station, StationComplex } from "@mta-my-way/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The picker reads the shared station index; tests feed it directly.
let stationIndexState = {
  stations: [] as Station[],
  complexes: [] as StationComplex[],
  loading: false,
  error: null as string | null,
};

vi.mock("../../hooks/useStationIndex", () => ({
  useStationIndex: () => stationIndexState,
}));

// The real StationSearch debounces 200ms; a controlled input keeps the picker
// tests synchronous while still exercising the picker's own query state.
vi.mock("../search/StationSearch", () => ({
  StationSearch: ({
    value,
    onChange,
    autoFocus,
  }: {
    value: string;
    onChange: (v: string) => void;
    autoFocus?: boolean;
  }) => (
    <input
      type="search"
      aria-label="Search stations"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { StationPicker } from "./StationPicker";

function makeStations(): Station[] {
  return [
    {
      id: "725",
      name: "Times Sq-42 St",
      lat: 40.755,
      lon: -73.987,
      lines: ["1", "2", "3", "7"],
      northStopId: "725N",
      southStopId: "725S",
      transfers: [],
      ada: true,
      borough: "manhattan",
    },
    {
      id: "101",
      name: "South Ferry",
      lat: 40.702,
      lon: -74.013,
      lines: ["1"],
      northStopId: "101N",
      southStopId: "101S",
      transfers: [],
      ada: true,
      borough: "manhattan",
    },
  ];
}

const COMPLEX: StationComplex = {
  complexId: "601",
  name: "Times Sq-42 St / Port Authority",
  stations: ["725"],
  allLines: ["1", "2", "3", "7", "A", "C", "E", "N", "Q", "R"],
  allStopIds: ["725N", "725S"],
};

beforeEach(() => {
  stationIndexState = {
    stations: makeStations(),
    complexes: [],
    loading: false,
    error: null,
  };
});

function typeQuery(query: string) {
  fireEvent.change(screen.getByLabelText("Search stations"), { target: { value: query } });
}

describe("StationPicker", () => {
  it("renders as a dialog labelled with its title", () => {
    render(<StationPicker title="Pick origin station" onSelect={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Pick origin station" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Pick origin station" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("focuses the search input on open", () => {
    render(<StationPicker title="Pick a station" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByLabelText("Search stations")).toHaveFocus();
  });

  it("prompts to start typing while the query is empty", () => {
    render(<StationPicker title="Pick" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("Start typing to search stations")).toBeInTheDocument();
  });

  it("shows the loading message before the index arrives", () => {
    stationIndexState = { stations: [], complexes: [], loading: true, error: null };
    render(<StationPicker title="Pick" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText("Loading stations...")).toBeInTheDocument();
  });

  it("shows matching stations with borough and line bullets", () => {
    render(<StationPicker title="Pick" onSelect={vi.fn()} onClose={vi.fn()} />);

    typeQuery("south");

    const result = screen.getByText("South Ferry").closest('button[role="listitem"]');
    expect(result).not.toBeNull();
    expect(screen.getByText("manhattan")).toBeInTheDocument();
    expect(result!.querySelectorAll("button")).toHaveLength(1); // the "1 train" bullet
  });

  it("shows the complex display name and caps result bullets at 8 lines", () => {
    stationIndexState = {
      stations: makeStations(),
      complexes: [COMPLEX],
      loading: false,
      error: null,
    };
    render(<StationPicker title="Pick" onSelect={vi.fn()} onClose={vi.fn()} />);

    typeQuery("times");

    // Display names pass through sanitizeUserInput, which entity-encodes "/".
    const result = screen
      .getByText("Times Sq-42 St &#x2F; Port Authority")
      .closest('button[role="listitem"]');
    expect(result).not.toBeNull();
    // The complex serves 10 lines; only the first 8 get a bullet.
    expect(result!.querySelectorAll("button")).toHaveLength(8);
  });

  it("reports no results for an unmatched query", () => {
    render(<StationPicker title="Pick" onSelect={vi.fn()} onClose={vi.fn()} />);

    typeQuery("zzz-no-match");

    expect(screen.getByText('No stations found for "zzz-no-match"')).toBeInTheDocument();
  });

  it("selects a station and closes", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<StationPicker title="Pick" onSelect={onSelect} onClose={onClose} />);

    typeQuery("south");
    fireEvent.click(screen.getByText("South Ferry"));

    expect(onSelect).toHaveBeenCalledWith({
      stationId: "101",
      stationName: "South Ferry",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("passes the complex display name when a complex result is selected", () => {
    stationIndexState = {
      stations: makeStations(),
      complexes: [COMPLEX],
      loading: false,
      error: null,
    };
    const onSelect = vi.fn();
    render(<StationPicker title="Pick" onSelect={onSelect} onClose={vi.fn()} />);

    typeQuery("times");
    fireEvent.click(screen.getByText("Times Sq-42 St &#x2F; Port Authority"));

    expect(onSelect).toHaveBeenCalledWith({
      stationId: "725",
      stationName: "Times Sq-42 St / Port Authority",
    });
  });

  it("closes from the cancel button", () => {
    const onClose = vi.fn();
    render(<StationPicker title="Pick" onSelect={vi.fn()} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop", () => {
    const onClose = vi.fn();
    const { container } = render(
      <StationPicker title="Pick" onSelect={vi.fn()} onClose={onClose} />
    );

    const backdrop = container.firstChild;
    expect(backdrop).toBeInstanceOf(HTMLDivElement);
    fireEvent.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<StationPicker title="Pick" onSelect={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Pick" }), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab cycling inside the dialog", () => {
    const onClose = vi.fn();
    render(<StationPicker title="Pick" onSelect={vi.fn()} onClose={onClose} />);

    const dialog = screen.getByRole("dialog", { name: "Pick" });
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    // Forward Tab from the last focusable wraps to the first.
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Shift+Tab from the first wraps back to the last.
    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
