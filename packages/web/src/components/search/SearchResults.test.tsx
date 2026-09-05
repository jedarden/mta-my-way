/**
 * Tests for the SearchResults component — the list StationSearch feeds on /search.
 *
 * Covers the three render states and the row actions:
 * - loading skeleton while the station index is still fetching
 * - empty state for a query that matches nothing
 * - result rows with their borough label, line bullets and /station link
 * - the heart button toggling a favorite without triggering navigation
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFavorites } from "../../hooks/useFavorites";
import type { SearchResult } from "../../lib/stationSearch";
import { SearchResults } from "./SearchResults";

vi.mock("../../hooks/useFavorites", () => ({
  useFavorites: vi.fn(),
}));

const addFavorite = vi.fn();
const removeFavorite = vi.fn();

type Favorites = ReturnType<typeof useFavorites>["favorites"];

/** Complete useFavorites return value; SearchResults only touches three fields. */
function mockFavorites(favorites: Favorites = []) {
  vi.mocked(useFavorites).mockReturnValue({
    favorites,
    hasFavorites: favorites.length > 0,
    onboardingComplete: true,
    addFavorite,
    updateFavorite: vi.fn(),
    removeFavorite,
    reorderFavorites: vi.fn(),
    togglePin: vi.fn(),
    recordTap: vi.fn(),
    completeOnboarding: vi.fn(),
  });
}

const RESULT: SearchResult = {
  stationId: "725",
  displayName: "Times Sq-42 St",
  lines: ["1", "2", "3", "7", "N", "Q", "R", "W"],
  borough: "manhattan",
  score: 100,
};

const BRONX_RESULT: SearchResult = {
  stationId: "402",
  displayName: "Mosholu Pkwy",
  lines: ["4"],
  borough: "bronx",
  score: 50,
};

const renderResults = (results: SearchResult[], query = "times", loading = false) =>
  render(
    <MemoryRouter>
      <SearchResults results={results} query={query} loading={loading} />
    </MemoryRouter>
  );

beforeEach(() => {
  mockFavorites();
});

describe("SearchResults", () => {
  describe("loading state", () => {
    it("renders skeleton rows marked busy instead of results", () => {
      renderResults([RESULT], "times", true);

      expect(screen.getByLabelText("Loading stations")).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(screen.queryByText("Times Sq-42 St")).not.toBeInTheDocument();
    });

    it("renders three skeleton rows", () => {
      const { container } = renderResults([], "times", true);

      expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    });

    it("takes precedence over the empty state", () => {
      renderResults([], "zzz", true);

      expect(screen.getByLabelText("Loading stations")).toBeInTheDocument();
      expect(screen.queryByText("No stations found")).not.toBeInTheDocument();
    });
  });

  describe("empty state", () => {
    it("tells the user nothing matched a non-empty query", () => {
      renderResults([], "zzz");

      expect(screen.getByRole("status")).toHaveTextContent("No stations found");
      expect(
        screen.getByText(/Try a different name, line letter, or neighborhood/)
      ).toBeInTheDocument();
    });

    it("does not show the empty state for a whitespace-only query", () => {
      renderResults([], "   ");

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("does not show the empty state when there are results", () => {
      renderResults([RESULT]);

      expect(screen.queryByText("No stations found")).not.toBeInTheDocument();
    });
  });

  describe("results", () => {
    it("renders one row per result with name and borough", () => {
      renderResults([RESULT, BRONX_RESULT]);

      const rows = screen.getAllByRole("listitem");
      expect(rows).toHaveLength(2);
      expect(screen.getByText("Times Sq-42 St")).toBeInTheDocument();
      expect(screen.getByText("Manhattan")).toBeInTheDocument();
    });

    it("maps known borough slugs to their display label", () => {
      renderResults([BRONX_RESULT]);

      expect(screen.getByText("The Bronx")).toBeInTheDocument();
    });

    it("falls back to the raw borough when the slug is unknown", () => {
      renderResults([{ ...RESULT, borough: "underground" }]);

      expect(screen.getByText("underground")).toBeInTheDocument();
    });

    it("links every row to its station page", () => {
      renderResults([RESULT, BRONX_RESULT]);

      const links = screen.getAllByRole("listitem");
      expect(links.map((row) => row.getAttribute("href"))).toEqual([
        "/station/725",
        "/station/402",
      ]);
    });

    it("renders a line bullet per served line", () => {
      renderResults([{ ...RESULT, lines: ["1", "7"] }]);

      // LineBullet labels its buttons "<line> train".
      expect(screen.getByRole("button", { name: "1 train" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "7 train" })).toBeInTheDocument();
    });
  });

  describe("favorite toggle", () => {
    it("adds a favorite with the row's station data", () => {
      renderResults([RESULT]);

      fireEvent.click(screen.getByRole("button", { name: "Add Times Sq-42 St to favorites" }));

      expect(addFavorite).toHaveBeenCalledWith({
        stationId: "725",
        stationName: "Times Sq-42 St",
        lines: ["1", "2", "3", "7", "N", "Q", "R", "W"],
        direction: "both",
        pinned: false,
      });
      expect(removeFavorite).not.toHaveBeenCalled();
    });

    it("removes the existing favorite when the row is already favorited", () => {
      mockFavorites([
        {
          id: "fav-725",
          stationId: "725",
          stationName: "Times Sq-42 St",
          lines: ["1", "2", "3"],
          direction: "both",
          sortOrder: 0,
          pinned: false,
        },
      ]);
      renderResults([RESULT]);

      fireEvent.click(screen.getByRole("button", { name: "Remove Times Sq-42 St from favorites" }));

      expect(removeFavorite).toHaveBeenCalledWith("fav-725");
      expect(addFavorite).not.toHaveBeenCalled();
    });

    it("marks the heart as pressed for favorited rows", () => {
      mockFavorites([
        {
          id: "fav-725",
          stationId: "725",
          stationName: "Times Sq-42 St",
          lines: ["1"],
          direction: "both",
          sortOrder: 0,
          pinned: false,
        },
      ]);
      renderResults([RESULT]);

      expect(
        screen.getByRole("button", { name: "Remove Times Sq-42 St from favorites" })
      ).toHaveAttribute("aria-pressed", "true");
    });
  });
});
