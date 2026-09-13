/**
 * Tests for StatsScreen — the "Your Subway Year" route.
 *
 * StatsScreen keeps its own header instead of Screen's, so it renders the
 * shell's SkipLink and MainContent directly; these tests pin that contract on
 * the route where the WCAG audit found the skip link had no target
 * (docs/notes/wcag-audit-baseline.md).
 */

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// The station index fetches on mount; the shell under test needs no stations.
vi.mock("../hooks/useStationIndex", () => ({
  useStationIndex: () => ({
    stations: [],
    complexes: [],
    loading: false,
    error: null,
  }),
}));

// An empty journal keeps the share path (and its html2canvas import) out of
// the render under test.
vi.mock("../stores", () => ({
  useJournalStore: (selector: (state: { stats: Record<string, never> }) => unknown) =>
    selector({ stats: {} }),
}));

import StatsScreen from "./StatsScreen";

const renderStatsScreen = () =>
  render(
    <MemoryRouter initialEntries={["/stats"]}>
      <StatsScreen />
    </MemoryRouter>
  );

describe("StatsScreen accessibility shell", () => {
  it("renders the Screen shell's skip link and main landmark", () => {
    renderStatsScreen();

    // The skip link only works if the id it points at is actually in the document.
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content"
    );

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main-content");
    expect(main).toHaveAttribute("tabIndex", "-1");
    expect(main).toHaveAttribute("aria-label", "Main content");
    expect(document.getElementById("main-content")).toBe(main);
    expect(main).toHaveClass("overflow-y-auto");
  });
});
