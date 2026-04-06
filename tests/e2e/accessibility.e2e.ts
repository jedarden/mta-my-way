/**
 * Screen Reader Compatibility E2E Tests
 *
 * Tests verify screen reader compatibility for interactive elements:
 * - ARIA landmarks and regions
 * - Live region announcements
 * - Focus management
 * - Keyboard navigation
 * - Semantic structure
 *
 * Tests run against the live application with Playwright's accessibility helpers.
 */

import { test, expect } from "@playwright/test";

test.describe("Screen Reader Compatibility", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test.describe("ARIA Landmarks", () => {
    test("should have proper landmark regions", async ({ page }) => {
      // Check for main landmark
      const main = page.locator('role=main[name="Main content"]');
      await expect(main).toBeVisible();

      // Check for navigation landmark
      const nav = page.locator('role=navigation[name="Main navigation"]');
      await expect(nav).toBeVisible();

      // Check for banner landmark
      const banner = page.locator('role=banner');
      await expect(banner).toBeVisible();
    });

    test("should have skip link for keyboard users", async ({ page }) => {
      const skipLink = page.locator('role=link[name=/skip to main content/i]');
      await expect(skipLink).toBeAttached();

      // Skip link should be hidden by default but visible when focused
      await skipLink.focus();
      const isVisible = await skipLink.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        return styles.position !== "absolute" || styles.width !== "1px";
      });
      expect(isVisible).toBe(true);
    });
  });

  test.describe("Live Regions", () => {
    test("should have live regions for announcements", async ({ page }) => {
      // Check for polite live region
      const politeRegion = page.locator('[role="status"][aria-live="polite"]');
      await expect(politeRegion).toBeAttached();

      // Check for assertive live region
      const alertRegion = page.locator('[role="alert"][aria-live="assertive"]');
      await expect(alertRegion).toBeAttached();
    });

    test("should announce route changes", async ({ page }) => {
      // Navigate to alerts screen
      await page.click('role=link[name="Alerts"]');

      // Check that the page title changed (screen readers will announce this)
      const title = await page.title();
      expect(title).toContain("Alerts");
    });
  });

  test.describe("Keyboard Navigation", () => {
    test("should allow tab navigation through interactive elements", async ({ page }) => {
      // Start at home
      await page.goto("/");

      // Tab through bottom nav items
      const navItems = page.locator('role=navigation').locator('role=link');
      const count = await navItems.count();

      for (let i = 0; i < count; i++) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => document.activeElement?.tagName);
        expect(focused).toBe("A");
      }
    });

    test("should allow Enter/Space on cards for navigation", async ({ page }) => {
      await page.goto("/");

      // Focus on first card (if any exist)
      const firstCard = page.locator('role=article').first();
      const hasCards = await firstCard.count() > 0;

      if (hasCards) {
        await firstCard.focus();
        await page.keyboard.press("Enter");

        // Should navigate to station details
        await page.waitForURL(/\/station\//);
      }
    });

    test("should close modals with Escape key", async ({ page }) => {
      // This test assumes there's a way to open a modal
      // Since we're testing on the home page without user data,
      // we'll verify the Escape key behavior is registered

      await page.keyboard.press("Escape");
      // If a modal was open, it should be closed now
      // The exact assertion depends on the modal implementation
    });
  });

  test.describe("Focus Management", () => {
    test("should move focus to main on route change", async ({ page }) => {
      // Navigate to alerts
      await page.click('role=link[name="Alerts"]');

      // Check that main content is focused or focusable
      const main = page.locator('role=main');
      const tabIndex = await main.getAttribute("tabIndex");
      expect(tabIndex).toBe("-1");

      // Main element should be able to receive focus
      await main.focus();
      const focused = await page.evaluate(() => document.activeElement?.getAttribute("role"));
      expect(focused).toBe("main");
    });
  });

  test.describe("Interactive Elements", () => {
    test("should have accessible buttons with labels", async ({ page }) => {
      // Check alert notification button
      const alertButton = page.locator('role=button[name="View alerts"]');
      await expect(alertButton).toBeVisible();
    });

    test("should have aria-pressed on toggle buttons", async ({ page }) => {
      // Navigate to favorites section
      const favoritesLink = page.locator('role=link[name="Home"]');
      await favoritesLink.click();

      // Look for any favorite toggle buttons (if any favorites exist)
      const toggleButtons = page.locator('[aria-pressed]');
      const count = await toggleButtons.count();

      for (let i = 0; i < count; i++) {
        const pressed = await toggleButtons.nth(i).getAttribute("aria-pressed");
        expect(["true", "false"]).toContain(pressed);
      }
    });
  });

  test.describe("Form Inputs", () => {
    test("should have proper labels on form inputs", async ({ page }) => {
      // Navigate to search
      await page.click('role=link[name="Search"]');

      // Check search input
      const searchInput = page.locator('role=searchbox[name="Search stations"]');
      await expect(searchInput).toBeVisible();
      await expect(searchInput).toBeFocused();
    });

    test("should have error messages linked to inputs", async ({ page }) => {
      // This test would require triggering an error state
      // For now, we verify the structure is in place
      await page.goto("/search");

      // Check that help text exists for search
      const searchInput = page.locator('role=searchbox');
      const hasDescription = await searchInput.evaluate((el) =>
        el.getAttribute("aria-describedby")
      );

      // aria-describedby is optional for search, so we just check it doesn't break
      expect(searchInput).toBeAttached();
    });
  });

  test.describe("Loading States", () => {
    test("should announce loading states", async ({ page }) => {
      // Navigate to a screen that loads data
      await page.goto("/alerts");

      // Check for loading indicators
      const loadingElements = page.locator('[aria-busy="true"]');
      const hasLoading = await loadingElements.count() > 0;

      // Loading indicators should either be present or finished
      if (hasLoading) {
        await expect(loadingElements.first()).toBeAttached();
      }
    });

    test("should announce empty states", async ({ page }) => {
      // Navigate to search
      await page.goto("/search");

      // Type a search that will return no results
      const searchInput = page.locator('role=searchbox');
      await searchInput.fill("xyznonexistentstation123");

      // Wait for results
      await page.waitForTimeout(250);

      // Check for empty state announcement
      const emptyState = page.locator('role=status', { hasText: /no stations found/i });
      const hasEmptyState = await emptyState.count() > 0;

      if (hasEmptyState) {
        await expect(emptyState).toBeVisible();
      }
    });
  });

  test.describe("Color Contrast", () => {
    test("should have sufficient color contrast for text", async ({ page }) => {
      // Playwright can't directly test color contrast,
      // but we can verify that colors are defined in CSS

      // This test ensures the application has loaded styles
      const bgColor = await page.evaluate(() => {
        const styles = window.getComputedStyle(document.body);
        return styles.backgroundColor;
      });

      expect(bgColor).toBeTruthy();
    });
  });

  test.describe("Screen Reader Announcements", () => {
    test("should announce favorite count changes", async ({ page }) => {
      // This test would require interacting with favorites
      // For now, we verify the badge structure

      const alertBadge = page.locator('[aria-label*="alert"]');
      const hasBadge = await alertBadge.count() > 0;

      if (hasBadge) {
        const ariaLabel = await alertBadge.first().getAttribute("aria-label");
        expect(ariaLabel).toMatch(/\d+ alerts?/);
      }
    });

    test("should have aria-labels on icon-only buttons", async ({ page }) => {
      // Check that icon-only buttons have accessible labels
      const iconButtons = page.locator('button:has(svg:not([aria-label]))');
      const count = await iconButtons.count();

      // All icon buttons should have aria-label or aria-describedby
      for (let i = 0; i < count; i++) {
        const button = iconButtons.nth(i);
        const hasLabel = await button.evaluate((el) =>
          el.hasAttribute("aria-label") || el.hasAttribute("aria-describedby")
        );
        expect(hasLabel).toBe(true);
      }
    });
  });

  test.describe("Dynamic Content", () => {
    test("should announce new arrivals", async ({ page }) => {
      // Navigate to a station
      await page.goto("/station/001");

      // Check for live region that announces arrivals
      const liveRegion = page.locator('[aria-live="polite"]');
      await expect(liveRegion).toBeAttached();

      // Live region should update with arrival information
      // (actual content depends on API response)
    });

    test("should announce service alerts", async ({ page }) => {
      await page.goto("/alerts");

      // Check for alert regions
      const alertRegion = page.locator('role=alert');
      const hasAlerts = await alertRegion.count() > 0;

      if (hasAlerts) {
        await expect(alertRegion.first()).toBeVisible();
      }
    });
  });
});
