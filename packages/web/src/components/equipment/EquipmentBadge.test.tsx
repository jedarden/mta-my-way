/**
 * Tests for EquipmentBadge component
 *
 * Tests the equipment outage badge component including:
 * - Elevator outages (red badge)
 * - Escalator outages (amber badge)
 * - Combined outages
 * - Proper pluralization
 * - Accessibility attributes
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EquipmentBadge } from "./EquipmentBadge";

describe("EquipmentBadge", () => {
  describe("elevator outages", () => {
    it("renders red badge for single elevator outage", () => {
      render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("bg-red-100", "text-red-700");
      expect(badge).toHaveTextContent("1 elevator out");
    });

    it("renders red badge for multiple elevator outages", () => {
      render(<EquipmentBadge brokenElevators={3} brokenEscalators={0} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("bg-red-100", "text-red-700");
      expect(badge).toHaveTextContent("3 elevators out");
    });

    it("shows elevator icon for elevator outages", () => {
      const { container } = render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("escalator outages", () => {
    it("renders amber badge for single escalator outage", () => {
      render(<EquipmentBadge brokenElevators={0} brokenEscalators={1} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("bg-amber-100", "text-amber-700");
      expect(badge).toHaveTextContent("1 escalator out");
    });

    it("renders amber badge for multiple escalator outages", () => {
      render(<EquipmentBadge brokenElevators={0} brokenEscalators={4} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("bg-amber-100", "text-amber-700");
      expect(badge).toHaveTextContent("4 escalators out");
    });

    it("shows escalator icon for escalator outages", () => {
      const { container } = render(<EquipmentBadge brokenElevators={0} brokenEscalators={1} />);

      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("combined outages", () => {
    it("prioritizes elevator badge when both are broken", () => {
      render(<EquipmentBadge brokenElevators={2} brokenEscalators={3} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("bg-red-100", "text-red-700");
      expect(badge).toHaveTextContent("2 elevators out");
      expect(badge).not.toHaveTextContent("escalator");
    });
  });

  describe("no outages", () => {
    it("renders nothing when no equipment is broken", () => {
      const { container } = render(<EquipmentBadge brokenElevators={0} brokenEscalators={0} />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe("pluralization", () => {
    it("uses singular form for single elevator", () => {
      render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      expect(screen.getByText("1 elevator out")).toBeInTheDocument();
    });

    it("uses plural form for multiple elevators", () => {
      render(<EquipmentBadge brokenElevators={2} brokenEscalators={0} />);

      expect(screen.getByText("2 elevators out")).toBeInTheDocument();
    });

    it("uses singular form for single escalator", () => {
      render(<EquipmentBadge brokenElevators={0} brokenEscalators={1} />);

      expect(screen.getByText("1 escalator out")).toBeInTheDocument();
    });

    it("uses plural form for multiple escalators", () => {
      render(<EquipmentBadge brokenElevators={0} brokenEscalators={2} />);

      expect(screen.getByText("2 escalators out")).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("has proper aria-label for elevator outage", () => {
      render(<EquipmentBadge brokenElevators={2} brokenEscalators={0} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("aria-label", "2 elevators out of service");
    });

    it("has proper aria-label for escalator outage", () => {
      render(<EquipmentBadge brokenElevators={0} brokenEscalators={1} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("aria-label", "1 escalator out of service");
    });

    it("has aria-hidden icon", () => {
      const { container } = render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      const icon = container.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("dark mode", () => {
    it("has proper dark mode colors for elevator", () => {
      render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("dark:bg-red-900/30", "dark:text-red-400");
    });

    it("has proper dark mode colors for escalator", () => {
      render(<EquipmentBadge brokenElevators={0} brokenEscalators={1} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("dark:bg-amber-900/30", "dark:text-amber-400");
    });
  });

  describe("styling", () => {
    it("has rounded-full shape", () => {
      render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("rounded-full");
    });

    it("has proper padding", () => {
      render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("px-2", "py-0.5");
    });

    it("has small text size", () => {
      render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("text-11");
    });

    it("has font-medium weight", () => {
      render(<EquipmentBadge brokenElevators={1} brokenEscalators={0} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveClass("font-medium");
    });
  });
});
