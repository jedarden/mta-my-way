/**
 * Tests for FreshnessFooter component
 *
 * Tests the compact per-feed data-age bar at the bottom of the arrivals
 * section, including:
 * - Feed extraction, deduplication (max age wins), and oldest-first ordering
 * - Compact display (three chips maximum, plus an overflow count)
 * - Freshness color coding for dot and text
 * - Accessibility (accessible name, aria-expanded, button semantics)
 * - Expanding to the FreshnessDetail panel
 */

import type { ArrivalTime } from "@mta-my-way/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FreshnessFooter } from "./FreshnessFooter";

function makeArrival(overrides: Partial<ArrivalTime> = {}): ArrivalTime {
  return {
    tripId: "trip-1",
    line: "6",
    destination: "Pelham Bay Park",
    minutesAway: 2,
    confidence: "high",
    isAssigned: true,
    isExpress: false,
    isRerouted: false,
    direction: "N",
    arrivalTime: 1234567890,
    feedName: "gtfs",
    feedAge: 8,
    ...overrides,
  };
}

/**
 * Locate a compact feed chip by its rendered text, plus the freshness dot that
 * precedes it inside the same chip wrapper.
 */
function getChip(text: RegExp): { chip: HTMLElement; dot: HTMLElement } {
  const chip = screen.getByText(text);
  const dot = chip.previousElementSibling as HTMLElement | null;
  if (!dot) throw new Error(`Expected a freshness dot before the chip matching ${text}`);
  return { chip, dot };
}

describe("FreshnessFooter", () => {
  describe("feed extraction", () => {
    it("renders nothing when there are no arrivals", () => {
      const { container } = render(<FreshnessFooter arrivals={[]} stationFeedAge={8} />);

      expect(container).toBeEmptyDOMElement();
    });

    it("labels the bar as the data age control", () => {
      render(<FreshnessFooter arrivals={[makeArrival()]} stationFeedAge={8} />);

      expect(screen.getByText("Data age:")).toBeInTheDocument();
    });

    it("shows the feed display name with its formatted age", () => {
      render(
        <FreshnessFooter
          arrivals={[makeArrival({ feedName: "gtfs-bdfm", feedAge: 62 })]}
          stationFeedAge={62}
        />
      );

      expect(screen.getByText(/B\/D\/F\/M\s+1m 2s/)).toBeInTheDocument();
    });

    it("falls back to the raw feed id for an unrecognized feed", () => {
      render(
        <FreshnessFooter
          arrivals={[makeArrival({ feedName: "future-feed", feedAge: 5 })]}
          stationFeedAge={5}
        />
      );

      expect(screen.getByText(/future-feed\s+5s/)).toBeInTheDocument();
    });

    it("deduplicates arrivals from one feed, keeping the oldest age", () => {
      render(
        <FreshnessFooter
          arrivals={[
            makeArrival({ tripId: "a", feedName: "gtfs", feedAge: 8 }),
            makeArrival({ tripId: "b", feedName: "gtfs", feedAge: 40, line: "1" }),
            makeArrival({ tripId: "c", feedName: "gtfs-bdfm", feedAge: 62, line: "F" }),
          ]}
          stationFeedAge={62}
        />
      );

      expect(screen.getByText(/A\s+40s/)).toBeInTheDocument();
      expect(screen.queryByText(/A\s+8s/)).not.toBeInTheDocument();
      expect(screen.getByText(/B\/D\/F\/M\s+1m 2s/)).toBeInTheDocument();
    });

    it("orders chips oldest feed first", () => {
      render(
        <FreshnessFooter
          arrivals={[
            makeArrival({ tripId: "a", feedName: "gtfs", feedAge: 8 }),
            makeArrival({ tripId: "b", feedName: "gtfs-l", feedAge: 120, line: "L" }),
            makeArrival({ tripId: "c", feedName: "gtfs-g", feedAge: 5, line: "G" }),
          ]}
          stationFeedAge={120}
        />
      );

      const text = screen.getByRole("button").textContent ?? "";
      expect(text.indexOf("L 2m")).toBeGreaterThan(-1);
      expect(text.indexOf("L 2m")).toBeLessThan(text.indexOf("A 8s"));
      expect(text.indexOf("A 8s")).toBeLessThan(text.indexOf("G 5s"));
    });

    it("caps the compact bar at three chips with an overflow count", () => {
      render(
        <FreshnessFooter
          arrivals={[
            makeArrival({ tripId: "a", feedName: "gtfs-l", feedAge: 120, line: "L" }),
            makeArrival({ tripId: "b", feedName: "gtfs-bdfm", feedAge: 62, line: "F" }),
            makeArrival({ tripId: "c", feedName: "gtfs", feedAge: 8 }),
            makeArrival({ tripId: "d", feedName: "gtfs-g", feedAge: 5, line: "G" }),
          ]}
          stationFeedAge={120}
        />
      );

      expect(screen.getByText(/L\s+2m/)).toBeInTheDocument();
      expect(screen.getByText(/B\/D\/F\/M\s+1m 2s/)).toBeInTheDocument();
      expect(screen.getByText(/A\s+8s/)).toBeInTheDocument();
      expect(screen.queryByText(/G\s+5s/)).not.toBeInTheDocument();
      expect(screen.getByText("+1")).toBeInTheDocument();
    });
  });

  describe("freshness color coding", () => {
    // Only the dark-mode token is asserted here. The light-mode step is a
    // contrast-tuning target and is pinned by the shared utils' own tests; the
    // component just forwards whatever getFreshnessTextColor returns.
    it("colors a fresh feed's dot and text green", () => {
      render(<FreshnessFooter arrivals={[makeArrival({ feedAge: 8 })]} stationFeedAge={8} />);

      const { chip, dot } = getChip(/A\s+8s/);
      expect(dot).toHaveClass("bg-green-500");
      expect(chip).toHaveClass("tabular-nums", "dark:text-green-400");
    });

    it("colors a neutral feed's dot gray and its text tertiary", () => {
      render(
        <FreshnessFooter
          arrivals={[makeArrival({ feedName: "gtfs-l", feedAge: 30, line: "L" })]}
          stationFeedAge={30}
        />
      );

      const { chip, dot } = getChip(/L\s+30s/);
      expect(dot).toHaveClass("bg-gray-400", "dark:bg-gray-500");
      expect(chip).toHaveClass("text-text-tertiary", "dark:text-dark-text-tertiary");
    });

    it("colors a delayed feed's dot and text amber", () => {
      render(
        <FreshnessFooter
          arrivals={[makeArrival({ feedName: "gtfs-g", feedAge: 62, line: "G" })]}
          stationFeedAge={62}
        />
      );

      const { chip, dot } = getChip(/G\s+1m 2s/);
      expect(dot).toHaveClass("bg-amber-500");
      expect(chip).toHaveClass("dark:text-amber-400");
    });

    it("colors a stale feed's dot and text red", () => {
      render(
        <FreshnessFooter
          arrivals={[makeArrival({ feedName: "gtfs-nqrw", feedAge: 120, line: "Q" })]}
          stationFeedAge={120}
        />
      );

      const { chip, dot } = getChip(/N\/Q\/R\/W\s+2m/);
      expect(dot).toHaveClass("bg-red-500");
      expect(chip).toHaveClass("dark:text-red-400");
    });
  });

  describe("accessibility", () => {
    it("describes the station feed age in its accessible name", () => {
      render(<FreshnessFooter arrivals={[makeArrival()]} stationFeedAge={8} />);

      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-label",
        "Data freshness: 8s old. Tap for details."
      );
    });

    it("formats a minute-plus station age in its accessible name", () => {
      render(<FreshnessFooter arrivals={[makeArrival()]} stationFeedAge={120} />);

      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-label",
        "Data freshness: 2m old. Tap for details."
      );
    });

    it("is a plain button that starts collapsed", () => {
      render(<FreshnessFooter arrivals={[makeArrival()]} stationFeedAge={8} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("type", "button");
      expect(button).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("expansion", () => {
    it("hides the detail panel while collapsed", () => {
      render(<FreshnessFooter arrivals={[makeArrival()]} stationFeedAge={8} />);

      expect(screen.queryByText("Feed Status")).not.toBeInTheDocument();
    });

    it("reveals the detail panel on tap", async () => {
      const user = userEvent.setup();
      render(<FreshnessFooter arrivals={[makeArrival()]} stationFeedAge={8} />);
      const button = screen.getByRole("button");

      await user.click(button);

      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Feed Status")).toBeInTheDocument();
      // Inactive feeds appear too, not just the ones this station draws from.
      expect(screen.getByText("G Line")).toBeInTheDocument();
    });

    it("flips the chevron while expanded", async () => {
      const user = userEvent.setup();
      render(<FreshnessFooter arrivals={[makeArrival()]} stationFeedAge={8} />);
      const button = screen.getByRole("button");
      const chevron = button.querySelector("svg");

      expect(chevron?.getAttribute("class")).not.toContain("rotate-180");
      await user.click(button);
      expect(chevron?.getAttribute("class")).toContain("rotate-180");
    });

    it("collapses again on a second tap", async () => {
      const user = userEvent.setup();
      render(<FreshnessFooter arrivals={[makeArrival()]} stationFeedAge={8} />);
      const button = screen.getByRole("button");

      await user.click(button);
      await user.click(button);

      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Feed Status")).not.toBeInTheDocument();
    });
  });
});
