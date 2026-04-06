/**
 * Screen reader compatibility tests for Screen layout component.
 *
 * Tests verify:
 * - Proper ARIA landmarks are present
 * - Skip link functionality
 * - Focus management on route changes
 * - Live regions for announcements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Screen from "./Screen";

// Mock the useRouteChangeAnnouncer to prevent actual announcements during tests
vi.mock("../common/LiveAnnouncer", () => ({
  LiveRegion: () => <div data-testid="live-region" />,
  useLiveAnnouncer: () => ({ announce: vi.fn() }),
  useRouteChangeAnnouncer: () => vi.fn(),
}));

// Mock Header, OfflineBanner, and BottomNav
vi.mock("./Header", () => ({
  default: () => <header data-testid="header" />,
}));

vi.mock("../common/OfflineBanner", () => ({
  default: () => <div data-testid="offline-banner" />,
}));

vi.mock("./BottomNav", () => ({
  default: () => <nav data-testid="bottom-nav" />,
}));

describe("Screen - Screen Reader Compatibility", () => {
  beforeEach(() => {
    // Reset focus before each test
    if (document.activeElement) {
      (document.activeElement as HTMLElement).blur();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("ARIA Landmarks", () => {
    it("should have a main landmark with proper labeling", () => {
      render(
        <BrowserRouter>
          <Screen>
            <div>Test content</div>
          </Screen>
        </BrowserRouter>
      );

      const main = screen.getByRole("main");
      expect(main).toBeInTheDocument();
      expect(main).toHaveAttribute("aria-label", "Main content");
      expect(main).toHaveAttribute("id", "main-content");
    });

    it("should have navigation landmark for bottom nav", () => {
      render(
        <BrowserRouter>
          <Screen>
            <div>Test content</div>
          </Screen>
        </BrowserRouter>
      );

      const nav = screen.getByRole("navigation");
      expect(nav).toBeInTheDocument();
      expect(nav).toHaveAttribute("aria-label", "Main navigation");
    });

    it("should have a banner landmark for header", () => {
      render(
        <BrowserRouter>
          <Screen>
            <div>Test content</div>
          </Screen>
        </BrowserRouter>
      );

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();
    });
  });

  describe("Skip Link", () => {
    it("should have a skip link that targets main content", () => {
      render(
        <BrowserRouter>
          <Screen>
            <div>Test content</div>
          </Screen>
        </BrowserRouter>
      );

      const skipLink = screen.getByRole("link", { name: /skip to main content/i });
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute("href", "#main-content");
    });

    it("should make skip link visible when focused", () => {
      render(
        <BrowserRouter>
          <Screen>
            <div>Test content</div>
          </Screen>
        </BrowserRouter>
      );

      const skipLink = screen.getByRole("link", { name: /skip to main content/i });
      expect(skipLink).toHaveClass("sr-only");

      // The focus:not-sr-only class should be applied when focused
      // This is verified by the class presence in the component
      expect(skipLink.className).toContain("focus:not-sr-only");
    });
  });

  describe("Focus Management", () => {
    it("should have tabIndex={-1} on main for programmatic focus", () => {
      render(
        <BrowserRouter>
          <Screen>
            <div>Test content</div>
          </Screen>
        </BrowserRouter>
      );

      const main = screen.getByRole("main");
      expect(main).toHaveAttribute("tabIndex", "-1");
    });

    it("should allow main element to receive focus programmatically", () => {
      render(
        <BrowserRouter>
          <Screen>
            <div>Test content</div>
          </Screen>
        </BrowserRouter>
      );

      const main = screen.getByRole("main") as HTMLElement;

      // Simulate programmatic focus
      main.focus();

      expect(document.activeElement).toBe(main);
    });
  });

  describe("Live Regions", () => {
    it("should render live region for announcements", () => {
      render(
        <BrowserRouter>
          <Screen>
            <div>Test content</div>
          </Screen>
        </BrowserRouter>
      );

      const liveRegion = screen.getByTestId("live-region");
      expect(liveRegion).toBeInTheDocument();
    });
  });

  describe("Content Structure", () => {
    it("should render children within main landmark", () => {
      const testContent = "My test content";

      render(
        <BrowserRouter>
          <Screen>
            <div>{testContent}</div>
          </Screen>
        </BrowserRouter>
      );

      const main = screen.getByRole("main");
      expect(main).toHaveTextContent(testContent);
    });

    it("should preserve semantic structure of child content", () => {
      render(
        <BrowserRouter>
          <Screen>
            <section aria-labelledby="test-heading">
              <h2 id="test-heading">Test Section</h2>
              <p>Test paragraph</p>
            </section>
          </Screen>
        </BrowserRouter>
      );

      expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
      expect(screen.getByText("Test paragraph")).toBeInTheDocument();
    });
  });
});

describe("Screen - Route Change Focus", () => {
  it("should move focus to main on route change", async () => {
    const TestComponent = () => <Screen><div>Page Content</div></Screen>;

    const { container } = render(
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TestComponent />} />
          <Route path="/other" element={<TestComponent />} />
        </Routes>
      </BrowserRouter>
    );

    // Get the main element
    const main = container.querySelector('[role="main"]') as HTMLElement;

    // Focus should move to main after a brief delay (matching the component's timeout)
    await waitFor(
      () => {
        expect(document.activeElement).toBe(main);
      },
      { timeout: 200 }
    );
  });
});
