/**
 * Tests for ConfidenceBar component
 *
 * Tests the confidence indicator component including:
 * - Visual style based on confidence level
 * - Tooltip display and behavior
 * - Accessibility features
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfidenceBar } from "./ConfidenceBar";

// Mock A/B division detection
vi.mock("@mta-my-way/shared", () => ({
  isADivision: (lineId: string) => /^\d+$/.test(lineId),
  isBDivision: (lineId: string) => /^[A-Z]$/.test(lineId),
}));

describe("ConfidenceBar", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  describe("visual styles", () => {
    it("renders solid border for high confidence", () => {
      const { container } = render(<ConfidenceBar confidence="high" />);
      const bar = container.querySelector('[role="img"]');

      expect(bar).toHaveClass("border-solid");
      expect(bar).toHaveClass("border-text-primary");
    });

    it("renders dashed border for medium confidence", () => {
      const { container } = render(<ConfidenceBar confidence="medium" />);
      const bar = container.querySelector('[role="img"]');

      expect(bar).toHaveClass("border-dashed");
      expect(bar).toHaveClass("border-text-secondary");
    });

    it("renders dotted border for low confidence", () => {
      const { container } = render(<ConfidenceBar confidence="low" />);
      const bar = container.querySelector('[role="img"]');

      expect(bar).toHaveClass("border-dotted");
      expect(bar).toHaveClass("border-text-secondary");
      expect(bar).toHaveClass("opacity-60");
    });

    it("applies custom className", () => {
      const { container } = render(<ConfidenceBar confidence="high" className="mt-4" />);
      const bar = container.querySelector('[role="img"]');

      expect(bar).toHaveClass("mt-4");
    });
  });

  describe("without lineId", () => {
    it("does not show tooltip", () => {
      const { container } = render(<ConfidenceBar confidence="high" />);
      const trigger = container.querySelector('[role="img"]');

      expect(trigger).not.toHaveClass("cursor-help");
      expect(trigger).not.toHaveAttribute("tabIndex");
    });

    it("has basic title attribute", () => {
      const { container } = render(<ConfidenceBar confidence="high" />);
      const trigger = container.querySelector('[role="img"]');

      expect(trigger).toHaveAttribute("title", "high confidence");
    });

    it("has accessible label", () => {
      const { container } = render(<ConfidenceBar confidence="medium" />);
      const trigger = container.querySelector('[role="img"]');

      expect(trigger).toHaveAttribute("aria-label", "medium confidence prediction");
    });
  });

  describe("with lineId", () => {
    it("shows tooltip on click", async () => {
      const user = userEvent.setup();
      const { container } = render(<ConfidenceBar confidence="high" lineId="1" />);
      const trigger = container.querySelector('[role="img"]') as HTMLElement;

      expect(trigger).toHaveClass("cursor-help");
      expect(trigger).toHaveAttribute("tabIndex", "0");

      await user.click(trigger);

      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toBeInTheDocument();
      expect(tooltip).toHaveTextContent("High confidence");
    });

    it("shows A Division info for numbered lines", async () => {
      const user = userEvent.setup();
      render(<ConfidenceBar confidence="medium" lineId="2" />);

      const trigger = screen.getByRole("img");
      await user.click(trigger);

      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("A Division (numbered lines)");
    });

    it("shows B Division info for lettered lines", async () => {
      const user = userEvent.setup();
      render(<ConfidenceBar confidence="low" lineId="A" />);

      const trigger = screen.getByRole("img");
      await user.click(trigger);

      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toHaveTextContent("B Division (lettered lines)");
    });

    it("toggles tooltip on subsequent clicks", async () => {
      const user = userEvent.setup();
      const { container } = render(<ConfidenceBar confidence="high" lineId="1" />);
      const trigger = container.querySelector('[role="img"]') as HTMLElement;

      // Open tooltip
      await user.click(trigger);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      // Close tooltip
      await user.click(trigger);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

      // Open again
      await user.click(trigger);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("closes tooltip on outside click", async () => {
      const user = userEvent.setup();
      const { container } = render(
        <>
          <ConfidenceBar confidence="high" lineId="1" />
          <div data-testid="outside">Outside element</div>
        </>
      );
      const trigger = container.querySelector('[role="img"]') as HTMLElement;

      await user.click(trigger);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      const outside = screen.getByTestId("outside");
      await user.click(outside);

      await waitFor(() => {
        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      });
    });

    it("closes tooltip after 4 seconds", async () => {
      vi.useFakeTimers();
      try {
        const { container } = render(<ConfidenceBar confidence="high" lineId="1" />);
        const trigger = container.querySelector('[role="img"]') as HTMLElement;

        // Use act to wrap state update
        await act(async () => {
          trigger.click();
        });

        expect(screen.getByRole("tooltip")).toBeInTheDocument();

        // Advance time past the 4 second auto-close threshold
        await act(async () => {
          vi.advanceTimersByTimeAsync(4100);
        });

        expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("opens tooltip on Enter key", async () => {
      const user = userEvent.setup({ delay: null });
      render(<ConfidenceBar confidence="high" lineId="1" />);

      const trigger = screen.getByRole("img");
      trigger.focus();

      await act(async () => {
        await user.keyboard("{Enter}");
      });

      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("opens tooltip on Space key", async () => {
      const user = userEvent.setup({ delay: null });
      render(<ConfidenceBar confidence="high" lineId="1" />);

      const trigger = screen.getByRole("img");
      trigger.focus();

      await act(async () => {
        await user.keyboard(" ");
      });

      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("has accessible label with line info", () => {
      const { container } = render(<ConfidenceBar confidence="high" lineId="A" />);
      const trigger = container.querySelector('[role="img"]');

      expect(trigger).toHaveAttribute("aria-label", "high confidence prediction for A train");
    });
  });

  describe("confidence descriptions", () => {
    it("shows correct description for high confidence", async () => {
      const user = userEvent.setup({ delay: null });
      render(<ConfidenceBar confidence="high" lineId="1" />);

      await act(async () => {
        await user.click(screen.getByRole("img"));
      });

      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "High confidence — ATS/CBTC tracking with reliable predictions"
      );
    });

    it("shows correct description for medium confidence", async () => {
      const user = userEvent.setup({ delay: null });
      render(<ConfidenceBar confidence="medium" lineId="A" />);

      await act(async () => {
        await user.click(screen.getByRole("img"));
      });

      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Medium confidence — predictions may vary by 1-2 minutes"
      );
    });

    it("shows correct description for low confidence", async () => {
      const user = userEvent.setup({ delay: null });
      render(<ConfidenceBar confidence="low" lineId="F" />);

      await act(async () => {
        await user.click(screen.getByRole("img"));
      });

      expect(screen.getByRole("tooltip")).toHaveTextContent(
        "Low confidence — prediction uncertain, may be delayed or cancelled"
      );
    });
  });
});
