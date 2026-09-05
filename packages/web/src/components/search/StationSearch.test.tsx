/**
 * Tests for the StationSearch component.
 *
 * Covers the debounced type-ahead contract SearchScreen, StationPicker and
 * OnboardingFlow all rely on:
 * - keystrokes appear instantly while `onChange` waits for the idle period
 * - rapid typing coalesces into a single trailing `onChange`
 * - the clear button fires `onChange("")` immediately and cancels a pending call
 * - the parent's `value` is synced back into the input
 * - a pending debounce never fires after unmount
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StationSearch } from "./StationSearch";

const PLACEHOLDER = "Search stations, lines, neighborhoods...";

function renderSearch(props: Partial<Parameters<typeof StationSearch>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(<StationSearch value="" onChange={onChange} {...props} />);
  const input = screen.getByLabelText("Search stations") as HTMLInputElement;
  return { onChange, input, ...utils };
}

/** Type a whole string in one change event (fireEvent is synchronous, so it
 *  composes with fake timers without userEvent's own timer advancement). */
function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("StationSearch", () => {
  describe("rendering", () => {
    it("renders the search input with its placeholder and aria-label", () => {
      renderSearch();

      expect(screen.getByLabelText("Search stations")).toBeInTheDocument();
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveAttribute("type", "search");
    });

    it("shows the initial value in the input", () => {
      renderSearch({ value: "times" });

      expect(screen.getByLabelText("Search stations")).toHaveValue("times");
    });

    it("autofocuses only when asked", () => {
      const { unmount } = renderSearch({ autoFocus: true });
      expect(screen.getByLabelText("Search stations")).toHaveFocus();
      unmount();

      renderSearch({ autoFocus: false });
      expect(screen.getByLabelText("Search stations")).not.toHaveFocus();
    });

    it("hides the clear button while the input is empty", () => {
      renderSearch();

      expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    });
  });

  describe("debounce", () => {
    it("does not call onChange before the debounce elapses", () => {
      const { onChange, input } = renderSearch();

      type(input, "times");
      vi.advanceTimersByTime(199);

      expect(onChange).not.toHaveBeenCalled();
    });

    it("calls onChange once with the typed value after the default 200ms", () => {
      const { onChange, input } = renderSearch();

      type(input, "times");

      vi.advanceTimersByTime(200);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("times");
    });

    it("honours a custom debounceMs", () => {
      const { onChange, input } = renderSearch({ debounceMs: 500 });

      type(input, "a");
      vi.advanceTimersByTime(499);
      expect(onChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("coalesces rapid keystrokes into one trailing onChange", () => {
      const { onChange, input } = renderSearch();

      type(input, "t");
      vi.advanceTimersByTime(100);
      type(input, "ti");
      vi.advanceTimersByTime(100);
      type(input, "times sq");

      vi.advanceTimersByTime(200);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("times sq");
    });

    it("restarts the timer on every keystroke instead of firing on schedule", () => {
      const { onChange, input } = renderSearch();

      type(input, "times");
      vi.advanceTimersByTime(150);
      type(input, "times sq");

      // 50ms later the original 200ms window would have elapsed if it had not
      // been reset by the second keystroke.
      vi.advanceTimersByTime(50);
      expect(onChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(150);
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("shows each keystroke in the input while the debounce is still pending", () => {
      const { input } = renderSearch();

      type(input, "times sq");

      expect(input).toHaveValue("times sq");
    });

    it("fires a separate onChange per settled burst", () => {
      const { onChange, input } = renderSearch();

      type(input, "times");
      vi.advanceTimersByTime(200);
      type(input, "times sq");
      vi.advanceTimersByTime(200);

      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenNthCalledWith(1, "times");
      expect(onChange).toHaveBeenNthCalledWith(2, "times sq");
    });
  });

  describe("clear", () => {
    it("offers a clear button once text has been entered", () => {
      const { input } = renderSearch();

      type(input, "times");

      expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
    });

    it("empties the input and calls onChange immediately, without waiting for the debounce", () => {
      const { onChange, input } = renderSearch();

      type(input, "times");
      fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

      expect(input).toHaveValue("");
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("");
      expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    });

    it("cancels a pending debounced onChange when cleared", () => {
      const { onChange, input } = renderSearch();

      type(input, "times");
      fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

      vi.advanceTimersByTime(1000);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("");
    });
  });

  describe("controlled value", () => {
    it("follows the parent when it resets the value", () => {
      const { rerender, input } = renderSearch({ value: "times" });

      rerender(<StationSearch value="" onChange={vi.fn()} />);

      expect(input).toHaveValue("");
    });

    it("keeps the typed value while the debounce is pending and the parent has not committed", () => {
      const { rerender, input } = renderSearch();

      type(input, "times");
      // Parent re-renders with the same (still stale) value it holds.
      rerender(<StationSearch value="" onChange={vi.fn()} />);

      expect(input).toHaveValue("times");
    });
  });

  describe("unmount", () => {
    it("drops a pending debounced onChange", () => {
      const { onChange, input, unmount } = renderSearch();

      type(input, "times");
      unmount();
      vi.advanceTimersByTime(1000);

      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
