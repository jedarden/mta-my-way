/**
 * Tests for FavoriteEditor component
 *
 * Covers the favorite bottom-sheet editor:
 * - Label input prefill and placeholder
 * - Line set: station lines fetched from the API, selection toggling,
 *   the last-line guard, and the fallback when the station fetch fails
 * - Direction radio options
 * - Save payload shape (label trimmed or undefined)
 * - Delete confirmation flow and dismissal (button, backdrop, Escape)
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFavorite } from "../../test/factories";

const mockGetStation = vi.fn();

vi.mock("../../lib/api", () => ({
  api: {
    getStation: (...args: unknown[]) => mockGetStation(...args),
  },
}));

import { FavoriteEditor } from "./FavoriteEditor";

const STATION_LINES = ["1", "2", "3", "7"];

beforeEach(() => {
  mockGetStation.mockResolvedValue({
    id: "725",
    name: "Times Sq-42 St",
    lines: STATION_LINES,
  });
});

describe("FavoriteEditor", () => {
  it("renders as a dialog labelled for the station being edited", () => {
    render(
      <FavoriteEditor
        favorite={makeFavorite()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog", { name: "Edit Times Sq-42 St" })).toHaveAttribute(
      "aria-modal",
      "true"
    );
    expect(screen.getByRole("heading", { name: "Times Sq-42 St" })).toBeInTheDocument();
  });

  it("prefills the label input and falls back to the station name placeholder", () => {
    render(
      <FavoriteEditor
        favorite={makeFavorite({ label: "Morning stop" })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const label = screen.getByLabelText("Custom label (optional)");
    expect(label).toHaveValue("Morning stop");
    expect(label).toHaveAttribute("placeholder", "Times Sq-42 St");
  });

  it("fetches the station to offer every serving line, keeping the current selection", async () => {
    render(
      <FavoriteEditor
        favorite={makeFavorite()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(mockGetStation).toHaveBeenCalledWith("725");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Show 7 train" })).toBeInTheDocument();
    });
    // Lines already on the favorite render as selected (Hide).
    expect(screen.getByRole("button", { name: "Hide 1 train" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide 2 train" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide 3 train" })).toBeInTheDocument();
  });

  it("falls back to the favorite's own lines when the station fetch fails", async () => {
    mockGetStation.mockRejectedValue(new Error("offline"));

    render(
      <FavoriteEditor
        favorite={makeFavorite()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Hide 1 train" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Show 7 train" })).not.toBeInTheDocument();
  });

  it("toggles a line into and out of the selection", () => {
    render(
      <FavoriteEditor
        favorite={makeFavorite()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide 2 train" }));
    expect(screen.getByRole("button", { name: "Show 2 train" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 2 train" }));
    expect(screen.getByRole("button", { name: "Hide 2 train" })).toBeInTheDocument();
  });

  it("refuses to deselect the last remaining line", () => {
    render(
      <FavoriteEditor
        favorite={makeFavorite({ lines: ["1"] })}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const only = screen.getByRole("button", { name: "Hide 1 train" });
    fireEvent.click(only);

    expect(screen.getByRole("button", { name: "Hide 1 train" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("offers all three direction options and switches selection", () => {
    render(
      <FavoriteEditor
        favorite={makeFavorite()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("radio", { name: "Uptown / Bronx-bound" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Downtown / Brooklyn-bound" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Both directions" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Downtown / Brooklyn-bound" }));

    expect(screen.getByRole("radio", { name: "Downtown / Brooklyn-bound" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Both directions" })).not.toBeChecked();
  });

  it("saves label, lines and direction, trimming the label", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <FavoriteEditor
        favorite={makeFavorite({ label: "  Gym  " })}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Show 7 train" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Show 7 train" }));
    await user.click(screen.getByRole("radio", { name: "Uptown / Bronx-bound" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      label: "Gym",
      lines: ["1", "2", "3", "7"],
      direction: "N",
    });
  });

  it("saves an undefined label when the field is emptied", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(
      <FavoriteEditor
        favorite={makeFavorite({ label: "Old" })}
        onSave={onSave}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await user.clear(screen.getByLabelText("Custom label (optional)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ label: undefined, direction: "both" })
    );
  });

  it("asks for confirmation before deleting, and can cancel back", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <FavoriteEditor
        favorite={makeFavorite()}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove from favorites" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove from favorites" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove from favorites" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("closes from the header button, the backdrop and Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <FavoriteEditor
        favorite={makeFavorite()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole("button", { name: "Close editor" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.firstChild;
    expect(backdrop).toBeInstanceOf(HTMLDivElement);
    await user.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(2);

    await user.type(screen.getByLabelText("Custom label (optional)"), "{Escape}");
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps Tab cycling inside the dialog", async () => {
    const user = userEvent.setup();
    render(
      <FavoriteEditor
        favorite={makeFavorite()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Edit Times Sq-42 St" });
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    expect(focusable.length).toBeGreaterThan(1);
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);

    first.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);
  });
});
