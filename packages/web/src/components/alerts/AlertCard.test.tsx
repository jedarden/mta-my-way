/**
 * Tests for AlertCard component
 *
 * Tests the alert display card including:
 * - Severity styling and icons
 * - Affected lines display
 * - Expandable description
 * - Compact mode
 * - Raw and predicted alert indicators
 * - Timestamp updates
 * - Shuttle info display
 * - Accessibility
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlertCard } from "./AlertCard";

// Mock dependencies
vi.mock("../../lib/outputEncoding.js", () => ({
  encodeForAria: (text: string) => text,
  sanitizeUserInput: (text: string) => text,
}));

vi.mock("@mta-my-way/shared", () => ({
  formatTimeAgo: (seconds: number) => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  },
}));

vi.mock("../arrivals/LineBullet.jsx", () => ({
  LineBullet: ({ line, size }: { line: string; size: string }) => (
    <div data-testid={`line-bullet-${line}`} data-size={size}>
      {line}
    </div>
  ),
}));

vi.mock("./ShuttleInfo.jsx", () => ({
  ShuttleInfo: ({ shuttleInfo, compact }: { shuttleInfo: unknown; compact?: boolean }) => (
    <div data-testid="shuttle-info" data-compact={compact}>
      Shuttle: {JSON.stringify(shuttleInfo)}
    </div>
  ),
}));

const mockAlert = {
  id: "alert-1",
  severity: "severe" as const,
  headline: "Delays on 1 train",
  description: "1 trains are running with delays due to signal problems at 96 St.",
  affectedLines: ["1"],
  activePeriod: { start: Math.floor(Date.now() / 1000) - 3600, end: null },
  shuttleInfo: null,
};

describe("AlertCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("basic rendering", () => {
    it("renders alert headline", () => {
      render(<AlertCard alert={mockAlert} />);

      expect(screen.getByText("Delays on 1 train")).toBeInTheDocument();
    });

    it("renders affected lines", () => {
      render(<AlertCard alert={mockAlert} />);

      expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();
    });

    it("renders severity icon", () => {
      const { container } = render(<AlertCard alert={mockAlert} />);

      const icon = container.querySelector('svg[aria-hidden="true"]');
      expect(icon).toBeInTheDocument();
    });

    it("renders since timestamp", () => {
      render(<AlertCard alert={mockAlert} />);

      expect(screen.getByText(/since/i)).toBeInTheDocument();
    });
  });

  describe("severity styling", () => {
    it("applies severe styling", () => {
      const { container } = render(<AlertCard alert={{ ...mockAlert, severity: "severe" }} />);

      const article = container.querySelector("article");
      expect(article).toHaveClass("border-mta-red");
    });

    it("applies warning styling", () => {
      const { container } = render(<AlertCard alert={{ ...mockAlert, severity: "warning" }} />);

      const article = container.querySelector("article");
      expect(article).toHaveClass("border-mta-yellow");
    });

    it("applies info styling", () => {
      const { container } = render(<AlertCard alert={{ ...mockAlert, severity: "info" }} />);

      const article = container.querySelector("article");
      expect(article).toHaveClass("border-mta-gray");
    });
  });

  describe("expandable description", () => {
    it("is collapsed by default", () => {
      render(<AlertCard alert={mockAlert} />);

      expect(screen.queryByText(mockAlert.description)).not.toBeInTheDocument();
    });

    it("expands when clicked", async () => {
      const user = userEvent.setup();
      render(<AlertCard alert={mockAlert} />);

      const button = screen.getByRole("button", { name: /expand details for/i });
      await user.click(button);

      expect(screen.getByText(mockAlert.description)).toBeInTheDocument();
    });

    it("collapses when clicked again", async () => {
      const user = userEvent.setup();
      render(<AlertCard alert={mockAlert} initiallyExpanded={true} />);

      expect(screen.getByText(mockAlert.description)).toBeInTheDocument();

      const button = screen.getByRole("button", { name: /collapse details for/i });
      await user.click(button);

      expect(screen.queryByText(mockAlert.description)).not.toBeInTheDocument();
    });

    it("does not show expand button when description is same as headline", () => {
      const alertWithSameDescription = {
        ...mockAlert,
        description: mockAlert.headline,
      };
      render(<AlertCard alert={alertWithSameDescription} />);

      expect(screen.queryByRole("button", { name: /expand/i })).not.toBeInTheDocument();
    });
  });

  describe("raw alert indicator", () => {
    it("shows raw alert indicator when isRaw is true", () => {
      render(<AlertCard alert={mockAlert} isRaw={true} />);

      expect(screen.getByText("(raw alert)")).toBeInTheDocument();
    });

    it("applies dashed border for raw alerts", () => {
      const { container } = render(<AlertCard alert={mockAlert} isRaw={true} />);

      const article = container.querySelector("article");
      expect(article).toHaveClass("border-dashed");
    });
  });

  describe("predicted alert indicator", () => {
    it("shows predicted alert indicator when isPredicted is true", () => {
      render(<AlertCard alert={mockAlert} isPredicted={true} />);

      expect(screen.getByText("(predicted)")).toBeInTheDocument();
    });

    it("applies dotted border for predicted alerts", () => {
      const { container } = render(<AlertCard alert={mockAlert} isPredicted={true} />);

      const article = container.querySelector("article");
      expect(article).toHaveClass("border-dotted");
      expect(article).toHaveClass("border-amber-500");
    });
  });

  describe("compact mode", () => {
    it("renders in compact mode", () => {
      const { container } = render(<AlertCard alert={mockAlert} compact={true} />);

      expect(screen.getByText(mockAlert.headline)).toBeInTheDocument();
      expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();

      // In compact mode, should not have expand button
      expect(screen.queryByRole("button", { name: /expand/i })).not.toBeInTheDocument();
    });

    it("limits lines shown in compact mode", () => {
      const alertWithManyLines = {
        ...mockAlert,
        affectedLines: ["1", "2", "3", "4", "5"],
      };
      render(<AlertCard alert={alertWithManyLines} compact={true} />);

      expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();
      expect(screen.getByTestId("line-bullet-2")).toBeInTheDocument();
      expect(screen.getByTestId("line-bullet-3")).toBeInTheDocument();
      expect(screen.getByText("+2")).toBeInTheDocument();
    });
  });

  describe("shuttle info", () => {
    it("shows shuttle info in expanded state", () => {
      const alertWithShuttle = {
        ...mockAlert,
        shuttleInfo: {
          type: "rail" as const,
          startStation: "Times Sq-42 St",
          endStation: "34 St-Penn Station",
        },
      };
      render(<AlertCard alert={alertWithShuttle} initiallyExpanded={true} />);

      expect(screen.getByTestId("shuttle-info")).toBeInTheDocument();
    });

    it("shows compact shuttle info when collapsed", () => {
      const alertWithShuttle = {
        ...mockAlert,
        shuttleInfo: {
          type: "rail" as const,
          startStation: "Times Sq-42 St",
          endStation: "34 St-Penn Station",
        },
      };
      render(<AlertCard alert={alertWithShuttle} />);

      // Should show shuttle info even when collapsed
      expect(screen.getByTestId("shuttle-info")).toBeInTheDocument();
      expect(screen.getByTestId("shuttle-info")).toHaveAttribute("data-compact", "true");
    });
  });

  describe("multiple affected lines", () => {
    it("displays all affected lines", () => {
      const multiLineAlert = {
        ...mockAlert,
        affectedLines: ["1", "2", "3"],
      };
      render(<AlertCard alert={multiLineAlert} />);

      expect(screen.getByTestId("line-bullet-1")).toBeInTheDocument();
      expect(screen.getByTestId("line-bullet-2")).toBeInTheDocument();
      expect(screen.getByTestId("line-bullet-3")).toBeInTheDocument();
    });

    it("has proper aria-label for affected lines", () => {
      const multiLineAlert = {
        ...mockAlert,
        affectedLines: ["1", "2", "3"],
      };
      render(<AlertCard alert={multiLineAlert} />);

      expect(screen.getByLabelText("Affected lines: 1, 2, 3")).toBeInTheDocument();
    });
  });

  describe("timestamp updates", () => {
    it("clears interval on unmount", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      const { unmount } = render(<AlertCard alert={mockAlert} />);

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("has proper role and aria-labelledby", () => {
      const { container } = render(<AlertCard alert={mockAlert} />);

      const article = container.querySelector('[role="article"]');
      expect(article).toBeInTheDocument();
      expect(article).toHaveAttribute("aria-labelledby", "alert-alert-1-headline");
    });

    it("has proper aria-expanded state", () => {
      render(<AlertCard alert={mockAlert} />);

      const button = screen.getByRole("button", { name: /expand details for/i });
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("has proper aria-controls when expanded", () => {
      render(<AlertCard alert={mockAlert} initiallyExpanded={true} />);

      const button = screen.getByRole("button", { name: /collapse details for/i });
      expect(button).toHaveAttribute("aria-controls", "alert-alert-1-description");
    });

    it("has aria-label for expand button", () => {
      render(<AlertCard alert={mockAlert} />);

      expect(
        screen.getByRole("button", {
          name: /expand details for: Delays on 1 train/i,
        })
      ).toBeInTheDocument();
    });

    it("has region role for expanded description", () => {
      render(<AlertCard alert={mockAlert} initiallyExpanded={true} />);

      const region = screen.getByRole("region", { name: "Alert details" });
      expect(region).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles alert without id", () => {
      const alertWithoutId = { ...mockAlert, id: null };
      const { container } = render(<AlertCard alert={alertWithoutId} />);

      const article = container.querySelector("article");
      expect(article?.getAttribute("aria-labelledby")).toMatch(/^alert-.*-headline$/);
    });

    it("handles empty affected lines", () => {
      const alertWithNoLines = { ...mockAlert, affectedLines: [] };
      render(<AlertCard alert={alertWithNoLines} />);

      expect(screen.queryByTestId("line-bullet-1")).not.toBeInTheDocument();
    });

    it("handles null description", () => {
      const alertWithNullDescription = {
        ...mockAlert,
        description: null as unknown as string,
      };
      render(<AlertCard alert={alertWithNullDescription} />);

      // Should not crash and should not show expand button
      expect(screen.queryByRole("button", { name: /expand/i })).not.toBeInTheDocument();
    });

    it("handles alert with null end time for active period", () => {
      const alertWithNullEnd = {
        ...mockAlert,
        activePeriod: { start: Math.floor(Date.now() / 1000), end: null },
      };
      render(<AlertCard alert={alertWithNullEnd} />);

      expect(screen.getByText("Delays on 1 train")).toBeInTheDocument();
    });
  });

  describe("keyboard interaction", () => {
    it("compact card handles keyboard events", async () => {
      const user = userEvent.setup();
      render(<AlertCard alert={mockAlert} compact={true} />);

      const card = screen.getByRole("alert");
      card.focus();

      await user.keyboard("{Enter}");

      // Should not throw error
      expect(card).toHaveFocus();
    });
  });
});
