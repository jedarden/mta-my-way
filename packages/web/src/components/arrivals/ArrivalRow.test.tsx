/**
 * Tests for ArrivalRow component
 *
 * Tests the arrival row display including:
 * - Arrival data rendering
 * - Compact mode
 * - Staleness indicators
 * - Express and estimated badges
 * - Track trip button
 * - Accessibility
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArrivalRow } from "./ArrivalRow";

// Mock dependencies
vi.mock("../../lib/outputEncoding.js", () => ({
  encodeForAria: (text: string) => text,
  sanitizeUserInput: (text: string) => text,
}));

vi.mock("../../hooks/useFeedFreshness.js", () => ({
  computeFeedFreshness: () => ({
    isOutdated: false,
    isStale: false,
    level: "fresh",
  }),
}));

vi.mock("@mta-my-way/shared", () => ({
  formatMinutesAway: (mins: number) => (mins === 0 ? "now" : `${mins} min`),
  isADivision: () => true,
  isBDivision: () => false,
}));

// Mock LineBullet and ConfidenceBar
vi.mock("./LineBullet.jsx", () => ({
  LineBullet: ({ line, size }: { line: string; size: string }) => (
    <div data-testid={`line-bullet-${line}`} data-size={size}>
      {line}
    </div>
  ),
}));

vi.mock("./ConfidenceBar.jsx", () => ({
  ConfidenceBar: ({
    confidence,
    lineId,
    className,
  }: { confidence: string; lineId?: string; className?: string }) => (
    <div
      data-testid="confidence-bar"
      data-confidence={confidence}
      data-line={lineId}
      className={className}
    />
  ),
}));

const mockArrival = {
  line: "1",
  destination: "Van Cortlandt Park-242 St",
  minutesAway: 5,
  confidence: "high",
  isAssigned: true,
  isExpress: false,
  feedAge: 10,
  tripId: "trip-123",
  direction: "N",
  arrivalTime: 1234567890,
  isRerouted: false,
};

describe("ArrivalRow", () => {
  describe("basic rendering", () => {
    it("renders arrival information", () => {
      render(<ArrivalRow arrival={mockArrival} />);

      expect(screen.getByText("Van Cortlandt Park-242 St")).toBeInTheDocument();
      expect(screen.getByText("5 min")).toBeInTheDocument();
    });

    it("renders line bullet when showLine is true", () => {
      render(<ArrivalRow arrival={mockArrival} showLine={true} />);

      expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();
    });

    it("does not render line bullet when showLine is false", () => {
      render(<ArrivalRow arrival={mockArrival} showLine={false} />);

      expect(screen.queryByTestId("line-bullet-1")).not.toBeInTheDocument();
    });

    it("renders confidence bar", () => {
      render(<ArrivalRow arrival={mockArrival} />);

      const confidenceBar = screen.getByTestId("confidence-bar");
      expect(confidenceBar).toHaveAttribute("data-confidence", "high");
      expect(confidenceBar).toHaveAttribute("data-line", "1");
    });
  });

  describe("compact mode", () => {
    it("renders compact layout", () => {
      const { container } = render(<ArrivalRow arrival={mockArrival} compact={true} />);

      // In compact mode, destination is not shown
      expect(screen.queryByText("Van Cortlandt Park-242 St")).not.toBeInTheDocument();
      // But time is still shown
      expect(screen.getByText("5 min")).toBeInTheDocument();
    });

    it("shows express badge in compact mode", () => {
      const expressArrival = { ...mockArrival, isExpress: true };
      render(<ArrivalRow arrival={expressArrival} compact={true} />);

      expect(screen.getByText("EXP")).toBeInTheDocument();
    });

    it("shows estimated badge in compact mode", () => {
      const estimatedArrival = { ...mockArrival };
      render(<ArrivalRow arrival={estimatedArrival} compact={true} isEstimated={true} />);

      expect(screen.getByText("EST")).toBeInTheDocument();
    });
  });

  describe("badges", () => {
    it("shows express badge when isExpress is true", () => {
      const expressArrival = { ...mockArrival, isExpress: true };
      render(<ArrivalRow arrival={expressArrival} />);

      const badge = screen.getByText("EXP");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("aria-label", "Express service");
    });

    it("shows estimated badge when isEstimated is true", () => {
      render(<ArrivalRow arrival={mockArrival} isEstimated={true} />);

      const badge = screen.getByText("EST");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("aria-label", "Estimated time based on cached data");
    });

    it("shows 'Scheduled' text when not assigned", () => {
      const unassignedArrival = { ...mockArrival, isAssigned: false };
      render(<ArrivalRow arrival={unassignedArrival} />);

      expect(screen.getByText("Scheduled")).toBeInTheDocument();
    });

    it("does not show 'Scheduled' text when assigned", () => {
      render(<ArrivalRow arrival={mockArrival} />);

      expect(screen.queryByText("Scheduled")).not.toBeInTheDocument();
    });
  });

  describe("staleness", () => {
    it("applies opacity for fading staleness", () => {
      const { container } = render(<ArrivalRow arrival={mockArrival} staleness="fading" />);

      const row = container.querySelector('[class*="py-3"]');
      expect(row).toHaveClass("opacity-70");
    });

    it("applies grayscale for stale staleness", () => {
      const { container } = render(<ArrivalRow arrival={mockArrival} staleness="stale" />);

      const row = container.querySelector('[class*="py-3"]');
      expect(row).toHaveClass("opacity-50");
      expect(row).toHaveClass("grayscale-[50%]");
    });

    it("shows no staleness indicator for fresh data", () => {
      const { container } = render(<ArrivalRow arrival={mockArrival} staleness="fresh" />);

      const row = container.querySelector('[class*="py-3"]');
      expect(row).not.toHaveClass("opacity-50");
      expect(row).not.toHaveClass("opacity-70");
    });
  });

  describe("click handling", () => {
    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<ArrivalRow arrival={mockArrival} onClick={handleClick} />);

      const row = screen.getByRole("button");
      await user.click(row);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("calls onClick on Enter key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<ArrivalRow arrival={mockArrival} onClick={handleClick} />);

      const row = screen.getByRole("button");
      row.focus();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("calls onClick on Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<ArrivalRow arrival={mockArrival} onClick={handleClick} />);

      const row = screen.getByRole("button");
      row.focus();
      await user.keyboard("{ }"); // Space

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not have button role when onClick is not provided", () => {
      render(<ArrivalRow arrival={mockArrival} />);

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("track trip button", () => {
    it("shows track button when showTrackButton is true", () => {
      const handleTrack = vi.fn();
      render(<ArrivalRow arrival={mockArrival} showTrackButton={true} onTrackTrip={handleTrack} />);

      const button = screen.getByRole("button", { name: /track/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent("I'm on this train");
    });

    it("calls onTrackTrip when button is clicked", async () => {
      const user = userEvent.setup();
      const handleTrack = vi.fn();
      const handleClick = vi.fn();

      render(
        <ArrivalRow
          arrival={mockArrival}
          showTrackButton={true}
          onTrackTrip={handleTrack}
          onClick={handleClick}
        />
      );

      const trackButton = screen.getByRole("button", { name: /track/i });
      await user.click(trackButton);

      expect(handleTrack).toHaveBeenCalledTimes(1);
      expect(handleClick).not.toHaveBeenCalled(); // Row click should not fire
    });

    it("does not show track button when compact mode is active", () => {
      const handleTrack = vi.fn();
      render(
        <ArrivalRow
          arrival={mockArrival}
          showTrackButton={true}
          onTrackTrip={handleTrack}
          compact={true}
        />
      );

      expect(screen.queryByRole("button", { name: /track/i })).not.toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has proper aria-label for clickable rows", () => {
      render(<ArrivalRow arrival={mockArrival} onClick={vi.fn()} />);

      const row = screen.getByRole("button");
      expect(row).toHaveAttribute(
        "aria-label",
        "1 train to Van Cortlandt Park-242 St, arriving in 5 min"
      );
    });

    it("includes express in aria-label for express trains", () => {
      const expressArrival = { ...mockArrival, isExpress: true };
      render(<ArrivalRow arrival={expressArrival} onClick={vi.fn()} />);

      const row = screen.getByRole("button");
      expect(row).toHaveAttribute("aria-label", expect.stringContaining("express"));
    });

    it("includes estimated in aria-label for estimated times", () => {
      render(<ArrivalRow arrival={mockArrival} onClick={vi.fn()} isEstimated={true} />);

      const row = screen.getByRole("button");
      expect(row).toHaveAttribute("aria-label", expect.stringContaining("estimated"));
    });

    it("has proper aria-label for track button", () => {
      render(<ArrivalRow arrival={mockArrival} showTrackButton={true} onTrackTrip={vi.fn()} />);

      const button = screen.getByRole("button", { name: /track/i });
      expect(button).toHaveAttribute("aria-label", "Track Van Cortlandt Park-242 St train");
    });
  });

  describe("time formatting", () => {
    it("displays 'now' for 0 minutes away", () => {
      const nowArrival = { ...mockArrival, minutesAway: 0 };
      render(<ArrivalRow arrival={nowArrival} />);

      expect(screen.getByText("now")).toBeInTheDocument();
    });

    it("displays 'X min' for positive minutes away", () => {
      render(<ArrivalRow arrival={mockArrival} />);

      expect(screen.getByText("5 min")).toBeInTheDocument();
    });
  });
});
