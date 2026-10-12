/**
 * Tests for TripRecordEditor — the bottom-sheet modal for editing a trip.
 *
 * Covers rendering, delay display branches, field initialization and edits,
 * save payload shaping (valid / cleared / non-positive durations), the
 * delete confirmation flow, close affordances, and the focus trap.
 */

import type { TripRecord } from "@mta-my-way/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TripRecordEditor } from "./TripRecordEditor";

const COMMUTE_ID = "commute-1";

const baseTrip: TripRecord = {
  id: "trip-1",
  date: "2026-09-15",
  origin: { stationId: "727", stationName: "Times Sq-42 St" },
  destination: { stationId: "631", stationName: "Grand Central-42 St" },
  line: "7",
  departureTime: 1_700_000_000_000,
  arrivalTime: 1_700_000_060_000,
  actualDurationMinutes: 32,
  scheduledDurationMinutes: 25,
  source: "manual",
  notes: "Existing note",
};

interface Handlers {
  onSave: ReturnType<typeof vi.fn>;
  onDelete: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
}

function renderEditor(trip: TripRecord = baseTrip): Handlers & { container: HTMLElement } {
  const handlers: Handlers = {
    onSave: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };
  const { container } = render(
    <TripRecordEditor
      trip={trip}
      commuteId={COMMUTE_ID}
      onSave={handlers.onSave}
      onDelete={handlers.onDelete}
      onClose={handlers.onClose}
    />
  );
  return { ...handlers, container };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe("TripRecordEditor rendering", () => {
  it("renders a labelled modal dialog with header and trip summary", () => {
    renderEditor();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute(
      "aria-label",
      "Edit trip from Times Sq-42 St to Grand Central-42 St"
    );
    expect(screen.getByRole("heading", { name: "Edit Trip" })).toBeInTheDocument();
    expect(screen.getByText("Times Sq-42 St → Grand Central-42 St")).toBeInTheDocument();
    expect(screen.getByText("32 min actual")).toBeInTheDocument();
  });

  it("seeds the scheduled duration and notes fields from the trip", () => {
    renderEditor();

    expect(screen.getByLabelText("Scheduled duration (minutes)")).toHaveValue(25);
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Existing note");
    expect(screen.getByText("13/500")).toBeInTheDocument(); // notes counter
  });

  it("leaves the duration field empty when the trip has no schedule", () => {
    renderEditor({ ...baseTrip, scheduledDurationMinutes: undefined, notes: undefined });

    expect(screen.getByLabelText("Scheduled duration (minutes)")).toHaveValue(null);
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
    expect(screen.getByText("0/500")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Delay display branches
// ---------------------------------------------------------------------------

describe("TripRecordEditor delay display", () => {
  it.each([
    [32, 25, "+7 min", "text-severe"], // > 5 late
    [28, 25, "+3 min", "text-warning"], // > 2 late
    [26, 25, "+1 min", "text-text-secondary"], // within band
    [26, 30, "-4 min", "text-mta-primary"], // < -2 early
  ])("renders delay for actual %i vs scheduled %i", (actual, scheduled, text, colorClass) => {
    renderEditor({
      ...baseTrip,
      actualDurationMinutes: actual,
      scheduledDurationMinutes: scheduled,
    });

    const badge = screen.getByText(text);
    expect(badge).toHaveClass(colorClass);
    expect(screen.getByText(`${actual} min actual`)).toBeInTheDocument();
  });

  it("omits the delay badge when no scheduled duration is set", () => {
    renderEditor({ ...baseTrip, scheduledDurationMinutes: undefined });

    expect(screen.queryByText("+7 min")).not.toBeInTheDocument();
    expect(screen.getByText("32 min actual")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Editing and saving
// ---------------------------------------------------------------------------

describe("TripRecordEditor save", () => {
  it("sends edited notes and a valid parsed duration", () => {
    const { onSave } = renderEditor();

    fireEvent.change(screen.getByLabelText("Scheduled duration (minutes)"), {
      target: { value: "28" },
    });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), {
      target: { value: "Crowded train" },
    });
    expect(screen.getByText("13/500")).toBeInTheDocument(); // counter tracks edits

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(COMMUTE_ID, "trip-1", {
      notes: "Crowded train",
      scheduledDurationMinutes: 28,
    });
  });

  it("keeps existing notes when untouched", () => {
    const { onSave } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(COMMUTE_ID, "trip-1", {
      notes: "Existing note",
      scheduledDurationMinutes: 25,
    });
  });

  it("clears the scheduled duration and blank notes when emptied", () => {
    const { onSave } = renderEditor();

    fireEvent.change(screen.getByLabelText("Scheduled duration (minutes)"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(COMMUTE_ID, "trip-1", {
      notes: undefined,
      scheduledDurationMinutes: undefined,
    });
  });

  it("drops a non-positive duration from the payload", () => {
    const { onSave } = renderEditor();

    fireEvent.change(screen.getByLabelText("Scheduled duration (minutes)"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const updates = onSave.mock.calls[0]?.[2] as Partial<TripRecord>;
    expect(updates.notes).toBe("Existing note");
    expect("scheduledDurationMinutes" in updates).toBe(false);
  });

  it("drops a non-numeric duration from the payload", () => {
    const { onSave } = renderEditor();

    fireEvent.change(screen.getByLabelText("Scheduled duration (minutes)"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // jsdom sanitizes invalid number input to ""; either way the payload
    // carries no scheduled duration.
    const updates = onSave.mock.calls[0]?.[2] as Partial<TripRecord>;
    expect(updates.scheduledDurationMinutes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Delete confirmation flow
// ---------------------------------------------------------------------------

describe("TripRecordEditor delete flow", () => {
  it("asks for confirmation before deleting", () => {
    const { onDelete } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    expect(onDelete).not.toHaveBeenCalled();

    // Confirmation row: Cancel + Delete.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    // Back to the initial affordance.
    expect(screen.getByRole("button", { name: "Delete trip" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(COMMUTE_ID, "trip-1");
  });
});

// ---------------------------------------------------------------------------
// Close affordances
// ---------------------------------------------------------------------------

describe("TripRecordEditor closing", () => {
  it("closes from the close button", () => {
    const { onClose, onSave, onDelete } = renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Close editor" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", () => {
    const { onClose, container } = renderEditor();

    // The editor renders backdrop first, then the sheet, inside the container.
    const backdrop = container.children[0] as HTMLElement;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape without saving", () => {
    const { onClose, onSave } = renderEditor();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("ignores non-Tab, non-Escape keys", () => {
    const { onClose } = renderEditor();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "a" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });

    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Focus management
// ---------------------------------------------------------------------------

describe("TripRecordEditor focus management", () => {
  it("focuses the first focusable element on open", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Close editor" })).toHaveFocus();
  });

  it("wraps Tab focus from the last focusable back to the first", () => {
    renderEditor();

    const last = screen.getByRole("button", { name: "Delete trip" });
    last.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });

    expect(screen.getByRole("button", { name: "Close editor" })).toHaveFocus();
  });

  it("wraps Shift+Tab focus from the first focusable to the last", () => {
    renderEditor();

    const first = screen.getByRole("button", { name: "Close editor" });
    first.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });

    expect(screen.getByRole("button", { name: "Delete trip" })).toHaveFocus();
  });

  it("does not intercept Tab from a middle element", () => {
    renderEditor();

    const input = screen.getByLabelText("Scheduled duration (minutes)");
    input.focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });

    // Default Tab behavior is untouched; focus has not been forced anywhere.
    expect(input).toHaveFocus();
  });
});

// ---------------------------------------------------------------------------
// Layout structure
// ---------------------------------------------------------------------------

describe("TripRecordEditor layout", () => {
  it("renders the handle bar and action buttons inside the sheet", () => {
    const { container } = renderEditor();

    const dialog = screen.getByRole("dialog");
    const handleBar = dialog.firstElementChild as HTMLElement;
    expect(handleBar.firstElementChild).toHaveClass("w-10", "h-1", "rounded-full");

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete trip" })).toBeInTheDocument();
    // Backdrop precedes the sheet in the DOM.
    expect((container.children[0] as HTMLElement).className).toContain("bg-black/50");
  });

  it("shows help texts for both fields", () => {
    renderEditor();

    expect(screen.getByText("Set this to compare actual vs. scheduled time")).toBeInTheDocument();
    expect(screen.getByText("Add any notes about this trip")).toBeInTheDocument();
  });
});
