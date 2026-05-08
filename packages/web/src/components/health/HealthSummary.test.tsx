/**
 * Tests for HealthSummary component
 *
 * Tests the overall system health summary component including:
 * - Percentage display
 * - Color coding based on health level
 * - Circular progress indicator
 * - Status labels
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HealthSummary } from "./HealthSummary";

describe("HealthSummary", () => {
  describe("good service (90%+)", () => {
    it("renders green color for excellent health", () => {
      render(<HealthSummary percentage={95} totalLines={20} />);

      const percentage = screen.getByText("95%");
      expect(percentage).toHaveClass("text-green-600", "dark:text-green-400");
    });

    it("shows Good Service label", () => {
      render(<HealthSummary percentage={95} totalLines={20} />);

      expect(screen.getByText("Good Service")).toBeInTheDocument();
    });

    it("shows green circular progress", () => {
      const { container } = render(<HealthSummary percentage={95} totalLines={20} />);

      const progressCircle = container.querySelector(".bg-green-500");
      expect(progressCircle).toBeInTheDocument();
    });
  });

  describe("minor issues (70-89%)", () => {
    it("renders yellow color for minor issues", () => {
      render(<HealthSummary percentage={80} totalLines={20} />);

      const percentage = screen.getByText("80%");
      expect(percentage).toHaveClass("text-yellow-600", "dark:text-yellow-400");
    });

    it("shows Minor Issues label", () => {
      render(<HealthSummary percentage={75} totalLines={20} />);

      expect(screen.getByText("Minor Issues")).toBeInTheDocument();
    });

    it("shows yellow circular progress", () => {
      const { container } = render(<HealthSummary percentage={80} totalLines={20} />);

      const progressCircle = container.querySelector(".bg-yellow-500");
      expect(progressCircle).toBeInTheDocument();
    });
  });

  describe("significant disruptions (50-69%)", () => {
    it("renders orange color for significant disruptions", () => {
      render(<HealthSummary percentage={60} totalLines={20} />);

      const percentage = screen.getByText("60%");
      expect(percentage).toHaveClass("text-orange-600", "dark:text-orange-400");
    });

    it("shows Significant Disruptions label", () => {
      render(<HealthSummary percentage={55} totalLines={20} />);

      expect(screen.getByText("Significant Disruptions")).toBeInTheDocument();
    });

    it("shows orange circular progress", () => {
      const { container } = render(<HealthSummary percentage={60} totalLines={20} />);

      const progressCircle = container.querySelector(".bg-orange-500");
      expect(progressCircle).toBeInTheDocument();
    });
  });

  describe("major disruptions (<50%)", () => {
    it("renders red color for major disruptions", () => {
      render(<HealthSummary percentage={30} totalLines={20} />);

      const percentage = screen.getByText("30%");
      expect(percentage).toHaveClass("text-red-600", "dark:text-red-400");
    });

    it("shows Major Disruptions label", () => {
      render(<HealthSummary percentage={25} totalLines={20} />);

      expect(screen.getByText("Major Disruptions")).toBeInTheDocument();
    });

    it("shows red circular progress", () => {
      const { container } = render(<HealthSummary percentage={30} totalLines={20} />);

      const progressCircle = container.querySelector(".bg-red-500");
      expect(progressCircle).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles 100% health", () => {
      render(<HealthSummary percentage={100} totalLines={20} />);

      expect(screen.getByText("100%")).toBeInTheDocument();
      expect(screen.getByText("Good Service")).toBeInTheDocument();
    });

    it("handles 0% health", () => {
      render(<HealthSummary percentage={0} totalLines={20} />);

      expect(screen.getByText("0%")).toBeInTheDocument();
      expect(screen.getByText("Major Disruptions")).toBeInTheDocument();
    });

    it("handles boundary at 90%", () => {
      render(<HealthSummary percentage={90} totalLines={20} />);

      const percentage = screen.getByText("90%");
      expect(percentage).toHaveClass("text-green-600");
    });

    it("handles boundary at 70%", () => {
      render(<HealthSummary percentage={70} totalLines={20} />);

      const percentage = screen.getByText("70%");
      expect(percentage).toHaveClass("text-yellow-600");
    });

    it("handles boundary at 50%", () => {
      render(<HealthSummary percentage={50} totalLines={20} />);

      const percentage = screen.getByText("50%");
      expect(percentage).toHaveClass("text-orange-600");
    });
  });

  describe("summary text", () => {
    it("shows count of healthy lines", () => {
      render(<HealthSummary percentage={75} totalLines={20} />);

      expect(screen.getByText("75 of 20 lines running normally")).toBeInTheDocument();
    });

    it("handles single line", () => {
      render(<HealthSummary percentage={100} totalLines={1} />);

      expect(screen.getByText("100 of 1 lines running normally")).toBeInTheDocument();
    });

    it("handles many lines", () => {
      render(<HealthSummary percentage={50} totalLines={100} />);

      expect(screen.getByText("50 of 100 lines running normally")).toBeInTheDocument();
    });
  });

  describe("circular progress indicator", () => {
    it("has proper SVG structure", () => {
      const { container } = render(<HealthSummary percentage={75} totalLines={20} />);

      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("viewBox", "0 0 36 36");
    });

    it("has background circle", () => {
      const { container } = render(<HealthSummary percentage={75} totalLines={20} />);

      const circles = container.querySelectorAll("circle");
      expect(circles.length).toBe(2);
    });

    it("shows correct stroke dasharray for percentage", () => {
      const { container } = render(<HealthSummary percentage={60} totalLines={20} />);

      const progressCircle = container.querySelector(".bg-orange-500");
      expect(progressCircle).toHaveAttribute("stroke-dasharray", "60, 100");
    });
  });

  describe("styling", () => {
    it("has rounded container", () => {
      const { container } = render(<HealthSummary percentage={75} totalLines={20} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("rounded-xl");
    });

    it("has proper padding", () => {
      const { container } = render(<HealthSummary percentage={75} totalLines={20} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("p-4");
    });

    it("has flex layout", () => {
      const { container } = render(<HealthSummary percentage={75} totalLines={20} />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("flex", "items-center", "gap-4");
    });
  });

  describe("accessibility", () => {
    it("has proper text contrast", () => {
      render(<HealthSummary percentage={75} totalLines={20} />);

      const label = screen.getByText("Minor Issues");
      expect(label).toHaveClass("text-base", "font-semibold");
    });
  });
});
