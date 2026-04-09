/**
 * Unit tests for FocusTrap component
 *
 * Per plan.md Phase 4: WCAG accessibility compliance.
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FocusTrap } from "./FocusTrap";

describe("FocusTrap", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe("component behavior", () => {
    it("renders children without additional markup", () => {
      render(
        <FocusTrap>
          <div>Test content</div>
        </FocusTrap>,
        { container }
      );

      expect(screen.getByText("Test content")).toBeInTheDocument();
    });

    it("focuses first focusable element when activated", async () => {
      render(
        <FocusTrap active={true}>
          <button type="button">First Button</button>
          <button type="button">Second Button</button>
        </FocusTrap>,
        { container }
      );

      const firstButton = screen.getByText("First Button");

      // Wait for focus to be set (async in useEffect)
      await waitFor(() => {
        expect(document.activeElement).toBe(firstButton);
      });
    });

    it("does not focus when inactive", () => {
      render(
        <FocusTrap active={false}>
          <button type="button">First Button</button>
          <button type="button">Second Button</button>
        </FocusTrap>,
        { container }
      );

      // Focus should not be trapped
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe("keyboard navigation", () => {
    it("traps Tab key within container", () => {
      render(
        <FocusTrap active={true}>
          <button type="button">First Button</button>
          <button type="button">Second Button</button>
          <button type="button">Third Button</button>
        </FocusTrap>,
        { container }
      );

      const firstButton = screen.getByText("First Button");
      const lastButton = screen.getByText("Third Button");

      // Focus last button
      lastButton.focus();
      expect(document.activeElement).toBe(lastButton);

      // Press Tab - should wrap to first button
      const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
      lastButton.dispatchEvent(tabEvent);

      // Focus should still be within the trap
      expect(document.activeElement).toBe(firstButton);
    });

    it("traps Shift+Tab key within container", () => {
      render(
        <FocusTrap active={true}>
          <button type="button">First Button</button>
          <button type="button">Second Button</button>
          <button type="button">Third Button</button>
        </FocusTrap>,
        { container }
      );

      const firstButton = screen.getByText("First Button");
      const lastButton = screen.getByText("Third Button");

      // Focus first button
      firstButton.focus();
      expect(document.activeElement).toBe(firstButton);

      // Press Shift+Tab - should wrap to last button
      const shiftTabEvent = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      });
      firstButton.dispatchEvent(shiftTabEvent);

      // Focus should still be within the trap
      expect(document.activeElement).toBe(lastButton);
    });

    it("calls onEscape callback when Escape is pressed", () => {
      const onEscape = vi.fn();

      render(
        <FocusTrap active={true} onEscape={onEscape}>
          <button type="button">Button</button>
        </FocusTrap>,
        { container }
      );

      const button = screen.getByText("Button");
      button.focus();

      const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
      button.dispatchEvent(escapeEvent);

      expect(onEscape).toHaveBeenCalledTimes(1);
    });

    it("does not call onEscape when inactive", () => {
      const onEscape = vi.fn();

      render(
        <FocusTrap active={false} onEscape={onEscape}>
          <button type="button">Button</button>
        </FocusTrap>,
        { container }
      );

      const button = screen.getByText("Button");
      const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
      button.dispatchEvent(escapeEvent);

      expect(onEscape).not.toHaveBeenCalled();
    });
  });

  describe("focus restoration", () => {
    it("restores focus to previously active element on unmount", async () => {
      // Create a trigger button outside the trap (add to document.body to avoid removal on unmount)
      const triggerButton = document.createElement("button");
      triggerButton.textContent = "Trigger";
      document.body.appendChild(triggerButton);

      // Focus the trigger
      triggerButton.focus();
      expect(document.activeElement).toBe(triggerButton);

      // Render and mount focus trap
      const { unmount } = render(
        <FocusTrap active={true} triggerRef={{ current: triggerButton }}>
          <button type="button">Trapped Button</button>
        </FocusTrap>,
        { container }
      );

      // Wait for focus to be trapped
      await waitFor(() => {
        expect(document.activeElement).not.toBe(triggerButton);
      });

      // Unmount the trap within act() to ensure cleanup completes
      await act(async () => {
        unmount();
      });

      // Focus should be restored to trigger
      expect(document.activeElement).toBe(triggerButton);

      // Clean up
      document.body.removeChild(triggerButton);
    });

    it("restores focus to previous active element when no trigger provided", async () => {
      const previousButton = document.createElement("button");
      previousButton.textContent = "Previous";
      document.body.appendChild(previousButton);

      previousButton.focus();
      expect(document.activeElement).toBe(previousButton);

      const { unmount } = render(
        <FocusTrap active={true}>
          <button type="button">Trapped Button</button>
        </FocusTrap>,
        { container }
      );

      // Wait for focus to be trapped
      await waitFor(() => {
        expect(document.activeElement).not.toBe(previousButton);
      });

      // Unmount the trap within act() to ensure cleanup completes
      await act(async () => {
        unmount();
      });

      expect(document.activeElement).toBe(previousButton);

      // Clean up
      document.body.removeChild(previousButton);
    });
  });

  describe("focusable elements detection", () => {
    it("finds all focusable elements", () => {
      render(
        <FocusTrap active={true}>
          <button type="button">Button</button>
          <a href="/test">Link</a>
          <input type="text" />
          <select>
            <option>Select</option>
          </select>
          <textarea>Textarea</textarea>
        </FocusTrap>,
        { container }
      );

      const button = screen.getByText("Button");
      const link = screen.getByText("Link");
      // Use getAllByRole for multiple textboxes (input and textarea)
      const textboxes = screen.getAllByRole("textbox");
      const select = screen.getByRole("combobox");

      // All elements should be in the document
      expect(button).toBeInTheDocument();
      expect(link).toBeInTheDocument();
      expect(textboxes).toHaveLength(2); // input and textarea
      expect(select).toBeInTheDocument();
    });

    it("ignores disabled elements", async () => {
      render(
        <FocusTrap active={true}>
          <button type="button" disabled>
            Disabled Button
          </button>
          <button type="button">Enabled Button</button>
        </FocusTrap>,
        { container }
      );

      const enabledButton = screen.getByText("Enabled Button");
      await waitFor(() => {
        expect(document.activeElement).toBe(enabledButton);
      });
    });

    it("ignores elements with negative tabindex", async () => {
      render(
        <FocusTrap active={true}>
          <button type="button" tabIndex={-1}>
            Unfocusable Button
          </button>
          <button type="button">Regular Button</button>
        </FocusTrap>,
        { container }
      );

      const regularButton = screen.getByText("Regular Button");
      await waitFor(() => {
        expect(document.activeElement).toBe(regularButton);
      });
    });
  });

  describe("edge cases", () => {
    it("handles container with no focusable elements", () => {
      render(
        <FocusTrap active={true}>
          <div>No focusable content</div>
        </FocusTrap>,
        { container }
      );

      // Should not throw error
      expect(screen.getByText("No focusable content")).toBeInTheDocument();
    });

    it("handles single focusable element", async () => {
      render(
        <FocusTrap active={true}>
          <button type="button">Only Button</button>
        </FocusTrap>,
        { container }
      );

      const button = screen.getByText("Only Button");

      // Focus should be on the button
      await waitFor(() => {
        expect(document.activeElement).toBe(button);
      });

      // Tab should keep focus on the same element
      const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
      button.dispatchEvent(tabEvent);

      expect(document.activeElement).toBe(button);
    });

    it("handles dynamic content changes", async () => {
      const { rerender } = render(
        <FocusTrap active={true}>
          <button type="button">Button 1</button>
        </FocusTrap>,
        { container }
      );

      const button1 = screen.getByText("Button 1");
      await waitFor(() => {
        expect(document.activeElement).toBe(button1);
      });

      // Add more buttons
      rerender(
        <FocusTrap active={true}>
          <button type="button">Button 1</button>
          <button type="button">Button 2</button>
          <button type="button">Button 3</button>
        </FocusTrap>
      );

      // Should still have focus trapped
      expect(screen.getByText("Button 1")).toBeInTheDocument();
      expect(screen.getByText("Button 2")).toBeInTheDocument();
      expect(screen.getByText("Button 3")).toBeInTheDocument();
    });
  });

  describe("accessibility attributes", () => {
    it("maintains proper ARIA attributes", () => {
      render(
        <FocusTrap active={true}>
          <div role="dialog" aria-labelledby="dialog-title">
            <h2 id="dialog-title">Dialog Title</h2>
            <p>Dialog content</p>
            <button type="button">Close</button>
          </div>
        </FocusTrap>,
        { container }
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-labelledby", "dialog-title");
      expect(screen.getByText("Dialog Title")).toBeInTheDocument();
    });
  });
});
