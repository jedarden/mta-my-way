/**
 * Tests for EquipmentBanner component
 *
 * Tests the equipment outage banner component including:
 * - Elevator outages
 * - Escalator outages
 * - ADA impact warning
 * - Equipment list display
 * - Estimated return times
 * - Accessibility attributes
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EquipmentBanner } from "./EquipmentBanner";

const mockEquipment = [
  {
    type: "elevator",
    description: "Elevator from street to mezzanine",
    ada: true,
    estimatedReturn: "June 2025",
  },
  {
    type: "escalator",
    description: "Escalator to platform",
    ada: false,
    estimatedReturn: "Tomorrow",
  },
] as const;

const mockEscalatorsOnly = [
  {
    type: "escalator",
    description: "Escalator to street level",
    ada: false,
    estimatedReturn: "Friday",
  },
] as const;

describe("EquipmentBanner", () => {
  describe("elevator outages (ADA impact)", () => {
    it("renders red banner for elevator outages", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      const banner = screen.getByRole("alert");
      expect(banner).toHaveClass("bg-red-50", "border-red-200");
    });

    it("shows ADA Access Disrupted header", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      expect(screen.getByText("ADA Access Disrupted")).toBeInTheDocument();
    });

    it("shows ADA warning message", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      expect(
        screen.getByText("This station is not currently ADA accessible due to elevator outages.")
      ).toBeInTheDocument();
    });

    it("lists elevator outages", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      expect(screen.getByText("Elevator from street to mezzanine")).toBeInTheDocument();
    });
  });

  describe("escalator outages (no ADA impact)", () => {
    it("renders amber banner for escalator-only outages", () => {
      render(<EquipmentBanner equipment={mockEscalatorsOnly} stationName="Penn Station" />);

      const banner = screen.getByRole("alert");
      expect(banner).toHaveClass("bg-amber-50", "border-amber-200");
    });

    it("shows Equipment Outages header", () => {
      render(<EquipmentBanner equipment={mockEscalatorsOnly} stationName="Penn Station" />);

      expect(screen.getByText("Equipment Outages")).toBeInTheDocument();
    });

    it("does not show ADA warning", () => {
      render(<EquipmentBanner equipment={mockEscalatorsOnly} stationName="Penn Station" />);

      expect(
        screen.queryByText("This station is not currently ADA accessible due to elevator outages.")
      ).not.toBeInTheDocument();
    });

    it("lists escalator outages", () => {
      render(<EquipmentBanner equipment={mockEscalatorsOnly} stationName="Penn Station" />);

      expect(screen.getByText("Escalator to street level")).toBeInTheDocument();
    });
  });

  describe("combined outages", () => {
    it("shows both elevators and escalators", () => {
      render(<EquipmentBanner equipment={mockEquipment} stationName="Grand Central" />);

      expect(screen.getByText("Elevator from street to mezzanine")).toBeInTheDocument();
      expect(screen.getByText("Escalator to platform")).toBeInTheDocument();
    });

    it("uses ADA warning when any elevator is broken", () => {
      render(<EquipmentBanner equipment={mockEquipment} stationName="Grand Central" />);

      expect(screen.getByText("ADA Access Disrupted")).toBeInTheDocument();
    });
  });

  describe("estimated return times", () => {
    it("displays estimated return time when available", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      expect(screen.getByText(/Est\. return: June 2025/)).toBeInTheDocument();
    });

    it("does not display return time when not available", () => {
      const noReturnTime = {
        type: "elevator",
        description: "Elevator out",
        ada: true,
      } as const;

      render(<EquipmentBanner equipment={[noReturnTime]} stationName="Times Square" />);

      expect(screen.queryByText(/Est\. return:/)).not.toBeInTheDocument();
    });
  });

  describe("ADA indicators", () => {
    it("shows ADA indicator on ADA equipment", () => {
      render(<EquipmentBanner equipment={mockEquipment} stationName="Times Square" />);

      const adaBadges = screen.getAllByText("ADA");
      expect(adaBadges.length).toBeGreaterThan(0);
    });

    it("only shows ADA on elevator items", () => {
      render(<EquipmentBanner equipment={mockEquipment} stationName="Times Square" />);

      // Elevator should have ADA badge
      const elevatorItem = screen.getByText("Elevator from street to mezzanine")
        .parentElement as HTMLElement;
      expect(elevatorItem.textContent).toContain("ADA");

      // Escalator should not have ADA badge
      const escalatorItem = screen.getByText("Escalator to platform").parentElement as HTMLElement;
      expect(escalatorItem.textContent).not.toContain("ADA");
    });
  });

  describe("icons", () => {
    it("renders warning icon", () => {
      const { container } = render(
        <EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />
      );

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it("renders elevator icons for elevator items", () => {
      const { container } = render(
        <EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />
      );

      const icons = container.querySelectorAll("svg");
      // Should have at least warning icon + elevator icon
      expect(icons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("accessibility", () => {
    it("has proper role and aria-label", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      const banner = screen.getByRole("alert", {
        name: /Equipment outages at Times Square/i,
      });
      expect(banner).toBeInTheDocument();
    });

    it("encodes station name in aria-label", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="St & 1st Ave" />);

      const banner = screen.getByRole("alert");
      expect(banner).toHaveAttribute("aria-label");
    });
  });

  describe("empty state", () => {
    it("renders nothing when no equipment outages", () => {
      const { container } = render(<EquipmentBanner equipment={[]} stationName="Times Square" />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe("dark mode", () => {
    it("has proper dark mode colors for ADA impact", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      const banner = screen.getByRole("alert");
      expect(banner).toHaveClass("dark:bg-red-950/30", "dark:border-red-800/50");
    });

    it("has proper dark mode colors for non-ADA", () => {
      render(<EquipmentBanner equipment={mockEscalatorsOnly} stationName="Penn Station" />);

      const banner = screen.getByRole("alert");
      expect(banner).toHaveClass("dark:bg-amber-950/30", "dark:border-amber-800/50");
    });

    it("has proper text colors in dark mode", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      const header = screen.getByText("ADA Access Disrupted");
      expect(header).toHaveClass("dark:text-red-300");

      const warning = screen.getByText(
        "This station is not currently ADA accessible due to elevator outages."
      );
      expect(warning).toHaveClass("dark:text-red-400");
    });
  });

  describe("styling", () => {
    it("has rounded corners", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      const banner = screen.getByRole("alert");
      expect(banner).toHaveClass("rounded-lg");
    });

    it("has proper padding", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      const banner = screen.getByRole("alert");
      expect(banner).toHaveClass("p-4");
    });

    it("has border", () => {
      render(<EquipmentBanner equipment={[mockEquipment[0]]} stationName="Times Square" />);

      const banner = screen.getByRole("alert");
      expect(banner).toHaveClass("border");
    });
  });
});
