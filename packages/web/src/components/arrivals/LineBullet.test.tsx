/**
 * Tests for LineBullet component
 *
 * Tests the subway line indicator component including:
 * - Rendering different line IDs
 * - Size variants (sm, md, lg)
 * - Click handlers
 * - MTA color application
 * - Accessibility attributes
 * - Long-press tooltip (line name, division, express/local)
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  getLineMetadata: (line: string) => {
    const meta: Record<string, object> = {
      "1": {
        id: "1",
        shortName: "1",
        longName: "Broadway-7th Ave Local",
        division: "A",
        isExpress: false,
      },
      A: {
        id: "A",
        shortName: "A",
        longName: "8th Ave Express",
        division: "B",
        isExpress: true,
      },
    };
    return meta[line];
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
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ backgroundColor: "#0039A6" });
    });

    it("applies correct background color for line 1", () => {
      render(<LineBullet line="1" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ backgroundColor: "#EE352E" });
    });

    it("applies correct text color for light background lines", () => {
      render(<LineBullet line="A" />);

      const button = screen.getByRole("button");
      expect(button).toHaveStyle({ color: "#FFFFFF" });
    });

    it("applies correct text color for dark background lines (L, S)", () => {
      render(<LineBullet line="L" />);

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

  describe("long press tooltip", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows tooltip after 300ms hold", () => {
      render(<LineBullet line="1" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));

      expect(screen.getByRole("tooltip")).toBeInTheDocument();
    });

    it("tooltip contains full line name", () => {
      render(<LineBullet line="1" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));

      expect(screen.getByRole("tooltip")).toHaveTextContent("Broadway-7th Ave Local");
    });

    it("tooltip contains division info", () => {
      render(<LineBullet line="1" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));

      expect(screen.getByRole("tooltip")).toHaveTextContent("Division A");
    });

    it("tooltip shows Local for non-express lines", () => {
      render(<LineBullet line="1" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));

      expect(screen.getByRole("tooltip")).toHaveTextContent("Local");
    });

    it("tooltip shows Express for express lines", () => {
      render(<LineBullet line="A" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));

      expect(screen.getByRole("tooltip")).toHaveTextContent("Express");
    });

    it("does not show tooltip before 300ms", () => {
      render(<LineBullet line="1" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(299));

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("hides tooltip on pointer up", () => {
      render(<LineBullet line="1" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      fireEvent.pointerUp(wrapper);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("hides tooltip on pointer leave", () => {
      render(<LineBullet line="1" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      fireEvent.pointerLeave(wrapper);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("cancels long press if released before 300ms", () => {
      render(<LineBullet line="1" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(100));
      fireEvent.pointerUp(wrapper);
      act(() => vi.advanceTimersByTime(300));

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("does not show tooltip for unknown line with no metadata", () => {
      render(<LineBullet line="X" />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));

      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    });

    it("does not call onClick after long press", async () => {
      vi.useRealTimers();
      vi.useFakeTimers();
      const handleClick = vi.fn();
      render(<LineBullet line="1" onClick={handleClick} />);
      const wrapper = screen.getByRole("button").parentElement!;

      fireEvent.pointerDown(wrapper);
      act(() => vi.advanceTimersByTime(300));
      fireEvent.pointerUp(wrapper);
      fireEvent.click(screen.getByRole("button"));

      expect(handleClick).not.toHaveBeenCalled();
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
