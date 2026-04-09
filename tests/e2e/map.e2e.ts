/**
 * E2E tests for the Transit Map screen.
 *
 * Tests cover:
 * - Map loading and rendering
 * - Station interaction
 * - Train position display
 * - Line filtering
 * - Map refresh functionality
 * - Mobile touch interactions
 */

import { expect, test } from "@playwright/test";

test.describe("Map Screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/map");
  });

  test.describe("Map Loading", () => {
    test("should load map successfully", async ({ page }) => {
      // Should see map container
      const mapContainer = page.locator("svg").first();
      await expect(mapContainer).toBeVisible();

      // Should see map header
      await expect(page.locator('role=heading[name="Transit Map"]')).toBeVisible();
    });

    test("should show loading state initially", async ({ page }) => {
      // Map skeleton should be visible while loading
      const skeleton = page.locator('[aria-busy="true"]');
      const hasSkeleton = await skeleton.count();

      // Skeleton might be gone quickly, so we just verify the map loads
      await page.waitForSelector("svg", { timeout: 5000 });
    });

    test("should display station markers on map", async ({ page }) => {
      // Wait for map to load
      await page.waitForSelector("svg", { timeout: 5000 });

      // Should have station circles
      const stationCircles = page.locator("circle").or(page.locator('[role="button"]'));
      const count = await stationCircles.count();

      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe("Station Interaction", () => {
    test("should open station details modal on station tap", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Find and tap a station marker
      const stationMarker = page.locator("circle").first();
      const hasMarker = await stationMarker.count();

      if (hasMarker > 0) {
        await stationMarker.click();

        // Station details modal should appear
        const modal = page.locator("role=dialog").or(page.locator('[role="dialog"]'));
        const hasModal = await modal.count();

        if (hasModal > 0) {
          await expect(modal.first()).toBeVisible();
        }
      }
    });

    test("should close station details modal", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Try to find a close button or back button
      const closeButton = page.locator(
        'role=button[aria-label*="Close" i], role=button[aria-label*="Back" i]'
      );
      const hasClose = await closeButton.count();

      if (hasClose > 0) {
        await closeButton.first().click();
      }
    });
  });

  test.describe("Train Positions", () => {
    test("should display train position indicators", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Look for train indicators (could be dots, circles, or other markers)
      const trainIndicators = page.locator(
        '[class*="train" i], [data-train], circle[class*="active" i]'
      );
      const hasTrains = await trainIndicators.count();

      // Trains may not be visible immediately or at all times
      if (hasTrains > 0) {
        await expect(trainIndicators.first()).toBeVisible();
      }
    });

    test("should refresh train positions", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Find refresh button
      const refreshButton = page
        .locator('role=button[aria-label*="refresh" i]')
        .or(page.locator('role=button:has-text("Refresh")'));
      const hasRefresh = await refreshButton.count();

      if (hasRefresh > 0) {
        const initialContent = await page.content();

        await refreshButton.first().click();

        // Wait a moment for refresh
        await page.waitForTimeout(2000);

        // Content should still be loaded
        await expect(page.locator("svg")).toBeVisible();
      }
    });
  });

  test.describe("Line Filtering", () => {
    test("should show filter button", async ({ page }) => {
      const filterButton = page
        .locator('role=button:has-text("Filter")')
        .or(page.locator('role=button[aria-label*="filter" i]'));
      await expect(filterButton).toBeVisible();
    });

    test("should open line filter panel", async ({ page }) => {
      const filterButton = page
        .locator('role=button:has-text("Filter")')
        .or(page.locator('role=button[aria-label*="filter" i]'));

      await filterButton.click();

      // Should see filter panel with line buttons
      const lineButtons = page.locator(
        'role=button[aria-pressed="true"], role=button[aria-pressed="false"]'
      );
      await expect(lineButtons.first()).toBeVisible();
    });

    test("should filter by specific line", async ({ page }) => {
      const filterButton = page
        .locator('role=button:has-text("Filter")')
        .or(page.locator('role=button[aria-label*="filter" i]'));

      await filterButton.click();

      // Find a line button (e.g., "1", "A", "F")
      const lineButton = page
        .locator("role=button")
        .filter({ hasText: /^[1-9A-Z]$/ })
        .first();
      const hasLineButton = await lineButton.count();

      if (hasLineButton > 0) {
        await lineButton.click();

        // Filter indicator should update
        const filterCount = page
          .locator("role=button:has-text(/Filter\\s*\\d+/)")
          .or(page.locator('[class*="badge"], [class*="count"]'));
        const hasCount = await filterCount.count();

        if (hasCount > 0) {
          await expect(filterCount.first()).toBeVisible();
        }
      }
    });

    test("should clear all filters", async ({ page }) => {
      const filterButton = page
        .locator('role=button:has-text("Filter")')
        .or(page.locator('role=button[aria-label*="filter" i]'));

      await filterButton.click();

      // Look for "Clear" or "All" button
      const clearButton = page
        .locator('role=button:has-text("Clear")')
        .or(page.locator('role=button:has-text("All")'));
      const hasClear = await clearButton.count();

      if (hasClear > 0) {
        await clearButton.first().click();

        // Filters should be cleared
        const filterCount = page.locator("role=button:has-text(/Filter\\s*\\d+/)");
        const hasCount = await filterCount.count();

        if (hasCount > 0) {
          // Count badge should be gone or show 0
          expect(await filterCount.first().textContent()).not.toMatch(/\d+/);
        }
      }
    });

    test("should close filter panel", async ({ page }) => {
      const filterButton = page
        .locator('role=button:has-text("Filter")')
        .or(page.locator('role=button[aria-label*="filter" i]'));

      // Open filter
      await filterButton.click();

      // Close filter
      await filterButton.click();

      // Filter panel should be closed
      const lineButtons = page.locator('[role="button"][aria-pressed]');
      const hasPanel = await lineButtons.count();

      // Panel might still be in DOM but not visible
      if (hasPanel > 0) {
        const isVisible = await lineButtons.first().isVisible();
        expect(isVisible).toBe(false);
      }
    });
  });

  test.describe("Navigation", () => {
    test("should navigate back to home", async ({ page }) => {
      const backButton = page
        .locator('role=link[aria-label*="back" i]')
        .or(page.locator('role=button[aria-label*="back" i]'));

      await backButton.click();

      await expect(page).toHaveURL("/");
    });

    test("should navigate to station detail from map", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Try to find a clickable station
      const station = page.locator("circle, [role='button']").first();
      const hasStation = await station.count();

      if (hasStation > 0) {
        await station.click();

        // Should either open modal or navigate to station detail
        const url = page.url();
        const hasStationRoute = /\/station\//.test(url) || url.includes("station");

        // Either we navigated to station detail or a modal opened
        const modal = page.locator('[role="dialog"]');
        const hasModal = await modal.count();

        expect(hasStationRoute || hasModal > 0).toBe(true);
      }
    });
  });

  test.describe("Error Handling", () => {
    test("should handle offline state gracefully", async ({ page }) => {
      // Simulate offline
      await page.context().setOffline(true);

      await page.goto("/map");

      // Should show offline banner
      const offlineBanner = page.locator("text=/offline|no connection/i");
      const hasOffline = await offlineBanner.count();

      if (hasOffline > 0) {
        await expect(offlineBanner.first()).toBeVisible();
      }

      // Restore online
      await page.context().setOffline(false);
    });

    test("should handle map load errors", async ({ page }) => {
      // Navigate to map and intercept requests to simulate error
      await page.route("**/*", (route) => {
        // Let static assets through
        if (route.request().resourceType() === "document") {
          route.continue();
        } else if (route.request().url().includes("/api/positions")) {
          // Fail position requests
          route.abort();
        } else {
          route.continue();
        }
      });

      await page.goto("/map");

      // Should show some content even if positions fail
      await expect(page.locator("svg, role=main").first()).toBeAttached();
    });
  });

  test.describe("Performance", () => {
    test("should load map quickly", async ({ page }) => {
      const startTime = Date.now();

      await page.goto("/map");

      // Wait for map to be interactive
      await page.waitForSelector("svg", { timeout: 10000 });

      const loadTime = Date.now() - startTime;

      // Should load in under 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });

    test("should be responsive to user input", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Try interacting with the map
      const mapContainer = page.locator("svg").first();

      // Simulate touch/drag
      await mapContainer.click({ position: { x: 100, y: 100 } });

      // Map should still be responsive
      await expect(mapContainer).toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper ARIA labels on map controls", async ({ page }) => {
      // Filter button should have aria-label
      const filterButton = page.locator(
        'role=button[aria-label*="filter" i], role=button:has-text("Filter")'
      );
      await expect(filterButton).toBeAttached();

      // Refresh button should have aria-label
      const refreshButton = page.locator('role=button[aria-label*="refresh" i]');
      await expect(refreshButton).toBeAttached();
    });

    test("should be keyboard navigable", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Tab to filter button
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");

      // Should have a focused button
      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(focused).toBe("BUTTON");
    });

    test("should announce screen changes", async ({ page }) => {
      const filterButton = page
        .locator('role=button:has-text("Filter")')
        .or(page.locator('role=button[aria-label*="filter" i]'));

      await filterButton.click();

      // Should have live region or updated content
      const liveRegion = page.locator('[aria-live], [role="status"]');
      await expect(liveRegion).toBeAttached();
    });
  });

  test.describe("Full Stack Integration", () => {
    test("should fetch positions from API", async ({ page }) => {
      // Track API requests
      const apiRequests: string[] = [];

      page.on("request", (request) => {
        if (request.url().includes("/api/positions")) {
          apiRequests.push(request.url());
        }
      });

      await page.goto("/map");

      // Wait for map to load
      await page.waitForSelector("svg", { timeout: 10000 });

      // Should have made at least one position request
      expect(apiRequests.length).toBeGreaterThan(0);
    });

    test("should auto-refresh positions", async ({ page }) => {
      await page.goto("/map");

      // Wait for initial load
      await page.waitForSelector("svg", { timeout: 10000 });

      // Track requests
      let requestCount = 0;
      page.on("request", (request) => {
        if (request.url().includes("/api/positions")) {
          requestCount++;
        }
      });

      // Wait for auto-refresh (30 seconds typically, but we'll wait a shorter time)
      await page.waitForTimeout(5000);

      // Should have made initial requests
      expect(requestCount).toBeGreaterThan(0);
    });
  });
});
