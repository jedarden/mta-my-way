/**
 * Tests for MapScreen — the /map route hosting TransitMap.
 *
 * Covers the lifecycle TransitMap itself knows nothing about:
 * - loading stations and routes, then mounting the real map component
 * - pulling train positions for every route and refreshing them
 * - the line filter narrowing which lines are drawn
 * - the error path and the station-details modal
 */

import type { Route, Station } from "@mta-my-way/shared";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { makeLineDiagram, makeTrainPosition } from "../test/factories";
import MapScreen from "./MapScreen";

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  api: {
    getStations: vi.fn(),
    getRoutes: vi.fn(),
    getPositions: vi.fn(),
  },
}));

// BottomNav reads the alert feed for its badge; the feed is unrelated to the map.
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
}));

const SOUTH_FERRY: Station = {
  id: "101",
  name: "South Ferry",
  lat: 40.7014,
  lon: -74.0132,
  lines: ["1"],
  northStopId: "101N",
  southStopId: "101S",
  transfers: [],
  ada: true,
  borough: "manhattan",
};

const RECTOR_ST: Station = {
  id: "102",
  name: "Rector St",
  lat: 40.7075,
  lon: -74.0134,
  lines: ["1"],
  northStopId: "102N",
  southStopId: "102S",
  transfers: [],
  ada: false,
  borough: "manhattan",
};

const STATIONS = [SOUTH_FERRY, RECTOR_ST];

const ROUTES: Route[] = [
  {
    id: "1",
    shortName: "1",
    longName: "Broadway-7 Avenue Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102"],
    isExpress: false,
  },
  {
    id: "A",
    shortName: "A",
    longName: "8 Avenue Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["101", "102"],
    isExpress: false,
  },
];

const STOPS = [
  { stopId: "101", stopName: "South Ferry", isTerminal: true, isTransferStation: false },
  { stopId: "102", stopName: "Rector St", isTerminal: true, isTransferStation: false },
];

const LINE_ONE = makeLineDiagram({
  routeId: "1",
  routeColor: "#EE352E",
  stops: STOPS,
  trains: [
    makeTrainPosition({
      tripId: "trip-1",
      routeId: "1",
      direction: "N",
      lastStopId: "101",
      nextStopId: "102",
      progress: 0.5,
      destination: "South Ferry",
    }),
  ],
});

const LINE_A = makeLineDiagram({
  routeId: "A",
  routeColor: "#0039A6",
  stops: STOPS,
  trains: [],
});

const renderMapScreen = () =>
  render(
    <MemoryRouter initialEntries={["/map"]}>
      <MapScreen />
    </MemoryRouter>
  );

/**
 * Drain pending promise chains (the api calls and the lazy chunks) inside act().
 * Fake timers are never advanced here, so only microtasks settle.
 */
const settle = async () => {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const transitMap = () => screen.getByRole("img", { name: /Interactive transit map/i });

const positionCalls = () => vi.mocked(api.getPositions).mock.calls.length;

// MapScreen lazy-loads both of these. A cold dynamic import resolves on a
// macrotask and only the first test to touch it would see the component;
// warming them here makes every import below resolve as a microtask.
beforeAll(async () => {
  await import("../components/map/TransitMap");
  await import("../components/map/StationDetailsModal");
});

beforeEach(() => {
  vi.mocked(api.getStations).mockResolvedValue(STATIONS);
  vi.mocked(api.getRoutes).mockResolvedValue(ROUTES);
  vi.mocked(api.getPositions).mockImplementation(async (lineId: string) =>
    lineId === "1" ? LINE_ONE : LINE_A
  );
});

describe("MapScreen loading", () => {
  it("mounts the transit map with the loaded station set", async () => {
    renderMapScreen();
    await settle();

    expect(transitMap()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rector St" })).toBeInTheDocument();
  });

  it("pulls train positions for every route", async () => {
    renderMapScreen();
    await settle();

    expect(positionCalls()).toBe(2);
    expect(vi.mocked(api.getPositions).mock.calls.flat()).toEqual(["1", "A"]);
  });

  it("shows the skeleton and no map while the station data is loading", async () => {
    vi.mocked(api.getStations).mockReturnValue(new Promise(() => {}));

    renderMapScreen();
    await settle();

    expect(screen.queryByRole("img", { name: /Interactive transit map/i })).not.toBeInTheDocument();
    expect(document.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("explains the failure and drops the map when the data cannot load", async () => {
    vi.mocked(api.getStations).mockRejectedValue(new Error("Network error"));

    renderMapScreen();
    await settle();

    expect(screen.queryByRole("img", { name: /Interactive transit map/i })).not.toBeInTheDocument();
    // DataState maps the failure to its own user-facing copy, so the raw
    // rejection message never reaches the screen.
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("alert")).toHaveTextContent("An unexpected error occurred");
  });
});

describe("MapScreen train positions", () => {
  it("draws the live positions it fetched", async () => {
    renderMapScreen();
    await settle();

    expect(
      screen.getByRole("button", { name: "Northbound 1 train to South Ferry" })
    ).toBeInTheDocument();
  });

  it("re-fetches positions when the refresh control is tapped", async () => {
    renderMapScreen();
    await settle();
    expect(positionCalls()).toBe(ROUTES.length);

    fireEvent.click(screen.getByRole("button", { name: "Refresh train positions" }));
    await settle();

    // One pass over every route.
    expect(positionCalls()).toBe(2 * ROUTES.length);
  });

  it("auto-refreshes positions every 30 seconds", async () => {
    vi.useFakeTimers();

    renderMapScreen();
    await settle();
    expect(positionCalls()).toBe(ROUTES.length);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(positionCalls()).toBe(2 * ROUTES.length);
  });
});

describe("MapScreen line filter", () => {
  it("draws every line until one is selected", async () => {
    const { container } = renderMapScreen();
    await settle();

    expect(container.querySelector('path[aria-label="1 line"]')).not.toBeNull();
    expect(container.querySelector('path[aria-label="A line"]')).not.toBeNull();
  });

  it("narrows the map to the selected line", async () => {
    const { container } = renderMapScreen();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Show line filter" }));
    fireEvent.click(screen.getByRole("button", { name: "A", pressed: false }));
    await settle();

    expect(container.querySelector('path[aria-label="1 line"]')).toBeNull();
    expect(container.querySelector('path[aria-label="A line"]')).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Northbound 1 train to South Ferry" })
    ).not.toBeInTheDocument();
  });
});

describe("MapScreen station details", () => {
  it("opens the details modal when a station marker is tapped", async () => {
    renderMapScreen();
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "Rector St" }));
    await settle();

    expect(screen.getByRole("dialog", { name: "Rector St" })).toBeInTheDocument();
  });
});
