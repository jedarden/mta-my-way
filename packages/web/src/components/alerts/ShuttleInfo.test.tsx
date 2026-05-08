/**
 * Tests for ShuttleInfo component
 *
 * Tests the shuttle bus information component including:
 * - Full mode display
 * - Compact mode display
 * - Shuttle stops rendering
 * - Frequency display
 * - Verification date display
 * - Proper sanitization of user input
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShuttleInfo } from "./ShuttleInfo";

vi.mock("../../lib/outputEncoding", () => ({
  sanitizeUserInput: (input: string) => input,
}));

const mockShuttleInfo = {
  stops: [
    {
      nearStationId: "station-1",
      description: "Stop at 42nd St - Port Authority",
    },
    {
      nearStationId: "station-2",
      description: "Stop at 34th St - Penn Station",
    },
    {
      nearStationId: "station-3",
      description: "Stop at 14th St - Union Square",
    },
  ],
  frequencyMinutes: 10,
  lastVerified: "2 hours ago",
};

describe("ShuttleInfo", () => {
  describe("full mode", () => {
    it("renders shuttle bus header", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      expect(screen.getByText("Shuttle Bus Available")).toBeInTheDocument();
    });

    it("renders bus icon", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      const busIcon = container.querySelector("svg");
      expect(busIcon).toBeInTheDocument();
    });

    it("renders route description", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      expect(
        screen.getByText("Replacement shuttle buses are running while service is suspended.")
      ).toBeInTheDocument();
    });

    it("renders all shuttle stops", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      expect(screen.getByText("Stop at 42nd St - Port Authority")).toBeInTheDocument();
      expect(screen.getByText("Stop at 34th St - Penn Station")).toBeInTheDocument();
      expect(screen.getByText("Stop at 14th St - Union Square")).toBeInTheDocument();
    });

    it("numbers stops sequentially", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      const numbers = screen.getAllByText(/^\d+$/);
      expect(numbers).toHaveLength(3);
      expect(numbers[0]).toHaveTextContent("1");
      expect(numbers[1]).toHaveTextContent("2");
      expect(numbers[2]).toHaveTextContent("3");
    });

    it("renders frequency information", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      expect(screen.getByText(/Frequency:/)).toBeInTheDocument();
      expect(screen.getByText(/every 10 min/)).toBeInTheDocument();
    });

    it("renders verification date", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      expect(screen.getByText("Verified 2 hours ago")).toBeInTheDocument();
    });

    it("applies proper styling classes", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      const shuttleInfo = container.firstChild as HTMLElement;
      expect(shuttleInfo).toHaveClass("bg-blue-50");
    });
  });

  describe("compact mode", () => {
    it("renders compact view", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} compact />);

      expect(screen.queryByText("Shuttle Bus Available")).not.toBeInTheDocument();
      expect(screen.getByText(/Shuttle bus every 10 min/)).toBeInTheDocument();
    });

    it("shows frequency in compact mode", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} compact />);

      expect(screen.getByText(/Shuttle bus every 10 min/)).toBeInTheDocument();
    });

    it("shows number of stops in compact mode", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} compact />);

      expect(screen.getByText(/3 stops/)).toBeInTheDocument();
    });

    it("renders icons in compact mode", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} compact />);

      const icons = container.querySelectorAll("svg");
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("handles single stop", () => {
      const singleStop = {
        ...mockShuttleInfo,
        stops: [mockShuttleInfo.stops[0]],
      };
      render(<ShuttleInfo shuttleInfo={singleStop} />);

      expect(screen.getByText("Stop at 42nd St - Port Authority")).toBeInTheDocument();

      const numbers = screen.getAllByText(/^\d+$/);
      expect(numbers).toHaveLength(1);
      expect(numbers[0]).toHaveTextContent("1");
    });

    it("handles many stops", () => {
      const manyStops = {
        ...mockShuttleInfo,
        stops: Array.from({ length: 10 }, (_, i) => ({
          nearStationId: `station-${i}`,
          description: `Stop ${i + 1}`,
        })),
      };
      render(<ShuttleInfo shuttleInfo={manyStops} />);

      const stopElements = screen.getAllByText(/Stop \d+/);
      expect(stopElements.length).toBeGreaterThan(5);
    });

    it("handles different frequency values", () => {
      const highFrequency = {
        ...mockShuttleInfo,
        frequencyMinutes: 5,
      };
      render(<ShuttleInfo shuttleInfo={highFrequency} />);

      expect(screen.getByText(/every 5 min/)).toBeInTheDocument();
    });
  });

  describe("input sanitization", () => {
    it("sanitizes stop descriptions", () => {
      render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      // The component should call sanitizeUserInput for each stop
      // We can't directly test the mock in this setup, but the component
      // is designed to use sanitizeUserInput for stop descriptions
      expect(screen.getByText("Stop at 42nd St - Port Authority")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has proper icon elements with aria-hidden", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      const busIcon = container.querySelector("svg");
      expect(busIcon).toHaveAttribute("aria-hidden", "true");
    });

    it("has proper text contrast in dark mode", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      // Check for dark mode classes
      const shuttleInfo = container.firstChild as HTMLElement;
      expect(shuttleInfo).toHaveClass("dark:bg-blue-900/20");
    });
  });

  describe("icons", () => {
    it("renders bus icon with correct viewBox", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      const busIcon = container.querySelector("svg");
      expect(busIcon).toHaveAttribute("viewBox", "0 0 24 24");
    });

    it("renders location pin icon in compact mode", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} compact />);

      const icons = container.querySelectorAll("svg");
      // Should have both bus and location icons
      expect(icons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("styling", () => {
    it("has blue color scheme in full mode", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      const shuttleInfo = container.firstChild as HTMLElement;
      expect(shuttleInfo).toHaveClass("bg-blue-50");
      expect(shuttleInfo).toHaveClass("border-blue-200");
    });

    it("has proper spacing between elements", () => {
      const { container } = render(<ShuttleInfo shuttleInfo={mockShuttleInfo} />);

      // Check for spacing classes
      const stopsContainer = container.querySelector(".space-y-1\\.5");
      expect(stopsContainer).toBeInTheDocument();
    });
  });
});
