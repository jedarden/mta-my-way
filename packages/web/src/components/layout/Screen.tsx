import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { OfflineBanner } from "../common";
import BottomNav from "./BottomNav";
import Header from "./Header";

interface ScreenProps {
  children: ReactNode;
}

/**
 * Screen - Main layout wrapper with accessibility landmarks.
 *
 * Provides:
 *   - Skip link for keyboard navigation
 *   - Proper landmark regions (header, main, nav)
 *   - Consistent layout structure
 */
export default function Screen({ children }: ScreenProps) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to the main content area on every route change so keyboard
  // and screen-reader users land at the top of the new screen content.
  useEffect(() => {
    mainRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-full bg-background dark:bg-dark-background">
      {/* Skip link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-mta-primary focus:text-white focus:rounded-lg focus:font-medium focus:outline-none"
      >
        Skip to main content
      </a>
      <Header />
      <OfflineBanner />
      <main
        ref={mainRef}
        id="main-content"
        className="flex-1 overflow-y-auto pb-14"
        role="main"
        tabIndex={-1}
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
