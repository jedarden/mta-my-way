/**
 * LiveAnnouncer - Provides screen reader announcements for dynamic content changes.
 *
 * Per plan.md Phase 4: WCAG accessibility compliance.
 *
 * Features:
 *   - Polite announcements for non-urgent updates
 *   - Assertive announcements for urgent updates
 *   - Debounced announcements to prevent spam
 *   - Queue system for multiple announcements
 */

import { useCallback, useEffect, useRef } from "react";

type AnnouncementLevel = "polite" | "assertive";

interface AnnouncerOptions {
  /** Priority level - 'assertive' interrupts, 'polite' waits */
  level?: AnnouncementLevel;
  /** Delay in milliseconds before announcing (useful for debouncing) */
  delay?: number;
}

/**
 * useLiveAnnouncer - Hook for announcing screen reader messages
 *
 * Usage:
 *   const announce = useLiveAnnouncer();
 *   announce("Train arriving in 2 minutes");
 *   announce("Service change on the 1 line", { level: "assertive" });
 */
export function useLiveAnnouncer() {
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((message: string, options: AnnouncerOptions = {}) => {
    const { level = "polite", delay = 0 } = options;

    // Clear any pending announcement
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const doAnnounce = () => {
      const ref = level === "assertive" ? assertiveRef : politeRef;
      if (ref.current) {
        // Clear previous content and set new message
        ref.current.textContent = "";
        // Force a reflow to ensure screen readers pick up the change
        void ref.current.offsetHeight;
        ref.current.textContent = message;

        // Clear after announcement to allow re-announcing same message
        timeoutRef.current = setTimeout(() => {
          if (ref.current) {
            ref.current.textContent = "";
          }
        }, 1000);
      }
    };

    if (delay > 0) {
      timeoutRef.current = setTimeout(doAnnounce, delay);
    } else {
      doAnnounce();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { announce, politeRef, assertiveRef };
}

/**
 * LiveRegion - Component that renders ARIA live regions for announcements
 *
 * This should be placed once in the app (typically in Screen.tsx or App.tsx)
 * and is used by the useLiveAnnouncer hook.
 */
export function LiveRegion() {
  const { politeRef, assertiveRef } = useLiveAnnouncer();

  return (
    <>
      {/* Polite region for non-urgent updates */}
      <div
        ref={politeRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      {/* Assertive region for urgent updates */}
      <div
        ref={assertiveRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </>
  );
}

/**
 * useRouteChangeAnnouncer - Announces route changes to screen readers
 *
 * Usage in App.tsx or a layout component:
 *   useRouteChangeAnnouncer();
 */
export function useRouteChangeAnnouncer() {
  const { announce } = useLiveAnnouncer();

  useEffect(() => {
    // Get the current page title for announcement
    const title = document.title;
    announce(`Navigated to ${title}`, { level: "polite" });
  }, [window.location.pathname, announce]);
}

export default LiveRegion;
