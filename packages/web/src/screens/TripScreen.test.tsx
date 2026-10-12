/**
 * Tests for TripScreen
 *
 * useTripTracker and useTripJournal are mocked at the module boundary; the
 * rest of the tree (DataState, TripTracker, TripProgress, LineBullet) renders
 * for real. The router is the real shim via MemoryRouter.
 *
 * Covers:
 * - Active-trip hero: ETA countdown, destination, train id, share + stop buttons
 * - "Scheduled" prefix for unassigned trains; absent hero without an arrival time
 * - Ticking ETA: countdown value and transition to "Arriving"
 * - Share via navigator.share / clipboard fallback and the composed URL
 * - Stop tracking wiring (hero back button and stop button)
 * - Prediction section (TripProgress) shown/hidden
 * - Anomaly banner branches (deviation > 0, <= 0, none, no minutes)
 * - Expired state: Ended hero, journal-logged note, error timeline, buttons gone
 * - Loading state: skeleton and "To Unknown" destination fallback
 * - Error state: error timeline renders
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TripData, TripStopInfo } from "../lib/api";
import type { TripStopProgress } from "../hooks/useTripTracker";
import { useTripJournal } from "../hooks/useTripJournal";
import { useTripTracker } from "../hooks/useTripTracker";
import TripScreen from "./TripScreen";

vi.mock("../hooks/useTripTracker", () => ({
  useTripTracker: vi.fn(),
}));

vi.mock("../hooks/useTripJournal", () => ({
  useTripJournal: vi.fn(),
}));

const mockUseTripTracker = vi.mocked(useTripTracker);
const mockUseTripJournal = vi.mocked(useTripJournal);

let NOW_MS = 0;
let NOW_S = 0;

const trackerStop = vi.fn();
const journalLogTrip = vi.fn(() => null);

const makeTripStop = (overrides: Partial<TripStopInfo> = {}): TripStopInfo => ({
  stopId: "stop-1",
  stationId: "101",
  stationName: "South Ferry",
  arrivalTime: NOW_S + 600,
  departureTime: NOW_S + 600,
  scheduledTrack: null,
  actualTrack: null,
  ...overrides,
});

const makeTrip = (overrides: Partial<TripData> = {}): TripData => ({
  tripId: "trip-1",
  routeId: "1",
  direction: "N",
  destination: "South Ferry",
  isAssigned: true,
  trainId: "789",
  stops: [
    makeTripStop({
      stopId: "stop-0",
      stationId: "725",
      stationName: "Times Sq-42 St",
      arrivalTime: NOW_S - 120,
      departureTime: NOW_S - 120,
    }),
    makeTripStop(),
  ],
  currentStopIndex: 0,
  updatedAt: NOW_MS,
  feedAge: 5,
  progressPercent: 40,
  remainingStops: 1,
  totalStops: 2,
  ...overrides,
});

const makeStops = (overrides: Partial<TripStopProgress> = {}): TripStopProgress[] => [
  {
    stopId: "stop-0",
    stationId: "725",
    stationName: "Times Sq-42 St",
    status: "current",
    arrivalTime: NOW_S - 120,
    departureTime: NOW_S - 120,
    minutesAway: null,
    ...overrides,
  },
  {
    stopId: "stop-1",
    stationId: "101",
    stationName: "South Ferry",
    status: "destination",
    arrivalTime: NOW_S + 600,
    departureTime: NOW_S + 600,
    minutesAway: 10,
  },
];

/** Full tracker return; every field TripScreen can consume. */
const trackerState = (overrides: Record<string, unknown> = {}) =>
  ({
    isActive: true,
    trip: makeTrip(),
    stops: makeStops(),
    eta: NOW_S + 600,
    minutesToDestination: 10,
    prediction: null,
    progressPercent: 40,
    isLoading: false,
    error: null,
    isExpired: false,
    updatedAt: NOW_MS,
    refresh: vi.fn(),
    stop: trackerStop,
    ...overrides,
  }) as unknown as ReturnType<typeof useTripTracker>;

const journalState = (overrides: Record<string, unknown> = {}) =>
  ({
    logTrip: journalLogTrip,
    detectAnomaly: vi.fn(() => null),
    getCommuteStats: vi.fn(() => null),
    matchedCommuteId: null,
    wasLogged: false,
    ...overrides,
  }) as unknown as ReturnType<typeof useTripJournal>;

function renderTripScreen(initialEntry = "/trip/trip-1?origin=725&dest=101") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/trip/:tripId" element={<TripScreen />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  NOW_MS = Date.now();
  NOW_S = Math.floor(NOW_MS / 1000);
  trackerStop.mockClear();
  mockUseTripTracker.mockReturnValue(trackerState());
  mockUseTripJournal.mockReturnValue(journalState());
});

afterEach(() => {
  vi.useRealTimers();
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { clipboard?: unknown }).clipboard;
});

describe("TripScreen", () => {
  describe("active trip", () => {
    it("renders the header, hero ETA, destination and train identity", () => {
      renderTripScreen();

      expect(screen.getByText("Live Trip")).toBeInTheDocument();
      expect(screen.getByText("To South Ferry")).toBeInTheDocument();
      expect(screen.getByText("10 min")).toBeInTheDocument();
      expect(screen.getByText("Train 789")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share trip progress" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Stop tracking this trip" })).toBeInTheDocument();
    });

    it("renders the stop timeline through DataState/TripTracker", () => {
      renderTripScreen();

      expect(screen.getByRole("region", { name: "Trip progress" })).toBeInTheDocument();
      expect(screen.getByText("Times Sq-42 St")).toBeInTheDocument();
      expect(screen.getByText("South Ferry")).toBeInTheDocument();
      expect(screen.getByText("Train is here")).toBeInTheDocument();
    });

    it("passes origin/dest/line context to the journal hook", () => {
      renderTripScreen();

      expect(mockUseTripJournal).toHaveBeenCalledWith(
        expect.objectContaining({
          originStationId: "725",
          destinationStationId: "101",
          line: "1",
        })
      );
    });

    it("labels an unassigned train as scheduled", () => {
      mockUseTripTracker.mockReturnValue(
        trackerState({ trip: makeTrip({ isAssigned: false, trainId: null }) })
      );

      renderTripScreen();

      expect(screen.getByText(/Scheduled/)).toBeInTheDocument();
      expect(screen.queryByText(/Train \d+/)).not.toBeInTheDocument();
    });

    it("hides the hero countdown when the last stop has no arrival time", () => {
      const trip = makeTrip({ stops: [makeTripStop({ arrivalTime: null, departureTime: null })] });
      mockUseTripTracker.mockReturnValue(trackerState({ trip }));

      renderTripScreen();

      expect(screen.queryByText("10 min")).not.toBeInTheDocument();
    });
  });

  describe("ETA countdown", () => {
    it("ticks down from the last stop's arrival time", () => {
      mockUseTripTracker.mockReturnValue(
        trackerState({
          trip: makeTrip({ stops: [makeTripStop({ arrivalTime: NOW_S + 660 })] }),
        })
      );

      renderTripScreen();

      expect(screen.getByText("11 min")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(screen.getByText("10 min")).toBeInTheDocument();
    });

    it("switches to Arriving once the ETA passes", () => {
      mockUseTripTracker.mockReturnValue(
        trackerState({
          trip: makeTrip({ stops: [makeTripStop({ arrivalTime: NOW_S + 30 })] }),
        })
      );

      renderTripScreen();
      expect(screen.getByText("1 min")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(35_000);
      });

      expect(screen.getByText("Arriving")).toBeInTheDocument();
    });
  });

  describe("share", () => {
    it("shares via navigator.share when available", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", { configurable: true, value: share });

      renderTripScreen();
      fireEvent.click(screen.getByRole("button", { name: "Share trip progress" }));
      await act(async () => {});

      expect(share).toHaveBeenCalledTimes(1);
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Live trip on 1 line",
          text: "Track my trip to South Ferry",
          url: expect.stringContaining("/trip/trip-1?origin=725&dest=101"),
        })
      );
    });

    it("falls back to copying the link when sharing is unavailable", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

      renderTripScreen();
      fireEvent.click(screen.getByRole("button", { name: "Share trip progress" }));
      await act(async () => {});

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("/trip/trip-1?origin=725&dest=101")
      );
    });

    it("swallows clipboard failures silently", async () => {
      const writeText = vi.fn().mockRejectedValue(new Error("denied"));
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

      renderTripScreen();
      fireEvent.click(screen.getByRole("button", { name: "Share trip progress" }));
      await act(async () => {});

      expect(writeText).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop tracking", () => {
    it("stops tracking and navigates back from the header button", () => {
      renderTripScreen();

      fireEvent.click(screen.getByRole("button", { name: "Go back" }));

      expect(trackerStop).toHaveBeenCalledTimes(1);
    });

    it("stops tracking from the prominent stop button", () => {
      renderTripScreen();

      fireEvent.click(screen.getByRole("button", { name: "Stop tracking this trip" }));

      expect(trackerStop).toHaveBeenCalledTimes(1);
    });

    it("hides the stop button when tracking is inactive", () => {
      mockUseTripTracker.mockReturnValue(trackerState({ isActive: false }));

      renderTripScreen();

      expect(screen.queryByRole("button", { name: "Stop tracking this trip" })).not.toBeInTheDocument();
    });
  });

  describe("prediction section", () => {
    it("renders TripProgress when a prediction exists", () => {
      mockUseTripTracker.mockReturnValue(
        trackerState({
          prediction: {
            baseEta: new Date(NOW_MS + 10 * 60_000).toISOString(),
            adjustedEta: new Date(NOW_MS + 13 * 60_000).toISOString(),
            remainingStops: 3,
            totalStops: 10,
            delayRisk: "medium",
            delayMinutesRange: "3-5 min",
          },
        })
      );

      renderTripScreen();

      expect(screen.getByText("ETA to destination")).toBeInTheDocument();
      expect(screen.getByText("13 min (+3 min)")).toBeInTheDocument();
      expect(screen.getByText("Possible delays")).toBeInTheDocument();
    });

    it("hides TripProgress when there is no prediction", () => {
      renderTripScreen();

      expect(screen.queryByText("ETA to destination")).not.toBeInTheDocument();
    });
  });

  describe("anomaly banner", () => {
    it("shows the deviation and commute baseline for an anomalous trip", () => {
      mockUseTripJournal.mockReturnValue(
        journalState({
          detectAnomaly: vi.fn(() => ({
            isAnomaly: true,
            deviationMinutes: 5,
            baselineMinutes: 15,
          })),
        })
      );
      mockUseTripTracker.mockReturnValue(trackerState({ minutesToDestination: 20 }));

      renderTripScreen();

      expect(screen.getByRole("alert")).toHaveTextContent("5 min longer than usual");
      expect(screen.getByText("Your average: ~15 min")).toBeInTheDocument();
    });

    it("uses the generic label when the deviation is not positive", () => {
      mockUseTripJournal.mockReturnValue(
        journalState({
          detectAnomaly: vi.fn(() => ({
            isAnomaly: true,
            deviationMinutes: 0,
            baselineMinutes: 15,
          })),
        })
      );
      mockUseTripTracker.mockReturnValue(trackerState({ minutesToDestination: 20 }));

      renderTripScreen();

      expect(screen.getByRole("alert")).toHaveTextContent("Unusually long trip");
    });

    it("shows no banner when the duration is not anomalous", () => {
      mockUseTripTracker.mockReturnValue(trackerState({ minutesToDestination: 10 }));

      renderTripScreen();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("does not run detection without a positive minutes-to-destination", () => {
      const detectAnomaly = vi.fn(() => null);
      mockUseTripJournal.mockReturnValue(journalState({ detectAnomaly }));
      mockUseTripTracker.mockReturnValue(trackerState({ minutesToDestination: null }));

      renderTripScreen();

      expect(detectAnomaly).not.toHaveBeenCalled();
    });
  });

  describe("expired trip", () => {
    it("shows the ended hero, the journal note and the error timeline", () => {
      mockUseTripTracker.mockReturnValue(
        trackerState({
          isActive: false,
          trip: null,
          stops: [],
          minutesToDestination: null,
          prediction: {
            baseEta: new Date(NOW_MS + 10 * 60_000).toISOString(),
            adjustedEta: null,
            remainingStops: 1,
            totalStops: 2,
            delayRisk: "low",
            delayMinutesRange: null,
          },
          isExpired: true,
        })
      );
      mockUseTripJournal.mockReturnValue(
        journalState({ matchedCommuteId: "commute-1", wasLogged: true })
      );

      renderTripScreen();

      expect(screen.getByText("Ended")).toBeInTheDocument();
      expect(screen.getByText("✓ Trip logged to your commute journal")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByText("ETA to destination")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Share trip progress" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Stop tracking this trip" })).not.toBeInTheDocument();
    });

    it("omits the journal note when the trip was not logged to a commute", () => {
      mockUseTripTracker.mockReturnValue(trackerState({ trip: null, stops: [], isExpired: true }));
      mockUseTripJournal.mockReturnValue(journalState({ matchedCommuteId: null, wasLogged: true }));

      renderTripScreen();

      expect(screen.getByText("Ended")).toBeInTheDocument();
      expect(screen.queryByText(/Trip logged/)).not.toBeInTheDocument();
    });
  });

  describe("non-success states", () => {
    it("shows the timeline skeleton while loading without a destination fallback", () => {
      mockUseTripTracker.mockReturnValue(
        trackerState({ trip: null, stops: [], isLoading: true, isActive: true })
      );

      renderTripScreen("/trip/trip-1");

      expect(screen.getByLabelText("Loading trip progress")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Share trip progress" })).not.toBeInTheDocument();
      expect(screen.getByText("To Unknown")).toBeInTheDocument();
    });

    it("shows an error panel when loading failed", () => {
      mockUseTripTracker.mockReturnValue(
        trackerState({ trip: null, stops: [], isLoading: false, error: "Failed to load trip" })
      );

      renderTripScreen();

      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.queryByLabelText("Loading trip progress")).not.toBeInTheDocument();
    });
  });
});
