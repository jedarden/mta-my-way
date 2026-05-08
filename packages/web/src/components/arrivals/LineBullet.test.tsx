/**
 * Tests for LineBullet component
 *
 * Tests the subway line indicator component including:
 * - Rendering different line IDs
 * - Size variants (sm, md, lg)
 * - Click handlers
 * - MTA color application
 * - Accessibility attributes
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LineBullet } from "./LineBullet";

// Mock the color utilities
vi.mock("@mta-my-way/shared", () => ({
  getLineColor: (line: string) => {
    const colors: Record<string, string> = {
      "1": "#EE352E",
      "2": "#EE352E",
      A: "#0039A6",
      B: "#FF6319",
      S: "#808183",
      L: "#A7A9AC",
    };
    return colors[line] || "#000000";
  },
  getLineTextColor: (line: string) => {
    return line === "L" || line === "S" ? "#000000" : "#FFFFFF";
  },
}));

describe("LineBullet", () => {
  describe("rendering", () => {
    it("renders line ID", () => {
      render(<LineBullet line="A" />);

      expect(screen.getByRole("button")).toHaveTextContent("A");
    });

    it("renders numeric lines", () => {
      render(<LineBullet line="1" />);

      expect(screen.getByRole("button")).toHaveTextContent("1");
    });

    it("renders letter lines", () => {
      render(<LineBullet line="B" />);

      expect(screen.getByRole("button")).toHaveTextContent("B");
    });

    it("renders shuttle lines", () => {
      render(<LineBullet line="S" />);

      expect(screen.getByRole("button")).toHaveTextContent("S");
    });
  });

  describe("size variants", () => {
    it("renders small size by default", () => {
      render(<LineBullet line="A" size="sm" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("w-6", "h-6");
    });

    it("renders medium size (default)", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("w-8", "h-8");
    });

    it("renders large size", () => {
      render(<LineBullet line="A" size="lg" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("w-10", "h-10");
    });
  });

  describe("colors", () => {
    it("applies correct background color for line A", () => {
      const { container } = render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ backgroundColor: "#0039A6" });
    });

    it("applies correct background color for line 1", () => {
      const { container } = render(<LineBullet line="1" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ backgroundColor: "#EE352E" });
    });

    it("applies correct text color for light background lines", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ color: "#FFFFFF" });
    });

    it("applies correct text color for dark background lines (L, S)", () => {
      const { container } = render(<LineBullet line="L" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ color: "#000000" });
    });
  });

  describe("interaction", () => {
    it("is disabled by default when no onClick provided", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("calls onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<LineBullet line="A" onClick={handleClick} />);

      const button = screen.getByRole("button");
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("is enabled when onClick is provided", () => {
      render(<LineBullet line="A" onClick={vi.fn()} />);

      const button = screen.getByRole("button");
      expect(button).not.toBeDisabled();
    });
  });

  describe("styling", () => {
    it("applies custom className", () => {
      render(<LineBullet line="A" className="custom-class" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("custom-class");
    });

    it("has rounded-full shape", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("rounded-full");
    });

    it("has bold text", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("font-bold");
    });

    it("has flex centering", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("inline-flex", "items-center", "justify-center");
    });
  });

  describe("accessibility", () => {
    it("has proper aria-label", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button", { name: "A train" });
      expect(button).toBeInTheDocument();
    });

    it("has focus-visible ring", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("focus-visible:ring-2", "focus-visible:ring-offset-2");
    });

    it("has disabled cursor style when disabled", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("disabled:cursor-default");
    });

    it("has min touch target size", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveClass("min-w-touch", "min-h-touch");
    });
  });

  describe("edge cases", () => {
    it("handles unknown line IDs", () => {
      render(<LineBullet line="X" />);

      const button = screen.getByRole("button");
      expect(button).toHaveTextContent("X");
      // Should still render with default color
      expect(button).toHaveStyle({ backgroundColor: "#000000" });
    });

    it("handles empty line ID", () => {
      render(<LineBullet line="" />);

      const button = screen.getByRole("button");
      expect(button).toHaveTextContent("");
    });

    it("handles special characters in line ID", () => {
      render(<LineBullet line="7X" />);

      const button = screen.getByRole("button");
      expect(button).toHaveTextContent("7X");
    });
  });
});
