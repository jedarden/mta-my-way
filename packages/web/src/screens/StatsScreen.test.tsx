/**
 * Tests for StatsScreen — the "Your Subway Year" route.
 *
 * StatsScreen keeps its own header instead of Screen's, so it renders the
 * shell's SkipLink and MainContent directly; these tests pin that contract on
 * the route where the WCAG audit found the skip link had no target
 * (docs/notes/wcag-audit-baseline.md).
 *
 * Beyond the a11y shell, the screen is a pure client-side aggregation of the
 * journal store, so the bulk of the suite seeds real store state (the
 * FareTracker test pattern — no store mock to keep in sync) and asserts the
 * computed aggregates per time window: data present vs empty, window
 * switching, streak/anomaly math, the focus-on-navigation effect, and the
 * share-as-PNG download fallback.
 */

import type { CommuteStats, TripRecord } from "@mta-my-way/shared";
import {
  calculateCarbonSavingsSummary,
  formatCarbonSavings,
  formatDistance,
  haversineDistance,
} from "@mta-my-way/shared";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useJournalStore } from "../stores";
import StatsScreen from "./StatsScreen";

// The share path renders the card to a PNG via html2canvas. A fake canvas
// whose toBlob yields a real Blob lets the whole handler run in jsdom.
vi.mock("html2canvas", () => ({
  default: vi.fn(async () => ({
    toBlob: (callback: (blob: Blob | null) => void) => {
      callback(new Blob(["png"], { type: "image/png" }));
    },
  })),
}));

// The station index fetches on mount; the screen only needs id/lat/lon from
// it. vi.hoisted keeps the mutable fixture available to the hoisted mock
// factory, and lets individual tests flip it into the loading state.
const stationIndex = vi.hoisted(() => ({
  stations: [] as Array<{ id: string; lat: number; lon: number }>,
  complexes: [] as Array<Record<string, never>>,
  loading: false,
  error: null as string | null,
}));

vi.mock("../hooks/useStationIndex", () => ({
  useStationIndex: () => ({
    stations: stationIndex.stations,
    complexes: stationIndex.complexes,
    loading: stationIndex.loading,
    error: stationIndex.error,
  }),
}));

// Coordinates for the fixture stations, mirroring what the real index serves.
const STATION_COORDS = [
  { id: "725", lat: 40.755, lon: -73.987 }, // Times Sq-42 St
  { id: "101", lat: 40.703, lon: -74.013 }, // South Ferry
  { id: "724", lat: 40.7518, lon: -73.9767 }, // Grand Central-42 St
  // 901/902 deliberately absent: trips between them exercise the
  // no-coordinates skip in the distance accumulation.
];

const COORDS = new Map(STATION_COORDS.map((s) => [s.id, { lat: s.lat, lon: s.lon }]));

/** Local calendar date n days ago, as the ISO YYYY-MM-DD the journal stores. */
const daysAgo = (n: number): string => {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
};

const makeTrip = (overrides: Partial<TripRecord> = {}): TripRecord => ({
  id: "trip-1",
  date: daysAgo(0),
  origin: { stationId: "725", stationName: "Times Sq-42 St" },
  destination: { stationId: "101", stationName: "South Ferry" },
  line: "1",
  departureTime: Date.now() - 600_000,
  arrivalTime: Date.now(),
  actualDurationMinutes: 10,
  source: "manual",
  ...overrides,
});

const makeCommute = (commuteId: string, records: TripRecord[]): CommuteStats => ({
  commuteId,
  averageDurationMinutes: 10,
  medianDurationMinutes: 10,
  stdDevMinutes: 2,
  totalTrips: records.length,
  tripsThisWeek: records.length,
  trend: 0,
  averageDelayMinutes: 0,
  maxDelayMinutes: 0,
  onTimePercentage: 100,
  records,
});

/**
 * Seed three commutes:
 * - "work": four consecutive recent line-1 trips with durations [10,10,10,40]
 *   — the 40 is >1.5 stdDevs above the line mean, so it lands in Delay Days,
 *   and the four consecutive dates make both streaks 4.
 * - "past": one line-7 trip ~5 weeks back (inside This Year, outside the
 *   month/quarter) ending at 725 so it nudges the top-station tally.
 * - "archive": one line-A trip ~400 days back, visible only under All Time,
 *   between stations with no coordinates in the index.
 */
const seedJournal = () => {
  const recent = [0, 1, 2, 3].map((n) =>
    makeTrip({
      id: `recent-${n}`,
      date: daysAgo(n),
      actualDurationMinutes: n === 3 ? 40 : 10,
    })
  );
  const past = [
    makeTrip({
      id: "past-0",
      date: daysAgo(35),
      line: "7",
      actualDurationMinutes: 20,
      origin: { stationId: "724", stationName: "Grand Central-42 St" },
      destination: { stationId: "725", stationName: "Times Sq-42 St" },
    }),
  ];
  const archive = [
    makeTrip({
      id: "archive-0",
      date: daysAgo(400),
      line: "A",
      actualDurationMinutes: 30,
      origin: { stationId: "901", stationName: "Inwood-207 St" },
      destination: { stationId: "902", stationName: "Far Rockaway" },
    }),
  ];
  useJournalStore.setState({
    stats: {
      work: makeCommute("work", recent),
      past: makeCommute("past", past),
      archive: makeCommute("archive", archive),
    },
  });
};

const allRecords = (): TripRecord[] =>
  Object.values(useJournalStore.getState().stats).flatMap((c) => c.records);

// The screen's own window math, mirrored so expectations hold even when a
// boundary day (Jan 1, the 1st of a month) is crossed at run time.
const windowStart = (key: "month" | "quarter" | "year" | "all"): Date | null => {
  const now = new Date();
  switch (key) {
    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter":
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case "year":
      return new Date(now.getFullYear(), 0, 1);
    case "all":
      return null;
  }
};

/** Everything the card/detail render, recomputed from the filtered records. */
const aggregate = (records: TripRecord[]) => {
  const filtered = records.length > 0 ? records : []; // callers pass the already-filtered list
  let km = 0;
  const lineCounts: Record<string, number> = {};
  const stationCounts: Record<string, number> = {};
  const stationIds = new Set<string>();
  for (const r of filtered) {
    stationIds.add(r.origin.stationId);
    stationIds.add(r.destination.stationId);
    stationCounts[r.origin.stationId] = (stationCounts[r.origin.stationId] ?? 0) + 1;
    stationCounts[r.destination.stationId] = (stationCounts[r.destination.stationId] ?? 0) + 1;
    lineCounts[r.line] = (lineCounts[r.line] ?? 0) + 1;
    const o = COORDS.get(r.origin.stationId);
    const d = COORDS.get(r.destination.stationId);
    if (o && d) km += haversineDistance(o.lat, o.lon, d.lat, d.lon);
  }
  return {
    trips: filtered.length,
    minutes: Math.round(filtered.reduce((sum, r) => sum + r.actualDurationMinutes, 0)),
    km: Math.round(km * 10) / 10,
    uniqueStations: stationIds.size,
    topLineCount: Math.max(0, ...Object.values(lineCounts)),
  };
};

const inWindow = (key: "month" | "quarter" | "year" | "all"): TripRecord[] => {
  const start = windowStart(key);
  const records = allRecords();
  return start === null
    ? records
    : records.filter((r) => new Date(r.date).getTime() >= start.getTime());
};

const formatHours = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={["/stats"]}>
      <Routes>
        <Route path="/stats" element={<StatsScreen />} />
        <Route path="/commute" element={<div data-testid="commute-screen" />} />
        <Route path="/journal" element={<div data-testid="journal-screen" />} />
      </Routes>
    </MemoryRouter>
  );

/** The shareable gradient card root (scoped to main: the h1 says the same). */
const cardScope = () =>
  within(
    within(screen.getByRole("main")).getByText("Your Subway Year").closest("div")!
      .parentElement! as HTMLElement
  );

/** Value shown to the right of a card row label ("Distance", "Top Line", …). */
const cardRow = (label: string): string => {
  const scope = cardScope();
  return scope.getByText(label).parentElement?.lastElementChild?.textContent ?? "";
};

/** The scrollable detail section below the card. */
const detailScope = () =>
  within(screen.getByRole("heading", { name: "This Year Details" }).parentElement! as HTMLElement);

/** Value <p> of a detail row ("Delay Days", "Current Streak", …). */
const detailRow = (label: string): string => {
  const scope = detailScope();
  return scope.getByText(label).parentElement?.querySelector("p")?.textContent ?? "";
};

/** Big-number tile value, addressed by its caption ("Trips Taken", …). */
const bigNumber = (label: string): string =>
  screen.getByText(label).previousElementSibling?.textContent ?? "";

describe("StatsScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    useJournalStore.setState({ stats: {}, dayOfWeekStats: {}, lastStationVisit: null });
    stationIndex.stations = STATION_COORDS;
    stationIndex.complexes = [];
    stationIndex.loading = false;
    stationIndex.error = null;
  });

  describe("accessibility shell", () => {
    it("renders the Screen shell's skip link and main landmark", () => {
      renderScreen();

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

  describe("empty journal", () => {
    // With an empty journal StatsScreen hands DataState data=null with
    // status "success" and no `empty` prop, so DataState renders nothing
    // below the header — the window selector, card and share button never
    // appear. Pin that observable contract.
    it("renders no window selector or aggregates below the header", () => {
      renderScreen();

      expect(screen.getByRole("heading", { name: "Your Subway Year" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "This Month" })).not.toBeInTheDocument();
      expect(screen.queryByText("Trips Taken")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /share my subway year/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("aggregates (default This Year window)", () => {
    it("renders the SubwayYear card from the journal records", () => {
      seedJournal();
      renderScreen();

      const year = aggregate(inWindow("year"));

      const card = cardScope();
      expect(card.getByText("Your Subway Year")).toBeInTheDocument();
      expect(card.getByText("This Year")).toBeInTheDocument();
      expect(card.getByText(String(new Date().getFullYear()))).toBeInTheDocument();

      // Big-number row.
      expect(bigNumber("Trips Taken")).toBe(String(year.trips));
      expect(bigNumber("Underground")).toBe(formatHours(year.minutes));

      // Detail rows on the card itself.
      expect(cardRow("Distance")).toBe(formatDistance(year.km));
      expect(cardRow("Top Station")).toBe("Times Sq-42 St");
      expect(cardRow("Top Line")).toBe("1");
      expect(cardRow("Stations Visited")).toBe(String(year.uniqueStations));
      // [10,10,10,40] on line 1: 40 > mean + 1.5·stdDev → one delay day.
      expect(cardRow("Delay Days")).toBe("1");
      // Four consecutive trip dates ending today.
      expect(cardRow("Longest Streak")).toBe("4 days");

      // Carbon block derives from the same distance total.
      expect(
        card.getByText(formatCarbonSavings(calculateCarbonSavingsSummary(year.km).savingsKg))
      ).toBeInTheDocument();
    });

    it("renders the four detail sections with their subs", () => {
      seedJournal();
      renderScreen();

      const year = aggregate(inWindow("year"));
      const detail = detailScope();
      for (const title of ["Overview", "Favorites", "Reliability", "Environmental Impact"]) {
        expect(detail.getByRole("heading", { name: title })).toBeInTheDocument();
      }

      expect(detailRow("Total Trips")).toBe(String(year.trips));
      expect(detailRow("Time Underground")).toBe(formatHours(year.minutes));
      expect(detailRow("Distance Traveled")).toBe(formatDistance(year.km));
      expect(detailRow("Unique Stations")).toBe(String(year.uniqueStations));
      expect(detailRow("Most-Used Station")).toBe("Times Sq-42 St");
      expect(detailRow("Most-Used Line")).toBe("1");
      expect(detailRow("Current Streak")).toBe("4 days");
      expect(detailRow("Longest Streak")).toBe("4 days");
      expect(detail.getByText(`${year.topLineCount} trips`)).toBeInTheDocument();
      // 725 boards four recent trips plus the "past" arrival = five visits.
      expect(detail.getByText("5 visits")).toBeInTheDocument();
      expect(detail.getByText("trips 1.5x above normal")).toBeInTheDocument();
    });

    it("marks the active window button and leaves the others unpressed", () => {
      seedJournal();
      renderScreen();

      const active = screen.getByRole("button", { name: "This Year" });
      expect(active).toHaveAttribute("aria-pressed", "true");
      expect(active).toHaveClass("bg-mta-primary", "text-white");

      for (const label of ["This Month", "This Quarter", "All Time"]) {
        const button = screen.getByRole("button", { name: label });
        expect(button).toHaveAttribute("aria-pressed", "false");
        expect(button).not.toHaveClass("bg-mta-primary");
      }
    });

    it("uses singular day units when the streak is a single day", () => {
      useJournalStore.setState({
        stats: {
          solo: makeCommute("solo", [
            makeTrip({ id: "solo-0", date: daysAgo(0), actualDurationMinutes: 25 }),
          ]),
        },
      });
      renderScreen();

      // Card Longest Streak + detail Current/Longest Streak all read "1 day".
      expect(screen.getAllByText("1 day")).toHaveLength(3);
    });
  });

  describe("time window switching", () => {
    it("recomputes the aggregates for each window", () => {
      seedJournal();
      renderScreen();

      const recs = allRecords();
      const counts = {
        month: aggregate(inWindow("month")).trips,
        quarter: aggregate(inWindow("quarter")).trips,
        year: aggregate(inWindow("year")).trips,
        all: recs.length,
      };

      // Default: This Year.
      expect(bigNumber("Trips Taken")).toBe(String(counts.year));
      expect(screen.getByRole("heading", { name: "This Year Details" })).toBeInTheDocument();

      // All Time includes the archive commute only visible there.
      fireEvent.click(screen.getByRole("button", { name: "All Time" }));
      expect(bigNumber("Trips Taken")).toBe(String(counts.all));
      expect(screen.getByRole("heading", { name: "All Time Details" })).toBeInTheDocument();
      // 70 + 20 + 30 = 120 minutes → the exact-hours formatter branch.
      expect(bigNumber("Underground")).toBe(formatHours(120));

      // This Month keeps only the four consecutive recent trips.
      fireEvent.click(screen.getByRole("button", { name: "This Month" }));
      expect(bigNumber("Trips Taken")).toBe(String(counts.month));
      expect(bigNumber("Underground")).toBe(formatHours(70));
      expect(screen.getByRole("button", { name: "This Month" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      expect(screen.getByRole("button", { name: "All Time" })).toHaveAttribute(
        "aria-pressed",
        "false"
      );

      // This Quarter: same recent trips (the 35-day-old ride predates it).
      fireEvent.click(screen.getByRole("button", { name: "This Quarter" }));
      expect(bigNumber("Trips Taken")).toBe(String(counts.quarter));
      expect(screen.getByRole("heading", { name: "This Quarter Details" })).toBeInTheDocument();
    });
  });

  describe("loading", () => {
    it("renders content-shaped skeletons while the station index loads", () => {
      // No journal data: DataState only takes the skeleton branch when the
      // data prop is null/empty alongside the loading status.
      stationIndex.loading = true;
      const { container } = renderScreen();

      expect(container.querySelectorAll("div.skeleton")).toHaveLength(4);
      expect(screen.queryByText("Trips Taken")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Your Subway Year" })).toBeInTheDocument();
    });
  });

  describe("navigation focus", () => {
    it("moves focus to the main landmark after a route change", () => {
      vi.useFakeTimers();
      try {
        render(
          <MemoryRouter initialEntries={["/stats"]}>
            <Routes>
              {/* StatsScreen at both paths so the mounted instance survives
                  the navigation and its location effect actually fires. */}
              <Route path="/stats" element={<StatsScreen />} />
              <Route path="/journal" element={<StatsScreen />} />
            </Routes>
          </MemoryRouter>
        );

        const main = screen.getByRole("main");
        expect(main).not.toHaveFocus();

        fireEvent.click(screen.getByRole("button", { name: "Back to journal" }));

        act(() => {
          vi.advanceTimersByTime(100);
        });

        expect(screen.getByRole("main")).toHaveFocus();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("sharing", () => {
    it("falls back to a PNG download when the Web Share API is unavailable", async () => {
      seedJournal();
      const createObjectURL = vi.fn(() => "blob:subway-year");
      const revokeObjectURL = vi.fn();
      const anchorClick = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
      try {
        renderScreen();

        const share = screen.getByRole("button", { name: /share my subway year/i });
        expect(share).toBeEnabled();

        await act(async () => {
          fireEvent.click(share);
        });

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledTimes(1);
        expect(anchorClick).toHaveBeenCalledOnce();
        // The finally block clears the sharing flag again.
        expect(share).toBeEnabled();
        expect(screen.getByRole("button", { name: /share my subway year/i })).toBeInTheDocument();
      } finally {
        anchorClick.mockRestore();
        URL.createObjectURL = originalCreate as unknown as typeof URL.createObjectURL;
        URL.revokeObjectURL = originalRevoke as unknown as typeof URL.revokeObjectURL;
      }
    });
  });
});
