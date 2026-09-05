/**
 * Tests for SearchScreen — the /search page that hosts StationSearch.
 *
 * Covers the states the debounced search box drives:
 * - popular stations while the query is empty
 * - the station-index error message, and its dismissal once a query is typed
 * - the loading skeleton handed to SearchResults while the index fetches
 * - client-side results appearing only after the debounce settles
 */

import type { Station, StationComplex } from "@mta-my-way/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFavorites } from "../hooks/useFavorites";
import { useStationIndex } from "../hooks/useStationIndex";
import SearchScreen from "./SearchScreen";

vi.mock("../hooks/useStationIndex", () => ({
  useStationIndex: vi.fn(),
}));

vi.mock("../hooks/useFavorites", () => ({
  useFavorites: vi.fn(),
}));

const STATION: Station = {
  id: "127",
  name: "Times Sq - 42 St",
  lines: ["1", "2", "3", "7", "N", "R", "W"],
  borough: "manhattan",
  lat: 40.758,
  lon: -73.9855,
  northStopId: "127N",
  southStopId: "127S",
  transfers: [],
  ada: true,
};

function mockIndex(overrides: Partial<ReturnType<typeof useStationIndex>> = {}) {
  vi.mocked(useStationIndex).mockReturnValue({
    stations: [STATION],
    complexes: [] as StationComplex[],
    loading: false,
    error: null,
    ...overrides,
  });
  vi.mocked(useFavorites).mockReturnValue({
    favorites: [],
    hasFavorites: false,
    onboardingComplete: true,
    addFavorite: vi.fn(),
    updateFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    reorderFavorites: vi.fn(),
    togglePin: vi.fn(),
    recordTap: vi.fn(),
    completeOnboarding: vi.fn(),
  });
}

const renderSearch = () =>
  render(
    <MemoryRouter>
      <SearchScreen />
    </MemoryRouter>
  );

const searchBox = () => screen.getByLabelText("Search stations") as HTMLInputElement;

/** Type a query and let StationSearch's 200ms debounce settle. */
function searchFor(query: string) {
  fireEvent.change(searchBox(), { target: { value: query } });
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockIndex();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SearchScreen", () => {
  describe("empty query", () => {
    it("shows popular stations before anything is typed", () => {
      renderSearch();

      expect(screen.getByText("Popular stations")).toBeInTheDocument();
      // The row's accessible name is dominated by the nested heart button, so
      // locate the row by its visible name text instead of by link name.
      const row = screen.getByText("Times Sq-42 St").closest("a");
      expect(row).toHaveAttribute("href", "/station/725");
    });
  });

  describe("station index error", () => {
    it("tells the user the station data could not be loaded", () => {
      mockIndex({ stations: [], error: "Network error" });
      renderSearch();

      expect(
        screen.getByText(/Could not load station data\. Check your connection and try again\./)
      ).toBeInTheDocument();
    });

    it("hides the error once the user types a query", () => {
      mockIndex({ stations: [], error: "Network error" });
      renderSearch();

      searchFor("times");

      expect(
        screen.queryByText(/Could not load station data\. Check your connection and try again\./)
      ).not.toBeInTheDocument();
    });
  });

  describe("loading index", () => {
    it("shows the search skeleton while the index is fetching and a query is set", () => {
      mockIndex({ stations: [], loading: true });
      renderSearch();

      searchFor("times");

      expect(screen.getByLabelText("Loading stations")).toBeInTheDocument();
    });
  });

  describe("searching", () => {
    it("searches the loaded station index client-side", () => {
      renderSearch();

      searchFor("times");

      expect(screen.getByRole("list", { name: "Station search results" })).toBeInTheDocument();
      expect(screen.getByText("Times Sq - 42 St")).toBeInTheDocument();
      expect(screen.queryByText("Popular stations")).not.toBeInTheDocument();
    });

    it("waits for the 200ms debounce before searching", () => {
      renderSearch();

      fireEvent.change(searchBox(), { target: { value: "times" } });

      expect(
        screen.queryByRole("list", { name: "Station search results" })
      ).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(screen.getByRole("list", { name: "Station search results" })).toBeInTheDocument();
    });

    it("shows the no-results state for a query that matches nothing", () => {
      renderSearch();

      searchFor("zzz");

      expect(screen.getByText("No stations found")).toBeInTheDocument();
    });
  });
});
