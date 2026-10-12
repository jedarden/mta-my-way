/**
 * Tests for StationScreen — the /station/:stationId route.
 *
 * StationScreen is a thin composition shell: station metadata from
 * api.getStation, arrivals/equipment/alerts from their hooks, and a
 * favorites button whose behaviour flips on whether the station is already
 * favorited. These tests pin that wiring — the child components
 * (ArrivalList, AlertBanner, FavoriteEditor, BottomNav) have their own
 * suites and are stubbed here.
 */

import type {
  ArrivalTime,
  EquipmentStatus,
  Favorite,
  StationAlert,
  StationArrivals,
} from "@mta-my-way/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Station } from "../lib/api";
import { makeArrival, makeFavorite, makeStationAlert } from "../test/factories";

// ---------------------------------------------------------------------------
// Module mocks — fixtures are plain lets read at call time (AlertsScreen pattern)
// ---------------------------------------------------------------------------

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, getStation: vi.fn() },
  };
});

const refreshSpy = vi.fn();
let arrivalsStatus = "success";
let arrivalsData: StationArrivals | null = null;
let arrivalsUpdatedAt: number | null = null;

vi.mock("../hooks/useArrivals", () => ({
  useArrivals: () => ({
    status: arrivalsStatus,
    data: arrivalsData,
    error: null,
    updatedAt: arrivalsUpdatedAt,
    refresh: refreshSpy,
  }),
}));

let equipmentFixture: EquipmentStatus[] = [];

vi.mock("../hooks/useEquipment", () => ({
  useEquipment: () => ({
    equipment: equipmentFixture,
    summary: null,
    hasBrokenElevators: false,
    hasBrokenEscalators: false,
    adaAccessible: true,
    status: "success",
    error: null,
  }),
}));

let stationAlertsFixture: StationAlert[] = [];

vi.mock("../hooks/useAlerts", () => ({
  useAlerts: () => ({
    alerts: [],
    status: "success",
    meta: null,
    error: null,
    updatedAt: null,
    refresh: () => {},
    myAlerts: [],
    myAlertsCount: 0,
    filterMode: "all" as const,
    setFilterMode: () => {},
  }),
  useAlertsForStation: () => ({
    alerts: stationAlertsFixture,
    status: "success",
    refresh: () => {},
  }),
}));

const addFavoriteSpy = vi.fn();
const updateFavoriteSpy = vi.fn();
const removeFavoriteSpy = vi.fn();
let favoritesFixture: Favorite[] = [];

vi.mock("../hooks/useFavorites", () => ({
  useFavorites: () => ({
    favorites: favoritesFixture,
    hasFavorites: favoritesFixture.length > 0,
    onboardingComplete: true,
    addFavorite: addFavoriteSpy,
    updateFavorite: updateFavoriteSpy,
    removeFavorite: removeFavoriteSpy,
    reorderFavorites: () => {},
    togglePin: () => {},
    recordTap: () => {},
    completeOnboarding: () => {},
  }),
}));

// Layout shell and the heavy list component are covered by their own suites.
vi.mock("../components/layout/BottomNav", () => ({
  default: () => <nav data-testid="bottom-nav" />,
}));

vi.mock("../components/common/OfflineBanner", () => ({
  default: () => <div data-testid="offline-banner" />,
}));

vi.mock("../components/arrivals/ArrivalList", () => ({
  ArrivalList: ({
    northbound,
    onTrackTrip,
  }: {
    northbound: ArrivalTime[];
    onTrackTrip: (a: ArrivalTime) => void;
  }) => (
    <div data-testid="arrival-list">
      {northbound.map((a) => (
        <button key={a.tripId} type="button" onClick={() => onTrackTrip(a)}>
          Track {a.destination}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../components/favorites/FavoriteEditor", () => ({
  FavoriteEditor: ({
    onSave,
    onDelete,
    onClose,
  }: {
    onSave: (u: Partial<Favorite>) => void;
    onDelete: () => void;
    onClose: () => void;
  }) => (
    <div data-testid="favorite-editor">
      <button type="button" onClick={() => onSave({ label: "Work" })}>
        Save favorite
      </button>
      <button type="button" onClick={onDelete}>
        Delete favorite
      </button>
      <button type="button" onClick={onClose}>
        Close editor
      </button>
    </div>
  ),
}));

import { api } from "../lib/api";
import StationScreen from "./StationScreen";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const stationFixture: Station = {
  id: "725",
  name: "Times Sq-42 St",
  lat: 40.755,
  lon: -73.987,
  lines: ["7", "N", "Q"],
  northStopId: "725N",
  southStopId: "725S",
  transfers: [],
  ada: true,
  borough: "manhattan",
};

const northboundArrival = makeArrival({
  tripId: "trip-nb",
  destination: "South Ferry",
});

function makeArrivalsData(overrides: Partial<StationArrivals> = {}): StationArrivals {
  return {
    stationId: "725",
    stationName: "Times Sq-42 St",
    updatedAt: Math.floor(Date.now() / 1000),
    feedAge: 5,
    northbound: [northboundArrival],
    southbound: [],
    alerts: [],
    ...overrides,
  };
}

/** Renders the current pathname so navigation assertions have something to read. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderStationScreen(stationId = "725") {
  return render(
    <MemoryRouter initialEntries={[`/station/${stationId}`]}>
      <Routes>
        <Route path="/station/:stationId" element={<StationScreen />} />
        <Route path="/trip/:tripId" element={<div>Trip reached</div>} />
        <Route path="/" element={<div>Home reached</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  arrivalsStatus = "success";
  arrivalsData = makeArrivalsData();
  arrivalsUpdatedAt = null;
  equipmentFixture = [];
  stationAlertsFixture = [];
  favoritesFixture = [];
  vi.mocked(api.getStation).mockReset();
  vi.mocked(api.getStation).mockResolvedValue(stationFixture);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StationScreen", () => {
  it("renders the station name, line bullets and arrivals once metadata resolves", async () => {
    renderStationScreen();

    // Station name comes from api.getStation and lands in the focused heading.
    const heading = await screen.findByRole("heading", { name: /times sq-42 st/i });
    expect(heading).toBeInTheDocument();

    // One real LineBullet per line serving the station.
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.getByText("Q")).toBeInTheDocument();

    // Arrivals section with the stubbed list wired to the hook's data.
    expect(screen.getByRole("heading", { name: "Arrivals" })).toBeInTheDocument();
    expect(screen.getByTestId("arrival-list")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /track south ferry/i })).toBeInTheDocument();
    expect(screen.getByTestId("bottom-nav")).toBeInTheDocument();
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });

  it("exposes a skip link targeting the main landmark", () => {
    renderStationScreen();

    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#station-main");
    expect(document.getElementById("station-main")).not.toBeNull();
  });

  it("falls back to the arrivals station name and shows the error when getStation fails", async () => {
    vi.mocked(api.getStation).mockRejectedValue(new Error("station lookup failed"));
    renderStationScreen();

    expect(await screen.findByText("station lookup failed")).toBeInTheDocument();
    // No station metadata -> no line bullets row.
    expect(screen.queryByText("7")).not.toBeInTheDocument();
    // Name falls back to the arrivals payload's stationName.
    expect(screen.getByRole("heading", { name: /times sq-42 st/i })).toBeInTheDocument();
  });

  it("shows the arrivals error state with a retry that re-invokes the hook refresh", async () => {
    arrivalsStatus = "error";
    arrivalsData = null;
    renderStationScreen();

    // DataState routes through ApiErrorDisplay with an UNKNOWN error type,
    // which presents the generic message rather than the raw error string.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/something went wrong/i);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refreshSpy).toHaveBeenCalled();
  });

  it("shows the freshness footer when updatedAt is set but no arrivals data loaded", () => {
    arrivalsStatus = "error";
    arrivalsData = null;
    arrivalsUpdatedAt = Date.now();
    renderStationScreen();

    // formatTimeAgo(0) -> "0s ago"; the screen prefixes "Updated ".
    expect(screen.getByText(/updated 0s ago/i)).toBeInTheDocument();
  });

  it("adds the station to favorites when none exists yet", async () => {
    renderStationScreen();
    await screen.findByRole("heading", { name: /times sq-42 st/i });

    const favButton = screen.getByRole("button", {
      name: /add times sq-42 st to favorites/i,
    });
    expect(favButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(favButton);
    expect(addFavoriteSpy).toHaveBeenCalledWith({
      stationId: "725",
      stationName: "Times Sq-42 St",
      lines: ["7", "N", "Q"],
      direction: "both",
      pinned: false,
    });
    // No editor is opened for a brand-new favorite.
    expect(screen.queryByTestId("favorite-editor")).not.toBeInTheDocument();
  });

  it("opens the editor for an existing favorite and wires save, delete and close", async () => {
    favoritesFixture = [
      makeFavorite({ id: "fav-1", stationId: "725", stationName: "Times Sq-42 St" }),
    ];
    renderStationScreen();
    await screen.findByRole("heading", { name: /times sq-42 st/i });

    const favButton = screen.getByRole("button", {
      name: /times sq-42 st is in your favorites/i,
    });
    expect(favButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(favButton);
    // The editor is lazy-loaded, so it appears a tick after state flips.
    expect(await screen.findByTestId("favorite-editor")).toBeInTheDocument();

    // Save hands the update to updateFavorite and closes the modal.
    fireEvent.click(screen.getByRole("button", { name: /save favorite/i }));
    expect(updateFavoriteSpy).toHaveBeenCalledWith("fav-1", { label: "Work" });
    expect(screen.queryByTestId("favorite-editor")).not.toBeInTheDocument();

    // Delete removes by id and closes.
    fireEvent.click(favButton);
    fireEvent.click(await screen.findByRole("button", { name: /delete favorite/i }));
    expect(removeFavoriteSpy).toHaveBeenCalledWith("fav-1");
    expect(screen.queryByTestId("favorite-editor")).not.toBeInTheDocument();

    // Close leaves the favorite untouched.
    fireEvent.click(favButton);
    fireEvent.click(await screen.findByRole("button", { name: /close editor/i }));
    expect(screen.queryByTestId("favorite-editor")).not.toBeInTheDocument();
    expect(updateFavoriteSpy).toHaveBeenCalledTimes(1);
    expect(removeFavoriteSpy).toHaveBeenCalledTimes(1);
  });

  it("navigates to /trip/:tripId with origin and destination when a train is tracked", async () => {
    renderStationScreen();
    fireEvent.click(await screen.findByRole("button", { name: /track south ferry/i }));

    const location = screen.getByTestId("location");
    expect(location).toHaveTextContent("/trip/trip-nb");
    expect(location).toHaveTextContent("origin=725");
    expect(location).toHaveTextContent(`dest=${encodeURIComponent("South Ferry")}`);
    expect(screen.getByText("Trip reached")).toBeInTheDocument();
  });

  it("tracks a trip without a destination by omitting the dest param", async () => {
    arrivalsData = makeArrivalsData({
      northbound: [makeArrival({ tripId: "trip-nodefault", destination: "" })],
    });
    renderStationScreen();

    // With no destination the button's accessible name is just "Track".
    fireEvent.click(await screen.findByRole("button", { name: "Track" }));
    const location = screen.getByTestId("location");
    expect(location).toHaveTextContent("/trip/trip-nodefault?origin=725");
    expect(location).not.toHaveTextContent("dest=");
  });

  it("renders station alerts and equipment outage banners when present", async () => {
    stationAlertsFixture = [
      makeStationAlert({ id: "a1", affectedLines: ["7"], headline: "Delays on the 7" }),
    ];
    equipmentFixture = [
      {
        stationId: "725",
        type: "elevator",
        description: "Elevator to mezzanine",
        isActive: false,
        ada: true,
      },
    ];
    renderStationScreen();

    expect(await screen.findByText("Delays on the 7")).toBeInTheDocument();
    expect(screen.getByLabelText(/equipment outages at times sq-42 st/i)).toBeInTheDocument();
  });

  it("invokes the arrivals refresh from the refresh button", async () => {
    renderStationScreen();
    await screen.findByTestId("arrival-list");

    fireEvent.click(screen.getByRole("button", { name: /refresh arrivals/i }));
    expect(refreshSpy).toHaveBeenCalled();
  });
});
