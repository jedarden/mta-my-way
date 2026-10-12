/**
 * Tests for TrainDotDetails component
 *
 * Covers:
 * - Direction heading (northbound/southbound)
 * - Destination and assignment status rendering
 * - Delay text formatting branches and severity styling
 * - Close via button, Escape key and backdrop click
 * - Track-this-train action wiring
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeTrainPosition } from "../../test/factories";
import { TrainDotDetails } from "./TrainDotDetails";

describe("TrainDotDetails", () => {
  it("shows a northbound heading for an N-direction train", () => {
    render(
      <TrainDotDetails
        train={makeTrainPosition({ direction: "N" })}
        routeId="1"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Northbound Train")).toBeInTheDocument();
  });

  it("shows a southbound heading for an S-direction train", () => {
    render(
      <TrainDotDetails
        train={makeTrainPosition({ direction: "S" })}
        routeId="1"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Southbound Train")).toBeInTheDocument();
  });

  it("shows the destination and trip id", () => {
    const train = makeTrainPosition({ destination: "South Ferry", tripId: "trip-9" });
    render(<TrainDotDetails train={train} routeId="1" onClose={vi.fn()} />);

    expect(screen.getByText("South Ferry")).toBeInTheDocument();
    expect(screen.getByText("Trip ID: trip-9")).toBeInTheDocument();
  });

  it("shows an assigned status with success styling", () => {
    render(
      <TrainDotDetails
        train={makeTrainPosition({ isAssigned: true })}
        routeId="1"
        onClose={vi.fn()}
      />
    );

    const status = screen.getByText("Assigned");
    expect(status).toHaveClass("text-success", "dark:text-dark-success");
  });

  it("shows an unassigned status with warning styling", () => {
    render(
      <TrainDotDetails
        train={makeTrainPosition({ isAssigned: false })}
        routeId="1"
        onClose={vi.fn()}
      />
    );

    const status = screen.getByText("Unassigned");
    expect(status).toHaveClass("text-warning", "dark:text-dark-warning");
  });

  describe("delay formatting", () => {
    it("omits the delay row when no delay is known", () => {
      const train = makeTrainPosition();
      delete (train as { delay?: number }).delay;
      render(<TrainDotDetails train={train} routeId="1" onClose={vi.fn()} />);

      expect(screen.queryByText("Delay")).not.toBeInTheDocument();
    });

    it("omits the delay row for a zero delay", () => {
      render(
        <TrainDotDetails train={makeTrainPosition({ delay: 0 })} routeId="1" onClose={vi.fn()} />
      );

      expect(screen.queryByText("Delay")).not.toBeInTheDocument();
    });

    it("formats sub-minute delays in seconds with warning styling", () => {
      render(
        <TrainDotDetails train={makeTrainPosition({ delay: 45 })} routeId="1" onClose={vi.fn()} />
      );

      const delay = screen.getByText("45s delay");
      expect(delay).toHaveClass("text-warning", "dark:text-dark-warning");
    });

    it("rounds down to whole minutes when seconds are under 30", () => {
      render(
        <TrainDotDetails train={makeTrainPosition({ delay: 130 })} routeId="1" onClose={vi.fn()} />
      );

      expect(screen.getByText("2m delay")).toBeInTheDocument();
    });

    it("rounds up to the next minute when seconds are 30 or more", () => {
      render(
        <TrainDotDetails train={makeTrainPosition({ delay: 150 })} routeId="1" onClose={vi.fn()} />
      );

      expect(screen.getByText("3m delay")).toBeInTheDocument();
    });

    it("styles long delays (over 300s) as severe", () => {
      render(
        <TrainDotDetails train={makeTrainPosition({ delay: 400 })} routeId="1" onClose={vi.fn()} />
      );

      const delay = screen.getByText("7m delay");
      expect(delay).toHaveClass("text-severe", "dark:text-dark-severe");
    });
  });

  describe("closing", () => {
    it("closes via the close button", () => {
      const onClose = vi.fn();
      render(<TrainDotDetails train={makeTrainPosition()} routeId="1" onClose={onClose} />);

      fireEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes on Escape via the focus trap", () => {
      const onClose = vi.fn();
      render(<TrainDotDetails train={makeTrainPosition()} routeId="1" onClose={onClose} />);

      fireEvent.keyDown(document, { key: "Escape" });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes when the backdrop itself is clicked", () => {
      const onClose = vi.fn();
      const { container } = render(
        <TrainDotDetails train={makeTrainPosition()} routeId="1" onClose={onClose} />
      );

      fireEvent.click(container.querySelector('[role="dialog"]')!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not close when the sheet content is clicked", () => {
      const onClose = vi.fn();
      render(<TrainDotDetails train={makeTrainPosition()} routeId="1" onClose={onClose} />);

      fireEvent.click(screen.getByText("Northbound Train"));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("track trip action", () => {
    it("calls onTrackTrip with the trip id and then closes", () => {
      const onClose = vi.fn();
      const onTrackTrip = vi.fn();
      render(
        <TrainDotDetails
          train={makeTrainPosition({ tripId: "trip-7" })}
          routeId="1"
          onClose={onClose}
          onTrackTrip={onTrackTrip}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: /Track this train/ }));

      expect(onTrackTrip).toHaveBeenCalledWith("trip-7");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("hides the track button when the callback is not provided", () => {
      render(<TrainDotDetails train={makeTrainPosition()} routeId="1" onClose={vi.fn()} />);

      expect(screen.queryByRole("button", { name: /Track this train/ })).not.toBeInTheDocument();
    });
  });
});
