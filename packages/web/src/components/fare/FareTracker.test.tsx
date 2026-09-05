/**
 * Tests for the OMNY FareTracker component.
 *
 * Focus: the card discloses that its figures are an estimate, and every fare
 * amount it shows comes from configuration rather than a hardcoded literal.
 */

import { MTA_30DAY_UNLIMITED_PASS_PRICE, MTA_BASE_FARE } from "@mta-my-way/shared";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFareStore } from "../../stores";

import { FareTracker } from "./FareTracker";

/** Shape a store tick into a week with some rides already logged. */
function seedRides(weekly: number, monthly = weekly) {
  useFareStore.setState((state) => ({
    tracking: {
      ...state.tracking,
      weeklyRides: weekly,
      monthlyRides: monthly,
      weekStartDate: "2026-08-31",
      monthStartDate: "2026-08-01",
    },
  }));
}

describe("FareTracker", () => {
  beforeEach(() => {
    useFareStore.setState((state) => ({
      tracking: { ...state.tracking, weeklyRides: 0, monthlyRides: 0, rideLog: [] },
    }));
  });

  it("renders nothing before any ride is logged", () => {
    const { container } = render(<FareTracker />);
    expect(container).toBeEmptyDOMElement();
  });

  it("labels the card as an estimate", () => {
    seedRides(4);
    render(<FareTracker />);

    expect(screen.getByText("Estimate")).toBeInTheDocument();
    expect(
      screen.getByText(/Estimate — based on the \$3\.00 fare and the published \$35 7-day cap/i)
    ).toBeInTheDocument();
  });

  it("shows the configured fare rather than a hardcoded one", () => {
    seedRides(4);
    render(<FareTracker />);

    const perRide = screen.getByText(
      (_, el) => el?.textContent === `$${MTA_BASE_FARE.toFixed(2)}/ride`
    );
    expect(perRide).toBeInTheDocument();
  });

  it("reports progress toward the configured cap", () => {
    seedRides(4);
    render(<FareTracker />);

    // The progress text is split across interpolated nodes, so match a fragment
    expect(screen.getByText(/more until free/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-label",
      "4 of 12 rides toward fare cap"
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "12");
  });

  it("keeps the estimate label when the cap is reached", () => {
    seedRides(12);
    render(<FareTracker />);

    expect(screen.getByText("Estimate")).toBeInTheDocument();
    expect(screen.getByText(/Free rides!/)).toBeInTheDocument();
  });

  it("compares against the configured unlimited pass price", () => {
    seedRides(30, 30);
    useFareStore.setState((state) => ({
      tracking: { ...state.tracking, unlimitedPassPrice: MTA_30DAY_UNLIMITED_PASS_PRICE },
    }));
    render(<FareTracker />);

    expect(screen.getByText(`Unlimited: $${MTA_30DAY_UNLIMITED_PASS_PRICE}`)).toBeInTheDocument();
  });
});
