/**
 * Tests for JournalScreen — commute journal with per-commute stats,
 * sparkline, expandable trip history, and the lazy-loaded trip editor.
 *
 * Uses the real journal/favorites stores seeded via setState, and the real
 * router shim (MemoryRouter + Routes) so back/stats navigation is exercised.
 */

import type { Commute, CommuteStats, TripRecord } from "@mta-my-way/shared";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Layout chrome — mocked so the screen under test renders without the
// Header/BottomNav data hooks (same pattern as Screen.test.tsx).
vi.mock("../components/layout/Header", () => ({
  default: () => <header data-testid="header" role="banner" />,
}));

vi.mock("../components/layout/BottomNav", () => ({
  default: () => <nav data-testid="bottom-nav" aria-label="Main navigation" />,
}));

vi.mock("../components/common/OfflineBanner", () => ({
  OfflineBanner: () => <div data-testid="offline-banner" />,
}));

vi.mock("../components/common/LiveAnnouncer", () => ({
  LiveRegion: () => <div data-testid="live-region" />,
  useLiveAnnouncer: () => ({ announce: vi.fn() }),
  useRouteChangeAnnouncer: () => vi.fn(),
}));

import { useFavoritesStore, useJournalStore } from "../stores";
import JournalScreen from "./JournalScreen";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTrip(
  overrides: Partial<TripRecord> & Pick<TripRecord, "id" | "date" | "actualDurationMinutes">
): TripRecord {
  return {
    origin: { stationId: "727", stationName: "Times Sq-42 St" },
    destination: { stationId: "631", stationName: "Grand Central-42 St" },
    line: "7",
    departureTime: 1_700_000_000_000,
    arrivalTime: 1_700_000_060_000,
    source: "manual",
    ...overrides,
  };
}

function makeStats(
  commuteId: string,
  records: TripRecord[],
  overrides: Partial<CommuteStats> = {}
): CommuteStats {
  return {
    commuteId,
    averageDurationMinutes: 30,
    medianDurationMinutes: 29,
    stdDevMinutes: 4,
    totalTrips: records.length,
    tripsThisWeek: 1,
    trend: 0,
    averageDelayMinutes: 0,
    maxDelayMinutes: 0,
    onTimePercentage: 100,
    records,
    ...overrides,
  };
}

function makeCommute(id: string, name: string): Commute {
  return {
    id,
    name,
    origin: { stationId: "727", stationName: "Times Sq-42 St" },
    destination: { stationId: "631", stationName: "Grand Central-42 St" },
    preferredLines: ["7"],
    enableTransferSuggestions: false,
    isPinned: false,
  };
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** The "Sep 15"-style label the screen derives from an ISO date, computed the
 * same way so the assertion holds in any local timezone. */
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const OLD_TRIP_DATE = "2026-09-15T12:00:00.000Z";

function seedJournal(stats: Record<string, CommuteStats>, commutes: Commute[] = []) {
  useJournalStore.setState({ stats });
  useFavoritesStore.setState({ commutes });
}

function renderJournal() {
  return render(
    <MemoryRouter initialEntries={["/journal"]}>
      <Routes>
        <Route path="/journal" element={<JournalScreen />} />
        <Route path="/commute" element={<div>Commute Screen</div>} />
        <Route path="/stats" element={<div>Stats Screen</div>} />
      </Routes>
    </MemoryRouter>
  );
}

/** The stats card that owns the named commute heading. */
function cardFor(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3, name });
  return heading.closest("div.rounded-lg") as HTMLElement;
}

/** Default three-record journal: today (tracked, delayed, noted),
 * yesterday (inferred, no schedule), and an older manual early trip. */
function defaultRecords(): TripRecord[] {
  return [
    makeTrip({
      id: "t-today",
      date: daysAgo(0),
      actualDurationMinutes: 32,
      scheduledDurationMinutes: 25,
      source: "tracked",
      notes: "Signal delay at 14th St",
    }),
    makeTrip({
      id: "t-yesterday",
      date: daysAgo(1),
      actualDurationMinutes: 28,
      source: "inferred",
    }),
    makeTrip({
      id: "t-old",
      date: OLD_TRIP_DATE,
      actualDurationMinutes: 27,
      scheduledDurationMinutes: 30,
      source: "manual",
    }),
  ];
}

beforeEach(() => {
  useJournalStore.setState({ stats: {}, dayOfWeekStats: {}, lastStationVisit: null });
  useFavoritesStore.setState({ commutes: [] });
});

// ---------------------------------------------------------------------------
// Empty journal
// ---------------------------------------------------------------------------

describe("JournalScreen with an empty journal", () => {
  it("renders the screen heading and description", () => {
    renderJournal();

    expect(screen.getByRole("heading", { name: "Trip Journal" })).toBeInTheDocument();
    expect(screen.getByText("Your commute history and patterns")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Commute Stats" })).toBeInTheDocument();
  });

  it("hides the Subway Year link and overall summary when there is no data", () => {
    renderJournal();

    expect(screen.queryByRole("button", { name: /Your Subway Year/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Total Trips")).not.toBeInTheDocument();
    expect(screen.queryByText("Avg Duration")).not.toBeInTheDocument();
    expect(screen.queryByText("This Week")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Populated journal
// ---------------------------------------------------------------------------

describe("JournalScreen with commute data", () => {
  it("renders the commute card with route summary and stats grid", () => {
    seedJournal({ c1: makeStats("c1", defaultRecords()) }, [makeCommute("c1", "Work")]);
    renderJournal();

    const card = cardFor("Work");
    expect(within(card).getByText("Times Sq-42 St → Grand Central-42 St")).toBeInTheDocument();
    expect(within(card).getByText("Avg")).toBeInTheDocument();
    expect(within(card).getByText("Median")).toBeInTheDocument();
    expect(within(card).getByText("Avg Delay")).toBeInTheDocument();
    expect(within(card).getByText("Trips")).toBeInTheDocument();
    expect(within(card).getByText("30")).toBeInTheDocument(); // avg minutes
    expect(within(card).getByText("29")).toBeInTheDocument(); // median minutes
    expect(within(card).getByText("3")).toBeInTheDocument(); // trip count
  });

  it("renders the duration sparkline as an svg polyline", () => {
    seedJournal({ c1: makeStats("c1", defaultRecords()) }, [makeCommute("c1", "Work")]);
    const { container } = renderJournal();

    const sparkline = container.querySelector("svg polyline");
    expect(sparkline).toBeInTheDocument();
    expect(sparkline?.getAttribute("points")).toBeTruthy();
  });

  it("shows the degenerate single-value sparkline instead of a chart", () => {
    seedJournal(
      {
        c1: makeStats("c1", [
          makeTrip({ id: "only", date: daysAgo(0), actualDurationMinutes: 28 }),
        ]),
      },
      [makeCommute("c1", "Work")]
    );
    renderJournal();

    expect(screen.getByText("28m")).toBeInTheDocument();
  });

  it("shows the em-dash sparkline placeholder when a commute has zero records", () => {
    seedJournal({ c1: makeStats("c1", []) }, [makeCommute("c1", "Work")]);
    renderJournal();

    const card = cardFor("Work");
    expect(within(card).getByText("—")).toBeInTheDocument();
    expect(within(card).getByText("— → —")).toBeInTheDocument();
  });

  it("falls back to Unknown Commute when no favorite matches the stats key", () => {
    seedJournal({ ghost: makeStats("ghost", defaultRecords()) }, [makeCommute("c1", "Work")]);
    renderJournal();

    expect(screen.getByRole("heading", { level: 3, name: "Unknown Commute" })).toBeInTheDocument();
  });

  it("renders the overall summary and the Subway Year link", () => {
    seedJournal({ c1: makeStats("c1", defaultRecords()) }, [makeCommute("c1", "Work")]);
    renderJournal();

    expect(screen.getByRole("button", { name: /Your Subway Year/ })).toBeInTheDocument();
    expect(screen.getByText("Personalized annual summary")).toBeInTheDocument();
    expect(screen.getByText("Total Trips")).toBeInTheDocument();
    expect(screen.getByText("Avg Duration")).toBeInTheDocument();
    // Once in the overall summary, once in each commute card's stats grid.
    expect(screen.getAllByText("Avg Delay").length).toBe(2);
    expect(screen.getByText("This Week")).toBeInTheDocument();
  });

  it("navigates back to /commute from the back button", () => {
    seedJournal({ c1: makeStats("c1", defaultRecords()) }, [makeCommute("c1", "Work")]);
    renderJournal();

    fireEvent.click(screen.getByRole("button", { name: "Back to commutes" }));

    expect(screen.getByText("Commute Screen")).toBeInTheDocument();
    expect(screen.queryByText("Trip Journal")).not.toBeInTheDocument();
  });

  it("navigates to /stats from the Subway Year button", () => {
    seedJournal({ c1: makeStats("c1", defaultRecords()) }, [makeCommute("c1", "Work")]);
    renderJournal();

    fireEvent.click(screen.getByRole("button", { name: /Your Subway Year/ }));

    expect(screen.getByText("Stats Screen")).toBeInTheDocument();
  });

  it("renders multiple commute cards", () => {
    seedJournal(
      {
        c1: makeStats("c1", defaultRecords()),
        c2: makeStats("c2", defaultRecords()),
      },
      [makeCommute("c1", "Work"), makeCommute("c2", "Gym")]
    );
    renderJournal();

    expect(screen.getByRole("heading", { level: 3, name: "Work" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Gym" })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Trend badge branches
// ---------------------------------------------------------------------------

describe("JournalScreen trend badge", () => {
  it.each([
    [12, "+12%", "text-severe"],
    [3, "+3%", "text-warning"],
    [-8, "-8%", "text-mta-primary"],
    [-1, "-1%", "text-text-secondary"],
    [0, "0%", "text-text-secondary"],
  ])("renders trend %i as %s with class %s", (trend, label, colorClass) => {
    seedJournal({ c1: makeStats("c1", defaultRecords(), { trend }) }, [makeCommute("c1", "Work")]);
    renderJournal();

    const badge = screen.getByText(label);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass(colorClass);
  });
});

// ---------------------------------------------------------------------------
// Average delay color branches (card grid)
// ---------------------------------------------------------------------------

describe("JournalScreen average delay coloring", () => {
  it.each([
    [7, "+7min", "text-severe"],
    [3, "+3min", "text-warning"],
    [-4, "-4min", "text-mta-primary"],
    [1, "+1min", "text-text-primary"],
  ])("renders average delay %i with class %s", (delay, text, colorClass) => {
    seedJournal({ c1: makeStats("c1", defaultRecords(), { averageDelayMinutes: delay }) }, [
      makeCommute("c1", "Work"),
    ]);
    renderJournal();

    const cell = screen.getByText((_, element) => element?.textContent === text);
    expect(cell).toHaveClass(colorClass);
  });

  it("renders a negative overall average delay without a plus sign", () => {
    seedJournal({ c1: makeStats("c1", defaultRecords(), { averageDelayMinutes: -4 }) }, [
      makeCommute("c1", "Work"),
    ]);
    renderJournal();

    // Overall summary cell renders "-4" followed by an "m" unit span.
    const summaryCell = screen.getByText((_, element) => element?.textContent === "-4m");
    expect(summaryCell).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Trip history expansion
// ---------------------------------------------------------------------------

describe("JournalScreen trip history", () => {
  function seedAndExpand() {
    seedJournal({ c1: makeStats("c1", defaultRecords()) }, [makeCommute("c1", "Work")]);
    renderJournal();
    fireEvent.click(screen.getByRole("button", { name: "Show trip history" }));
  }

  it("expands and collapses the history list", () => {
    seedJournal({ c1: makeStats("c1", defaultRecords()) }, [makeCommute("c1", "Work")]);
    renderJournal();

    const toggle = screen.getByRole("button", { name: "Show trip history" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide trip history" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Today • Tracked")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide trip history" }));
    expect(screen.queryByText("Today • Tracked")).not.toBeInTheDocument();
  });

  it("shows only one expanded commute at a time", () => {
    seedJournal({ c1: makeStats("c1", defaultRecords()), c2: makeStats("c2", defaultRecords()) }, [
      makeCommute("c1", "Work"),
      makeCommute("c2", "Gym"),
    ]);
    renderJournal();

    fireEvent.click(within(cardFor("Work")).getByRole("button", { name: "Show trip history" }));
    fireEvent.click(within(cardFor("Gym")).getByRole("button", { name: "Show trip history" }));

    // Gym's history is showing; Work's collapsed.
    expect(within(cardFor("Gym")).getByRole("button", { name: "Hide trip history" })).toBeTruthy();
    expect(within(cardFor("Work")).getByRole("button", { name: "Show trip history" })).toBeTruthy();
  });

  it("lists trips newest first with source, date, delay and notes", () => {
    seedAndExpand();

    const rows = screen.getAllByText("Times Sq-42 St → Grand Central-42 St");
    // One per trip row, plus the card header's route line; rows are sorted
    // date-descending so the first row is today's tracked trip.
    expect(rows.length).toBeGreaterThanOrEqual(3);

    expect(screen.getByText("Today • Tracked")).toBeInTheDocument();
    expect(screen.getByText("Yesterday • Inferred")).toBeInTheDocument();
    expect(
      screen.getByText(`${shortDate(OLD_TRIP_DATE)} • Manual`, { exact: false })
    ).toBeInTheDocument();

    // Delay badges: today is +7 min (severe), the old trip is -3 min (early).
    const lateBadge = screen.getByText("+7 min");
    expect(lateBadge).toHaveClass("text-severe");
    const earlyBadge = screen.getByText("-3 min");
    expect(earlyBadge).toHaveClass("text-mta-primary");

    // Notes render for the noted trip; the actual duration shows per row.
    expect(screen.getByText("Signal delay at 14th St")).toBeInTheDocument();
    expect(screen.getAllByText("32 min").length).toBe(1);
  });

  it("omits the delay badge when a trip has no scheduled duration", () => {
    seedAndExpand();

    // Yesterday's inferred trip has no scheduledDurationMinutes.
    const row = screen.getByText("Yesterday • Inferred").closest("button") as HTMLElement;
    expect(within(row).queryByText(/min$/, { exact: false })).not.toHaveTextContent("+");
    expect(screen.getAllByText("28 min").length).toBe(1);
  });

  it("caps the visible list at 20 trips with a count note", () => {
    const records = Array.from({ length: 25 }, (_, i) =>
      makeTrip({ id: `bulk-${i}`, date: daysAgo(i + 1), actualDurationMinutes: 30 })
    );
    seedJournal({ c1: makeStats("c1", records, { totalTrips: 25 }) }, [makeCommute("c1", "Work")]);
    renderJournal();

    fireEvent.click(screen.getByRole("button", { name: "Show trip history" }));

    expect(screen.getByText("Showing last 20 of 25 trips")).toBeInTheDocument();
    // Only 20 rows render even though 25 records exist (plus the card
    // header's own route line = 21 occurrences of the route text).
    expect(screen.getAllByText("Times Sq-42 St → Grand Central-42 St").length).toBe(21);
  });

  it("shows the empty-history message when a commute has zero records", () => {
    seedJournal({ c1: makeStats("c1", []) }, [makeCommute("c1", "Work")]);
    renderJournal();

    fireEvent.click(screen.getByRole("button", { name: "Show trip history" }));

    // The card's route line also renders "— → —"; scope to the history area
    // by asserting the centered empty message is present.
    expect(screen.getAllByText("No trips recorded yet").length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Trip record editor (lazy-loaded, through the screen)
// ---------------------------------------------------------------------------

describe("JournalScreen trip record editor", () => {
  function openEditorOnTodayTrip() {
    seedJournal({ c1: makeStats("c1", defaultRecords()) }, [makeCommute("c1", "Work")]);
    renderJournal();
    fireEvent.click(screen.getByRole("button", { name: "Show trip history" }));
    fireEvent.click(screen.getByText("Signal delay at 14th St").closest("button") as HTMLElement);
    return screen.findByRole("dialog");
  }

  it("opens the editor for the clicked trip", async () => {
    const dialog = await openEditorOnTodayTrip();

    expect(dialog).toHaveAttribute(
      "aria-label",
      "Edit trip from Times Sq-42 St to Grand Central-42 St"
    );
    expect(screen.getByRole("heading", { name: "Edit Trip" })).toBeInTheDocument();
    expect(screen.getByText("32 min actual")).toBeInTheDocument();
    // Fields are seeded from the trip record.
    expect(screen.getByLabelText("Scheduled duration (minutes)")).toHaveValue(25);
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Signal delay at 14th St");
  });

  it("saves edits through the journal store and closes", async () => {
    await openEditorOnTodayTrip();

    fireEvent.change(screen.getByLabelText("Scheduled duration (minutes)"), {
      target: { value: "28" },
    });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), {
      target: { value: "Missed the local" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const updated = useJournalStore.getState().stats["c1"]!.records.find((r) => r.id === "t-today");
    expect(updated?.notes).toBe("Missed the local");
    expect(updated?.scheduledDurationMinutes).toBe(28);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes a trip through the journal store and closes", async () => {
    await openEditorOnTodayTrip();

    fireEvent.click(screen.getByRole("button", { name: "Delete trip" }));
    // Confirmation row replaces the delete button.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const records = useJournalStore.getState().stats["c1"]!.records;
    expect(records.some((r) => r.id === "t-today")).toBe(false);
    expect(records.length).toBe(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes the editor on Escape without touching the store", async () => {
    const dialog = await openEditorOnTodayTrip();
    const before = useJournalStore.getState().stats["c1"]!.records.length;

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useJournalStore.getState().stats["c1"]!.records.length).toBe(before);
  });
});
