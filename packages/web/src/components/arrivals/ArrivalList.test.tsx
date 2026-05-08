/**
 * Tests for ArrivalList component
 *
 * Tests the arrivals list grouping including:
 * - Direction grouping (northbound/southbound)
 * - Line filtering
 * - Direction filtering
 * - Compact mode
 * - Empty state
 * - Staleness indicators
 * - Track trip button handling
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ArrivalList } from "./ArrivalList";

// Mock ArrivalRow component
vi.mock("./ArrivalRow.jsx", () => ({
  ArrivalRow: ({
    arrival,
    onClick,
    compact,
    staleness,
    showTrackButton,
    onTrackTrip,
  }: {
    arrival: { tripId: string; line: string; destination: string };
    onClick?: () => void;
    compact?: boolean;
    staleness?: string;
    showTrackButton?: boolean;
    onTrackTrip?: () => void;
  }) => (
    <div
      data-testid={`arrival-${arrival.tripId}`}
      data-line={arrival.line}
      data-destination={arrival.destination}
      onClick={onClick}
      className={compact ? "compact" : ""}
      data-staleness={staleness}
    >
      {arrival.destination}
      {showTrackButton && (
        <button
          data-testid={`track-${arrival.tripId}`}
          onClick={(e) => {
            e.stopPropagation();
            onTrackTrip?.();
          }}
        >
          Track
        </button>
      )}
    </div>
  ),
}));

const mockNorthboundArrivals = [
  {
    tripId: "trip-1",
    line: "1",
    destination: "Van Cortlandt Park-242 St",
    minutesAway: 5,
    confidence: "high",
    isAssigned: true,
    isExpress: false,
    feedAge: 10,
    direction: "N" as const,
    arrivalTime: 1234567890,
    isRerouted: false,
  },
  {
    tripId: "trip-2",
    line: "2",
    destination: "Wakefield-241 St",
    minutesAway: 8,
    confidence: "medium",
    isAssigned: true,
    isExpress: true,
    feedAge: 10,
    direction: "N" as const,
    arrivalTime: 1234567890,
    isRerouted: false,
  },
];

const mockSouthboundArrivals = [
  {
    tripId: "trip-3",
    line: "1",
    destination: "South Ferry",
    minutesAway: 3,
    confidence: "high",
    isAssigned: true,
    isExpress: false,
    feedAge: 10,
    direction: "S" as const,
    arrivalTime: 1234567890,
    isRerouted: false,
  },
];

describe("ArrivalList", () => {
  describe("basic rendering", () => {
    it("renders both directions when direction is 'both'", () => {
      render(
        <ArrivalList northbound={mockNorthboundArrivals} southbound={mockSouthboundArrivals} />
      );

      expect(screen.getByText("Uptown / Bronx-bound")).toBeInTheDocument();
      expect(screen.getByText("Downtown / Brooklyn-bound")).toBeInTheDocument();
    });

    it("renders only northbound when direction is 'N'", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          direction="N"
        />
      );

      expect(screen.getByText("Uptown / Bronx-bound")).toBeInTheDocument();
      expect(screen.queryByText("Downtown / Brooklyn-bound")).not.toBeInTheDocument();
    });

    it("renders only southbound when direction is 'S'", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          direction="S"
        />
      );

      expect(screen.queryByText("Uptown / Bronx-bound")).not.toBeInTheDocument();
      expect(screen.getByText("Downtown / Brooklyn-bound")).toBeInTheDocument();
    });

    it("renders all arrivals", () => {
      render(
        <ArrivalList northbound={mockNorthboundArrivals} southbound={mockSouthboundArrivals} />
      );

      expect(screen.getByTestId("arrival-trip-1")).toBeInTheDocument();
      expect(screen.getByTestId("arrival-trip-2")).toBeInTheDocument();
      expect(screen.getByTestId("arrival-trip-3")).toBeInTheDocument();
    });
  });

  describe("line filtering", () => {
    it("filters arrivals by line", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          lines={["1"]}
        />
      );

      expect(screen.getByTestId("arrival-trip-1")).toBeInTheDocument();
      expect(screen.queryByTestId("arrival-trip-2")).not.toBeInTheDocument();
      expect(screen.getByTestId("arrival-trip-3")).toBeInTheDocument();
    });

    it("shows all arrivals when lines is empty", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          lines={[]}
        />
      );

      expect(screen.getByTestId("arrival-trip-1")).toBeInTheDocument();
      expect(screen.getByTestId("arrival-trip-2")).toBeInTheDocument();
      expect(screen.getByTestId("arrival-trip-3")).toBeInTheDocument();
    });

    it("shows all arrivals when lines is undefined", () => {
      render(
        <ArrivalList northbound={mockNorthboundArrivals} southbound={mockSouthboundArrivals} />
      );

      expect(screen.getByTestId("arrival-trip-1")).toBeInTheDocument();
      expect(screen.getByTestId("arrival-trip-2")).toBeInTheDocument();
      expect(screen.getByTestId("arrival-trip-3")).toBeInTheDocument();
    });
  });

  describe("max per direction", () => {
    it("limits arrivals per direction", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          maxPerDirection={1}
        />
      );

      expect(screen.getByTestId("arrival-trip-1")).toBeInTheDocument();
      expect(screen.queryByTestId("arrival-trip-2")).not.toBeInTheDocument();
      expect(screen.getByTestId("arrival-trip-3")).toBeInTheDocument();
    });
  });

  describe("compact mode", () => {
    it("hides headings in compact mode", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          compact={true}
        />
      );

      expect(screen.queryByText("Uptown / Bronx-bound")).not.toBeInTheDocument();
      expect(screen.queryByText("Downtown / Brooklyn-bound")).not.toBeInTheDocument();
    });

    it("applies compact class to arrivals", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          compact={true}
        />
      );

      expect(screen.getByTestId("arrival-trip-1")).toHaveClass("compact");
    });
  });

  describe("staleness", () => {
    it("passes staleness prop to arrivals", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          staleness="stale"
        />
      );

      expect(screen.getByTestId("arrival-trip-1")).toHaveAttribute("data-staleness", "stale");
    });
  });

  describe("empty state", () => {
    it("shows empty state when no arrivals", () => {
      render(<ArrivalList northbound={[]} southbound={[]} />);

      expect(screen.getByText("No upcoming arrivals")).toBeInTheDocument();
    });

    it("shows empty state when filtered arrivals are empty", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          lines={["Z"]}
        />
      );

      expect(screen.getByText("No upcoming arrivals")).toBeInTheDocument();
    });

    it("shows empty state when direction excludes all arrivals", () => {
      render(<ArrivalList northbound={[]} southbound={mockSouthboundArrivals} direction="N" />);

      expect(screen.getByText("No upcoming arrivals")).toBeInTheDocument();
    });
  });

  describe("click handling", () => {
    it("calls onArrivalClick when arrival is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          onArrivalClick={handleClick}
        />
      );

      await user.click(screen.getByTestId("arrival-trip-1"));

      expect(handleClick).toHaveBeenCalledWith(mockNorthboundArrivals[0]);
    });
  });

  describe("track trip button", () => {
    it("shows track button when showTrackButton is true", () => {
      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          showTrackButton={true}
          onTrackTrip={vi.fn()}
        />
      );

      expect(screen.getByTestId("track-trip-1")).toBeInTheDocument();
    });

    it("calls onTrackTrip when track button is clicked", async () => {
      const user = userEvent.setup();
      const handleTrack = vi.fn();

      render(
        <ArrivalList
          northbound={mockNorthboundArrivals}
          southbound={mockSouthboundArrivals}
          showTrackButton={true}
          onTrackTrip={handleTrack}
        />
      );

      await user.click(screen.getByTestId("track-trip-1"));

      expect(handleTrack).toHaveBeenCalledWith(mockNorthboundArrivals[0]);
    });
  });

  describe("accessibility", () => {
    it("has proper section structure", () => {
      render(
        <ArrivalList northbound={mockNorthboundArrivals} southbound={mockSouthboundArrivals} />
      );

      expect(screen.getByRole("heading", { name: "Uptown / Bronx-bound" })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Downtown / Brooklyn-bound" })
      ).toBeInTheDocument();
    });

    it("associates headings with sections using aria-labelledby", () => {
      const { container } = render(
        <ArrivalList northbound={mockNorthboundArrivals} southbound={mockSouthboundArrivals} />
      );

      const northSection = container.querySelector('section[aria-labelledby="uptown-heading"]');
      const southSection = container.querySelector('section[aria-labelledby="downtown-heading"]');

      expect(northSection).toBeInTheDocument();
      expect(southSection).toBeInTheDocument();
    });
  });
});
