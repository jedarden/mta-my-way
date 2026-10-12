import type { CommuteStats, TripRecord } from "@mta-my-way/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFareStore } from "../../stores/fareStore";
import { useJournalStore } from "../../stores/journalStore";
import { SubwayYear } from "./SubwayYear";

vi.mock("html2canvas", () => ({
  default: vi.fn().mockRejectedValue(new Error("image export unavailable")),
}));

function trip(id: string, date: string, minutes: number, line = "7"): TripRecord {
  return {
    id,
    date,
    origin: { stationId: "725", stationName: "Times Sq-42 St" },
    destination: { stationId: "631", stationName: "Grand Central-42 St" },
    line,
    departureTime: 1_700_000_000,
    arrivalTime: 1_700_001_800,
    actualDurationMinutes: minutes,
    source: "manual",
  };
}

function commuteStats(records: TripRecord[]): CommuteStats {
  return {
    commuteId: "work",
    averageDurationMinutes: 30,
    medianDurationMinutes: 30,
    stdDevMinutes: 5,
    totalTrips: records.length,
    tripsThisWeek: 0,
    trend: 0,
    averageDelayMinutes: 0,
    maxDelayMinutes: 0,
    onTimePercentage: 100,
    records,
  };
}

describe("SubwayYear", () => {
  beforeEach(() => {
    useJournalStore.setState({ stats: {}, dayOfWeekStats: {} });
    useFareStore.setState((state) => ({
      tracking: { ...state.tracking, weeklyRides: 4, currentFare: 2.9 },
    }));
  });

  afterEach(() => {
    useJournalStore.setState({ stats: {}, dayOfWeekStats: {} });
  });

  it("shows an empty state when there are no trips in the selected window", () => {
    useJournalStore.setState({ stats: { work: commuteStats([trip("old", "2025-12-31", 30)]) } });

    render(<SubwayYear timeWindow="year" fromDate="2026-10-12" />);

    expect(screen.getByText(/No trips recorded yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("aggregates trips, filters the month, and shows the fare spend", () => {
    useJournalStore.setState({
      stats: {
        work: commuteStats([
          trip("sept", "2026-09-30", 60, "A"),
          trip("oct-1", "2026-10-05", 10),
          trip("oct-2", "2026-10-06", 20),
        ]),
      },
    });

    const { rerender } = render(<SubwayYear timeWindow="month" fromDate="2026-10-12" />);
    expect(screen.getByText("This Month")).toBeInTheDocument();
    expect(screen.getByText("2", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("15 mi")).toBeInTheDocument();
    expect(screen.getByText("Times Sq-42 St")).toBeInTheDocument();
    expect(screen.getByText("$12")).toBeInTheDocument();

    rerender(<SubwayYear timeWindow="all" fromDate="2026-10-12" />);
    expect(screen.getByText("All Time")).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("45 mi")).toBeInTheDocument();
  });

  it("recovers after image generation fails and allows sharing again", async () => {
    useJournalStore.setState({ stats: { work: commuteStats([trip("one", "2026-10-05", 30)]) } });
    // html2canvas cannot paint in jsdom; the component should swallow export errors
    // and restore the button so a user can retry.
    render(<SubwayYear timeWindow="quarter" fromDate="2026-10-12" />);
    expect(screen.getByText("This Quarter")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Share" })).toBeEnabled());
  });
});
