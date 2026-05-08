/**
 * Tests for LineStatusTile component
 *
 * Tests the line health status tile component including:
 * - Different line statuses (normal, minor_delays, significant_delays, suspended)
 * - Color coding
 * - Line bullet display
 * - Click handlers
 * - Status labels
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LineStatusTile } from "./LineStatusTile";

// Mock the shared utilities
vi.mock("@mta-my-way/shared", () => ({
  getLineColor: (lineId: string) => {
    const colors: Record<string, string> = {
      A: "#0039A6",
      "1": "#EE352E",
      L: "#A7A9AC",
    };
    return colors[lineId] || "#000000";
  },
  getLineTextColor: (lineId: string) => {
    return lineId === "L" ? "#000000" : "#FFFFFF";
  },
  getLineMetadata: (lineId: string) => {
    const metadata: Record<string, { shortName: string }> = {
      A: { shortName: "A" },
      "1": { shortName: "1" },
      L: { shortName: "L" },
      "123": { shortName: "123" },
    };
    return metadata[lineId] || { shortName: lineId };
  },
}));

const mockLineStatuses = {
  normal: {
    lineId: "A",
    status: "normal",
    summary: null,
  },
  minor_delays: {
    lineId: "1",
    status: "minor_delays",
    summary: "Trains running with delays",
  },
  significant_delays: {
    lineId: "L",
    status: "significant_delays",
    summary: "Major delays expected",
  },
  suspended: {
    lineId: "123",
    status: "suspended",
    summary: "No service",
  },
} as const;

describe("LineStatusTile", () => {
  describe("normal status", () => {
    it("renders with green ring", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("ring-2", "ring-green-400/50");
    });

    it("shows Normal status label", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      expect(screen.getByText("Normal")).toBeInTheDocument();
    });

    it("shows green text for status", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      const status = screen.getByText("Normal");
      expect(status).toHaveClass("text-green-600", "dark:text-green-400");
    });

    it("has surface background", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-surface", "dark:bg-dark-surface");
    });
  });

  describe("minor delays status", () => {
    it("renders with yellow ring", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.minor_delays} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("ring-2", "ring-yellow-400");
    });

    it("shows Minor status label", () => {
      render(<LineStatusTile line={mockLineStatuses.minor_delays} />);

      expect(screen.getByText("Minor")).toBeInTheDocument();
    });

    it("shows yellow text for status", () => {
      render(<LineStatusTile line={mockLineStatuses.minor_delays} />);

      const status = screen.getByText("Minor");
      expect(status).toHaveClass("text-yellow-600", "dark:text-yellow-400");
    });

    it("has yellow background", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.minor_delays} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-yellow-50", "dark:bg-yellow-950/30");
    });
  });

  describe("significant delays status", () => {
    it("renders with orange ring", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.significant_delays} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("ring-2", "ring-orange-400");
    });

    it("shows Delays status label", () => {
      render(<LineStatusTile line={mockLineStatuses.significant_delays} />);

      expect(screen.getByText("Delays")).toBeInTheDocument();
    });

    it("shows orange text for status", () => {
      render(<LineStatusTile line={mockLineStatuses.significant_delays} />);

      const status = screen.getByText("Delays");
      expect(status).toHaveClass("text-orange-600", "dark:text-orange-400");
    });

    it("has orange background", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.significant_delays} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-orange-50", "dark:bg-orange-950/30");
    });
  });

  describe("suspended status", () => {
    it("renders with red ring", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.suspended} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("ring-2", "ring-red-500");
    });

    it("shows Down status label", () => {
      render(<LineStatusTile line={mockLineStatuses.suspended} />);

      expect(screen.getByText("Down")).toBeInTheDocument();
    });

    it("shows red text for status", () => {
      render(<LineStatusTile line={mockLineStatuses.suspended} />);

      const status = screen.getByText("Down");
      expect(status).toHaveClass("text-red-600", "dark:text-red-400");
    });

    it("has red background", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.suspended} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("bg-red-50", "dark:bg-red-950/30");
    });
  });

  describe("line bullet", () => {
    it("displays line ID in bullet", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      expect(screen.getByText("A")).toBeInTheDocument();
    });

    it("uses correct line color", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.normal} />);

      // Find the bullet div by its class (w-9 h-9 rounded-full)
      const bullet = container.querySelector(".w-9.h-9.rounded-full");
      expect(bullet).toBeInTheDocument();
      // Check that the inline style is applied (jsdom normalizes to rgb())
      const styleAttr = bullet?.getAttribute("style");
      expect(styleAttr).toBeTruthy();
      expect(styleAttr).toContain("background-color: rgb(0, 57, 166)");
    });

    it("uses correct text color", () => {
      const { container } = render(<LineStatusTile line={mockLineStatuses.normal} />);

      // Find the bullet div by its class (w-9 h-9 rounded-full)
      const bullet = container.querySelector(".w-9.h-9.rounded-full");
      expect(bullet).toBeInTheDocument();
      // Check that the inline style is applied (jsdom normalizes to rgb())
      const styleAttr = bullet?.getAttribute("style");
      expect(styleAttr).toBeTruthy();
      expect(styleAttr).toContain("color: rgb(255, 255, 255)");
    });
  });

  describe("interaction", () => {
    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<LineStatusTile line={mockLineStatuses.normal} onClick={handleClick} />);

      const button = screen.getByRole("button");
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("is clickable when onClick provided", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} onClick={vi.fn()} />);

      const button = screen.getByRole("button");
      expect(button).toBeEnabled();
    });
  });

  describe("accessibility", () => {
    it("has proper aria-label with status", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button", { name: /A train.*Normal/i });
      expect(button).toBeInTheDocument();
    });

    it("includes summary in aria-label when available", () => {
      render(<LineStatusTile line={mockLineStatuses.minor_delays} />);

      const button = screen.getByRole("button", {
        name: /1 train.*Minor.*Trains running with delays/i,
      });
      expect(button).toBeInTheDocument();
    });
  });

  describe("styling", () => {
    it("has rounded corners", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("rounded-xl");
    });

    it("has proper padding", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("p-3");
    });

    it("has flex column layout", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("flex", "flex-col", "items-center");
    });

    it("has hover effect", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("hover:brightness-95");
    });

    it("has active scale effect", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button");
      expect(button.className).toContain("active:scale-[0.97]");
    });

    it("has minimum touch target", () => {
      render(<LineStatusTile line={mockLineStatuses.normal} />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("min-h-touch");
    });
  });

  describe("unknown lines", () => {
    it("handles unknown line IDs", () => {
      const unknownLine = {
        lineId: "X",
        status: "normal" as const,
        summary: null,
      };
      render(<LineStatusTile line={unknownLine} />);

      expect(screen.getByText("X")).toBeInTheDocument();
    });

    it("uses line ID as display name when no metadata", () => {
      const unknownLine = {
        lineId: "X",
        status: "normal" as const,
        summary: null,
      };
      render(<LineStatusTile line={unknownLine} />);

      const button = screen.getByRole("button", { name: /X train/i });
      expect(button).toBeInTheDocument();
    });
  });
});
