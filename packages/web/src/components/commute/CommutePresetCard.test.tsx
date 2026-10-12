/**
 * Tests for CommutePresetCard component
 *
 * Covers the quick-access commute preset card:
 * - Name, route and preferred-line rendering
 * - Pinned indicator presence
 * - Optional edit affordance and its callback
 * - Navigation from "Arrivals", "Start Trip" and card keyboard activation
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { makeCommute } from "../../test/factories";
import { CommutePresetCard } from "./CommutePresetCard";

function renderAt(path: string, ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/station/:stationId" element={<div>station-page</div>} />
        <Route path="/commute/:commuteId" element={<div>commute-detail-page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CommutePresetCard", () => {
  it("renders the commute name and origin → destination route", () => {
    renderAt("/", <CommutePresetCard commute={makeCommute()} />);

    expect(screen.getByRole("heading", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByText("Times Sq-42 St → South Ferry")).toBeInTheDocument();
  });

  it("exposes the card as a labelled button for keyboard users", () => {
    renderAt("/", <CommutePresetCard commute={makeCommute()} />);

    const card = screen.getByRole("button", {
      name: "Work: Times Sq-42 St to South Ferry. Press Enter to view arrivals.",
    });
    expect(card).toHaveAttribute("tabindex", "0");
  });

  it("shows the pinned indicator only for pinned commutes", () => {
    const { rerender } = renderAt(
      "/",
      <CommutePresetCard commute={makeCommute({ isPinned: true })} />
    );

    expect(screen.getByLabelText("Pinned commute")).toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<CommutePresetCard commute={makeCommute()} />} />
          <Route path="/station/:stationId" element={<div>station-page</div>} />
          <Route path="/commute/:commuteId" element={<div>commute-detail-page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByLabelText("Pinned commute")).not.toBeInTheDocument();
  });

  it("renders a line bullet per preferred line and none when empty", () => {
    const { rerender } = renderAt("/", <CommutePresetCard commute={makeCommute()} />);

    expect(screen.getByRole("button", { name: "1 train" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "7 train" })).not.toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<CommutePresetCard commute={makeCommute({ preferredLines: [] })} />} />
          <Route path="/station/:stationId" element={<div>station-page</div>} />
          <Route path="/commute/:commuteId" element={<div>commute-detail-page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.queryByRole("button", { name: "1 train" })).not.toBeInTheDocument();
  });

  it("navigates to the origin station arrivals on the Arrivals button", () => {
    renderAt("/", <CommutePresetCard commute={makeCommute()} />);

    fireEvent.click(screen.getByRole("button", { name: /Arrivals/ }));

    expect(screen.getByText("station-page")).toBeInTheDocument();
  });

  it("navigates to the commute detail on the Start Trip button", () => {
    renderAt("/", <CommutePresetCard commute={makeCommute()} />);

    fireEvent.click(screen.getByRole("button", { name: /Start Trip/ }));

    expect(screen.getByText("commute-detail-page")).toBeInTheDocument();
  });

  it("navigates to arrivals on Enter and Space from the card itself", () => {
    renderAt("/", <CommutePresetCard commute={makeCommute()} />);

    const card = screen.getByRole("button", {
      name: "Work: Times Sq-42 St to South Ferry. Press Enter to view arrivals.",
    });

    fireEvent.keyDown(card, { key: "Enter" });
    expect(screen.getByText("station-page")).toBeInTheDocument();
  });

  it("navigates to arrivals on Space from the card itself", () => {
    renderAt("/", <CommutePresetCard commute={makeCommute()} />);

    const card = screen.getByRole("button", {
      name: "Work: Times Sq-42 St to South Ferry. Press Enter to view arrivals.",
    });

    fireEvent.keyDown(card, { key: " " });
    expect(screen.getByText("station-page")).toBeInTheDocument();
  });

  it("hides the edit button when no onEdit handler is given", () => {
    renderAt("/", <CommutePresetCard commute={makeCommute()} />);

    expect(screen.queryByRole("button", { name: "Edit Work commute" })).not.toBeInTheDocument();
  });

  it("calls onEdit with the commute, without navigating", () => {
    const onEdit = vi.fn();
    renderAt("/", <CommutePresetCard commute={makeCommute()} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Work commute" }));

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith(makeCommute());
    // stopPropagation keeps the click from activating the card's navigation.
    expect(screen.queryByText("station-page")).not.toBeInTheDocument();
  });

  it("stops Enter on the edit button from navigating the card", () => {
    const onEdit = vi.fn();
    renderAt("/", <CommutePresetCard commute={makeCommute()} onEdit={onEdit} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Edit Work commute" }), {
      key: "Enter",
    });

    expect(screen.queryByText("station-page")).not.toBeInTheDocument();
  });
});
