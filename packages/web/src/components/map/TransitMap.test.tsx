/**
 * Tests for TransitMap — the SVG subway map with pan/zoom and live train markers.
 *
 * Covers the "complex mapping" surface the Phase 1 verdict called untested:
 * - the SVG mounts and draws the station set it is handed
 * - pan and zoom respond to pointer drag, wheel, keyboard, and the zoom controls
 * - live vehicle positions render and report taps back to the host screen
 */

import type { Station } from "@mta-my-way/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { makeLineDiagram, makeTrainPosition } from "../../test/factories";
import { TransitMap } from "./TransitMap";

/** A station pinned inside NYC_BOUNDS so latLonToSvg lands on the visible canvas. */
function makeStation(overrides: Partial<Station> & Pick<Station, "id" | "name">): Station {
  return {
    lat: 40.7,
    lon: -74.0,
    lines: ["1"],
    northStopId: `${overrides.id}N`,
    southStopId: `${overrides.id}S`,
    transfers: [],
    ada: false,
    borough: "manhattan",
    ...overrides,
  };
}

const SOUTH_FERRY = makeStation({ id: "101", name: "South Ferry", ada: true });
const RECTOR_ST = makeStation({ id: "102", name: "Rector St" });
const TIMES_SQ = makeStation({ id: "725", name: "Times Sq-42 St", lines: ["1", "2", "3"] });

const STATIONS = [SOUTH_FERRY, RECTOR_ST, TIMES_SQ];

/** Two stops' worth of diagram data, enough for TransitMap to draw the 1 line. */
const LINE_ONE = makeLineDiagram({
  routeId: "1",
  routeColor: "#EE352E",
  stops: [
    { stopId: "101", stopName: "South Ferry", isTerminal: true, isTransferStation: false },
    { stopId: "102", stopName: "Rector St", isTerminal: false, isTransferStation: false },
    { stopId: "725", stopName: "Times Sq-42 St", isTerminal: true, isTransferStation: true },
  ],
  trains: [],
});

const noop = () => {};

function renderMap({
  stations = STATIONS,
  lineData = new Map([["1", LINE_ONE]]),
  onStationTap = noop,
  onTrainTap = noop,
} = {}) {
  return render(
    <TransitMap
      stations={stations}
      lineData={lineData}
      onStationTap={onStationTap}
      onTrainTap={onTrainTap}
    />
  );
}

/** The svg element the pan/zoom/keyboard handlers are bound to. */
const mapSvg = () => screen.getByRole("img", { name: /Interactive transit map/i });

/** Read the viewport transform back out of the DOM rather than reaching into component state. */
function viewportTransform(container: HTMLElement) {
  const raw = container.querySelector("svg > g")?.getAttribute("transform") ?? "";
  const match = raw.match(/translate\((-?[\d.]+), (-?[\d.]+)\) scale\(([\d.]+)\)/) ?? [];
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

beforeAll(() => {
  // jsdom has no active-pointer bookkeeping, so both capture calls would throw
  // NotFoundError for the pointerId a synthetic event carries.
  window.SVGElement.prototype.setPointerCapture = () => {};
  window.SVGElement.prototype.releasePointerCapture = () => {};
});

describe("TransitMap mounting", () => {
  it("mounts the svg viewport with its accessible description", () => {
    renderMap();

    expect(mapSvg()).toHaveAttribute("viewBox", "0 0 800 600");
  });

  it("draws a tappable marker for every station in the set", () => {
    renderMap();

    for (const station of STATIONS) {
      const suffix = station.lines.length > 1 ? " (transfer station)" : "";
      expect(screen.getByRole("button", { name: `${station.name}${suffix}` })).toBeInTheDocument();
    }
  });

  it("labels stations served by more than one line as transfer stations", () => {
    renderMap();

    expect(
      screen.getByRole("button", { name: "Times Sq-42 St (transfer station)" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rector St (transfer station)" })
    ).not.toBeInTheDocument();
  });

  // A <path> carries no implicit ARIA role, so it is not reachable through
  // getByRole — locate it by the aria-label the component sets on it.
  const linePath = (container: HTMLElement) => container.querySelector('path[aria-label="1 line"]');

  it("draws the polyline for a route whose stops all resolve", () => {
    const { container } = renderMap();

    const line = linePath(container);
    expect(line).toHaveAttribute("stroke", "#EE352E");
    expect(line?.getAttribute("d")).toMatch(/^M [\d.]+,[\d.]+ L [\d.]+,[\d.]+ L [\d.]+,[\d.]+$/);
  });

  it("omits the polyline when fewer than two stops resolve", () => {
    renderMap({
      lineData: new Map([
        [
          "1",
          makeLineDiagram({
            routeId: "1",
            stops: [
              {
                stopId: "101",
                stopName: "South Ferry",
                isTerminal: true,
                isTransferStation: false,
              },
            ],
          }),
        ],
      ]),
    });

    expect(screen.queryByRole("img", { name: "1 line" })).not.toBeInTheDocument();
    expect(linePath(document.body)).toBeNull();
  });
});

describe("TransitMap pan and zoom", () => {
  it("starts at the default viewport with the gesture hint showing", () => {
    const { container } = renderMap();

    expect(viewportTransform(container)).toEqual({ x: 0, y: 0, scale: 1 });
    expect(screen.getByRole("status")).toHaveTextContent(/Drag to pan/);
  });

  it("steps the scale up from the zoom-in button and hides the hint", () => {
    const { container } = renderMap();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(viewportTransform(container).scale).toBeCloseTo(1.2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("steps the scale down from the zoom-out button", () => {
    const { container } = renderMap();

    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));

    expect(viewportTransform(container).scale).toBeCloseTo(0.8);
  });

  it("stops zooming out at the minimum scale", () => {
    const { container } = renderMap();

    // Four wheel-downs would take 1 -> 0.2 without a floor.
    for (let i = 0; i < 4; i += 1) {
      fireEvent.wheel(mapSvg(), { deltaY: 100 });
    }

    expect(viewportTransform(container).scale).toBe(0.5);
  });

  it("zooms in on an upward wheel scroll and out on a downward one", () => {
    const { container } = renderMap();

    fireEvent.wheel(mapSvg(), { deltaY: -100 });
    expect(viewportTransform(container).scale).toBeCloseTo(1.2);

    fireEvent.wheel(mapSvg(), { deltaY: 100 });
    expect(viewportTransform(container).scale).toBeCloseTo(1);
  });

  it("pans with a pointer drag", () => {
    const { container } = renderMap();
    const svg = mapSvg();

    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 160, clientY: 130 });
    fireEvent.pointerUp(svg, { pointerId: 1 });

    expect(viewportTransform(container).x).toBe(60);
    expect(viewportTransform(container).y).toBe(30);
  });

  it("ignores drags that do not start with the primary button", () => {
    const { container } = renderMap();
    const svg = mapSvg();

    fireEvent.pointerDown(svg, { button: 2, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(svg, { pointerId: 1, clientX: 160, clientY: 130 });

    expect(viewportTransform(container).x).toBe(0);
  });

  it("pans with the arrow keys", () => {
    const { container } = renderMap();
    const svg = mapSvg();

    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    fireEvent.keyDown(svg, { key: "ArrowUp" });

    expect(viewportTransform(container).x).toBe(50);
    expect(viewportTransform(container).y).toBe(50);
  });

  it("zooms with the +/- keys and resets with 0", () => {
    const { container } = renderMap();
    const svg = mapSvg();

    fireEvent.keyDown(svg, { key: "+" });
    expect(viewportTransform(container).scale).toBeCloseTo(1.2);

    fireEvent.keyDown(svg, { key: "-" });
    expect(viewportTransform(container).scale).toBeCloseTo(1);

    fireEvent.keyDown(svg, { key: "+" });
    fireEvent.keyDown(svg, { key: "0" });
    expect(viewportTransform(container)).toEqual({ x: 0, y: 0, scale: 1 });
    expect(screen.getByRole("status")).toHaveTextContent(/Drag to pan/);
  });

  it("ignores navigation keys while a control has focus", () => {
    const { container } = renderMap();

    fireEvent.keyDown(screen.getByRole("button", { name: "Zoom in" }), { key: "ArrowLeft" });

    expect(viewportTransform(container).x).toBe(0);
  });
});

describe("TransitMap live positions", () => {
  const LINE_ONE_WITH_TRAIN = makeLineDiagram({
    ...LINE_ONE,
    trains: [
      makeTrainPosition({
        tripId: "trip-1",
        routeId: "1",
        direction: "N",
        lastStopId: "101",
        nextStopId: "102",
        progress: 0.5,
        destination: "South Ferry",
        isAssigned: true,
      }),
    ],
  });

  it("renders a marker for a train whose stops are on the map", () => {
    renderMap({ lineData: new Map([["1", LINE_ONE_WITH_TRAIN]]) });

    expect(
      screen.getByRole("button", { name: "Northbound 1 train to South Ferry" })
    ).toBeInTheDocument();
  });

  it("drops a train whose endpoints are missing from the station set", () => {
    renderMap({
      stations: [SOUTH_FERRY],
      lineData: new Map([["1", LINE_ONE_WITH_TRAIN]]),
    });

    expect(
      screen.queryByRole("button", { name: "Northbound 1 train to South Ferry" })
    ).not.toBeInTheDocument();
  });

  it("reports station taps back to the host screen", () => {
    const onStationTap = vi.fn();
    renderMap({ onStationTap });

    fireEvent.click(screen.getByRole("button", { name: "Rector St" }));

    expect(onStationTap).toHaveBeenCalledWith(RECTOR_ST);
  });

  it("reports train taps back to the host screen with the route attached", () => {
    const onTrainTap = vi.fn();
    const train = LINE_ONE_WITH_TRAIN.trains[0]!;
    renderMap({
      lineData: new Map([["1", LINE_ONE_WITH_TRAIN]]),
      onTrainTap,
    });

    fireEvent.click(screen.getByRole("button", { name: "Northbound 1 train to South Ferry" }));

    expect(onTrainTap).toHaveBeenCalledWith({ ...train, routeId: "1" });
  });
});
