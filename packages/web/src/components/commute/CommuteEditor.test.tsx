/**
 * Tests for CommuteEditor component
 *
 * Covers the bottom-sheet's gate and payload: save stays disabled until a
 * name and both stations exist, the emitted payload is trimmed and shaped
 * like a Commute minus its id, the origin/destination pickers round-trip,
 * preferred lines follow the origin and reset when it changes, and the
 * delete flow asks before it removes.
 */

import type { Station } from "@mta-my-way/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCommute } from "../../test/factories";
import { CommuteEditor } from "./CommuteEditor";

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
    },
  ];
}

// The editor reads the station index to learn which lines serve the origin.
let stationIndexState = {
  stations: makeStations(),
  complexes: [],
  loading: false,
  error: null as string | null,
};

vi.mock("../../hooks/useStationIndex", () => ({
  useStationIndex: () => stationIndexState,
}));

// The picker is a full search surface with its own tests; replacing it with a
// plain pair of buttons keeps the editor tests focused on what the editor does
// with a selection rather than on how the selection is found. The real picker
// closes itself after a selection, so the mock must too.
vi.mock("./StationPicker", () => ({
  StationPicker: ({
    title,
    onSelect,
    onClose,
  }: {
    title: string;
    onSelect: (station: { stationId: string; stationName: string }) => void;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      <button
        type="button"
        onClick={() => {
          onSelect({ stationId: "101", stationName: "South Ferry" });
          onClose();
        }}
      >
        pick-101
      </button>
      <button
        type="button"
        onClick={() => {
          onSelect({ stationId: "725", stationName: "Times Sq-42 St" });
          onClose();
        }}
      >
        pick-725
      </button>
      <button type="button" onClick={onClose}>
        picker-close
      </button>
    </div>
  ),
}));

beforeEach(() => {
  stationIndexState = {
    stations: makeStations(),
    complexes: [],
    loading: false,
    error: null,
  };
});

type User = ReturnType<typeof userEvent.setup>;

/** Choose a station through the picker mock. */
async function pickStation(user: User, slot: "origin" | "destination", id: "725" | "101") {
  await user.click(
    screen.getByRole("button", {
      name: slot === "origin" ? "Pick origin station" : "Pick destination station",
    })
  );
  await user.click(screen.getByRole("button", { name: `pick-${id}` }));
}

/** Name the commute and save it. */
async function saveAs(user: User, name = "Work") {
  await user.type(screen.getByLabelText("Name"), name);
  await user.click(screen.getByRole("button", { name: "Add commute" }));
}

describe("CommuteEditor", () => {
  it("opens as a modal labelled for a new commute", () => {
    render(<CommuteEditor onSave={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "New commute" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "New Commute" })).toBeInTheDocument();
  });

  it("labels the dialog for editing when given an existing commute", () => {
    render(<CommuteEditor commute={makeCommute()} onSave={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Edit commute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("disables save until a name and both stations are set", async () => {
    const user = userEvent.setup();
    render(<CommuteEditor onSave={vi.fn()} onClose={vi.fn()} />);

    const save = screen.getByRole("button", { name: "Add commute" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "Work");
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Pick origin station" }));
    await user.click(screen.getByRole("button", { name: "pick-725" }));
    expect(save).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Pick destination station" }));
    await user.click(screen.getByRole("button", { name: "pick-101" }));

    expect(save).toBeEnabled();
  });

  it("emits a trimmed payload without an id on save", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CommuteEditor onSave={onSave} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText("Name"), "  Work  ");
    await user.click(screen.getByRole("button", { name: "Pick origin station" }));
    await user.click(screen.getByRole("button", { name: "pick-725" }));
    await user.click(screen.getByRole("button", { name: "Pick destination station" }));
    await user.click(screen.getByRole("button", { name: "pick-101" }));
    await user.click(screen.getByRole("button", { name: "Add commute" }));

    expect(onSave).toHaveBeenCalledWith({
      name: "Work",
      origin: { stationId: "725", stationName: "Times Sq-42 St" },
      destination: { stationId: "101", stationName: "South Ferry" },
      preferredLines: [],
      enableTransferSuggestions: true,
    });
  });

  it("does not call save while the form is incomplete", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CommuteEditor onSave={onSave} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Add commute" }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("prefills every field from the commute being edited", () => {
    render(<CommuteEditor commute={makeCommute()} onSave={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByLabelText("Name")).toHaveValue("Work");
    expect(
      screen.getByRole("button", { name: "Change origin: Times Sq-42 St" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change destination: South Ferry" })
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Enable transfer suggestions" })).not.toBeChecked();
  });

  it("offers only the lines serving the chosen origin", async () => {
    const user = userEvent.setup();
    render(<CommuteEditor onSave={vi.fn()} onClose={vi.fn()} />);

    // No origin yet — the line chooser is withheld entirely.
    expect(screen.queryByText("Preferred lines")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pick origin station" }));
    await user.click(screen.getByRole("button", { name: "pick-725" }));

    expect(screen.getByText("Preferred lines")).toBeInTheDocument();
    // Times Sq serves the 1, 2, 3 and 7.
    expect(screen.getByRole("button", { name: "Add 1 train preference" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 7 train preference" })).toBeInTheDocument();

    // South Ferry only serves the 1, so the 7 must never be offered.
    await user.click(screen.getByRole("button", { name: "Change origin: Times Sq-42 St" }));
    await user.click(screen.getByRole("button", { name: "pick-101" }));
    expect(
      screen.queryByRole("button", { name: "Add 7 train preference" })
    ).not.toBeInTheDocument();
  });

  it("toggles a preferred line into the saved payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CommuteEditor onSave={onSave} onClose={vi.fn()} />);

    await pickStation(user, "origin", "725");

    await user.click(screen.getByRole("button", { name: "Add 1 train preference" }));
    expect(screen.getByRole("button", { name: "Remove 1 train preference" })).toBeInTheDocument();

    await pickStation(user, "destination", "101");
    await saveAs(user);

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ preferredLines: ["1"] }));
  });

  it("clears preferred lines when the origin changes", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CommuteEditor commute={makeCommute()} onSave={onSave} onClose={vi.fn()} />);

    // The edited commute prefers the 1; swapping origin to South Ferry drops
    // every stored preference because they may no longer be valid.
    await user.click(screen.getByRole("button", { name: "Change origin: Times Sq-42 St" }));
    await user.click(screen.getByRole("button", { name: "pick-101" }));

    await user.type(screen.getByLabelText("Name"), "Work");
    await user.click(screen.getByRole("button", { name: "Change destination: South Ferry" }));
    await user.click(screen.getByRole("button", { name: "pick-725" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: { stationId: "101", stationName: "South Ferry" },
        preferredLines: [],
      })
    );
  });

  it("flips the transfer-suggestions toggle into the saved payload", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CommuteEditor onSave={onSave} onClose={vi.fn()} />);

    const toggle = screen.getByRole("checkbox", { name: "Enable transfer suggestions" });
    expect(toggle).toBeChecked();

    await user.click(toggle);
    expect(toggle).not.toBeChecked();

    await pickStation(user, "origin", "725");
    await pickStation(user, "destination", "101");
    await saveAs(user);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ enableTransferSuggestions: false })
    );
  });

  it("closes from the header button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommuteEditor onSave={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from the backdrop", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<CommuteEditor onSave={vi.fn()} onClose={onClose} />);

    // The backdrop is aria-hidden by design, so reach it through the tree.
    const backdrop = container.firstChild;
    expect(backdrop).toBeInstanceOf(HTMLDivElement);
    await user.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommuteEditor onSave={vi.fn()} onClose={onClose} />);

    await user.type(screen.getByLabelText("Name"), "{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("offers no delete affordance for a brand-new commute", () => {
    render(<CommuteEditor onSave={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Remove commute" })).not.toBeInTheDocument();
  });

  it("asks for confirmation before removing an existing commute", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <CommuteEditor
        commute={makeCommute()}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove commute" }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("returns to the editor when the delete confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <CommuteEditor
        commute={makeCommute()}
        onSave={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Remove commute" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove commute" })).toBeInTheDocument();
  });

  it("focuses the dialog on open and restores focus on unmount", async () => {
    // Mount the outside focus target first so the editor captures it as the
    // element to hand focus back to.
    render(<button type="button">outside</button>);
    screen.getByRole("button", { name: "outside" }).focus();

    const { unmount } = render(<CommuteEditor onSave={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "New commute" });
    expect(dialog).toContainElement(document.activeElement);

    unmount();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "outside" })).toHaveFocus();
    });
  });

  it("keeps Tab cycling inside the dialog", async () => {
    const user = userEvent.setup();
    render(<CommuteEditor onSave={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "New commute" });
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
    expect(focusable.length).toBeGreaterThan(1);

    // Tabbing forward from the last focusable wraps to the first.
    focusable[focusable.length - 1].focus();
    await user.tab();
    expect(document.activeElement).toBe(focusable[0]);

    // Shift+Tab from the first wraps back to the last.
    focusable[0].focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });
});
