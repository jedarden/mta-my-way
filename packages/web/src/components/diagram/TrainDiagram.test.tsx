import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeLineDiagram, makeTrainPosition } from "../../test/factories";
import { TrainDiagram } from "./TrainDiagram";

const reducedMotionListeners = new Set<(event: MediaQueryListEvent) => void>();
let prefersReducedMotion = false;

beforeEach(() => {
  reducedMotionListeners.clear();
  prefersReducedMotion = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: prefersReducedMotion,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        reducedMotionListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        reducedMotionListeners.delete(listener);
      },
    }))
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("TrainDiagram", () => {
  it("announces when no trains are tracking and labels terminal and transfer stops", () => {
    const data = makeLineDiagram({
      stops: [
        {
          stopId: "101",
          stopName: "Very Long Terminal Station",
          isTerminal: true,
          isTransferStation: false,
        },
        { stopId: "102", stopName: "Transfer", isTerminal: false, isTransferStation: true },
      ],
    });

    render(<TrainDiagram data={data} />);

    expect(
      screen.getByRole("figure", { name: "1 line: no trains currently tracking" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Interactive train positions diagram" })
    ).toBeInTheDocument();
    expect(screen.getByText("Very Long T…")).toBeInTheDocument();
    expect(screen.getByText("Transfer")).toBeInTheDocument();
  });

  it("places trains between stops and supports mouse and keyboard selection", () => {
    const first = makeTrainPosition({
      tripId: "north",
      progress: 0.2,
      destination: "South Ferry",
      delay: 45,
    });
    const second = makeTrainPosition({
      tripId: "south",
      direction: "S",
      progress: 0.8,
      destination: "Uptown",
      isAssigned: false,
    });
    const onTrainTap = vi.fn();

    const { container } = render(
      <TrainDiagram
        data={makeLineDiagram({ trains: [first, second] })}
        userNextTrainTripId="north"
        onTrainTap={onTrainTap}
      />
    );

    expect(screen.getByRole("figure", { name: /1 line: 2 trains/ })).toBeInTheDocument();
    // Inspect the interactive train dot nodes directly while checking their
    // labels and keyboard handlers.
    const north = container.querySelector<SVGGElement>(
      'g[role="button"][aria-label*="Northbound"]'
    )!;
    const south = container.querySelector<SVGGElement>(
      'g[role="button"][aria-label*="Southbound"]'
    )!;
    expect(north).toHaveAttribute(
      "aria-label",
      "Northbound train to South Ferry delayed 45 seconds"
    );
    expect(south).toHaveAttribute("aria-label", "Southbound train to Uptown (unassigned)");
    expect(north.querySelector("animate")).not.toBeNull();
    expect(container.querySelectorAll("g[role=button]")).toHaveLength(2);

    fireEvent.click(north);
    fireEvent.keyDown(south, { key: "Enter" });
    fireEvent.keyDown(south, { key: " " });
    fireEvent.keyDown(south, { key: "Escape" });
    expect(onTrainTap).toHaveBeenCalledTimes(3);
    expect(onTrainTap).toHaveBeenNthCalledWith(1, first);
    expect(onTrainTap).toHaveBeenNthCalledWith(2, second);
  });

  it("does not animate the highlighted train when reduced motion is preferred", () => {
    prefersReducedMotion = true;
    const train = makeTrainPosition();

    const { container } = render(
      <TrainDiagram
        data={makeLineDiagram({ trains: [train] })}
        userNextTrainTripId={train.tripId}
      />
    );

    expect(
      screen.getByRole("figure", { name: "1 line: 1 train, single train" })
    ).toBeInTheDocument();
    expect(container.querySelector('g[role="button"] animate')).toBeNull();
  });
});
