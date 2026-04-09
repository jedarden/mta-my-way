/**
 * FocusTrap - Traps focus within a component for modals and dialogs.
 *
 * Per plan.md Phase 4: WCAG accessibility compliance.
 *
 * Features:
 *   - Traps keyboard focus within a container
 *   - Returns focus to the trigger element on unmount
 *   - Supports Escape key to close
 *   - Handles focusable elements detection
 */

import { useCallback, useEffect, useRef } from "react";

interface FocusTrapProps {
  children: React.ReactNode;
  /** Whether the focus trap is active */
  active?: boolean;
  /** Element that triggered the trap (for focus restoration) */
  triggerRef?: React.RefObject<HTMLElement>;
  /** Callback when Escape is pressed */
  onEscape?: () => void;
}

/**
 * Focusable elements selector - matches all focusable HTML elements
 *
 * IMPORTANT: This selector must explicitly exclude tabindex="-1" elements.
 * The order matters - we check for tabindex attribute first, then exclude negative values.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * FocusTrap - Component that traps focus within its children
 */
export function FocusTrap({ active = true, triggerRef, onEscape, children }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Get all focusable elements within the container
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }, []);

  // Focus the first focusable element
  const focusFirstElement = useCallback(() => {
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      focusable[0]?.focus();
    }
  }, [getFocusableElements]);

  // Handle Tab key navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!active) return;

      if (e.key === "Tab") {
        const focusable = getFocusableElements();
        if (focusable.length === 0) return;

        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];
        const activeElement = document.activeElement;

        // If Shift+Tab on first element, wrap to last
        if (e.shiftKey && activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
        // If Tab on last element, wrap to first
        else if (!e.shiftKey && activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      } else if (e.key === "Escape" && onEscape) {
        onEscape();
      }
    },
    [active, getFocusableElements, onEscape]
  );

  // Activate focus trap
  useEffect(() => {
    if (!active) return;

    // Store the previously focused element to restore later
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    // Focus the first focusable element after a small delay
    const timeoutId = setTimeout(() => {
      focusFirstElement();
    }, 50);

    // Add event listener for Tab key
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("keydown", handleKeyDown, true);

      // Restore focus to the trigger element or previously active element
      const elementToRestore = triggerRef?.current || previousActiveElementRef.current;
      elementToRestore?.focus();
    };
  }, [active, focusFirstElement, handleKeyDown, triggerRef]);

  return (
    <div ref={containerRef} className="contents">
      {children}
    </div>
  );
}

/**
 * useFocusTrap - Hook version for custom focus trap implementations
 *
 * Usage:
 *   const containerRef = useFocusTrap(active);
 *   <div ref={containerRef}>...</div>
 */
export function useFocusTrap(active = true) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;

    const focusableSelector = [
      'a[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(", ");

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !containerRef.current) return;

      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      );

      if (focusable.length === 0) return;

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener("keydown", handleTab, true);

    // Focus first element
    const firstFocusable = containerRef.current?.querySelector<HTMLElement>(focusableSelector);
    firstFocusable?.focus();

    return () => {
      document.removeEventListener("keydown", handleTab, true);
    };
  }, [active]);

  return containerRef;
}

export default FocusTrap;
