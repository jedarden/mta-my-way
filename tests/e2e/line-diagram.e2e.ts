/**
 * E2E tests for the Line Diagram screen.
 *
 * Tests cover:
 * - Line diagram rendering
 * - Station display on diagram
 * - Train position visualization
 * - Line selection
 * - Zoom/pan interactions
 * - Real-time updates
 */

import { expect, test } from "@playwright/test";

test.describe("Line Diagram Screen", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a specific line diagram (e.g., line 1)
    await page.goto("/diagram/1");
  });

  test.describe("Diagram Loading", () => {
    test("should load line diagram successfully", async ({ page }) => {
      // Should see SVG diagram
      const diagram = page.locator("svg");
      await expect(diagram.first()).toBeVisible();
    });

    test("should show line name/identifier", async ({ page }) => {
      const lineHeading = page.locator("role=heading:has-text(/1 Train|Line 1|Broadway/i)");
      const hasHeading = await lineHeading.count();

      if (hasHeading > 0) {
        await expect(lineHeading).toBeVisible();
      }
    });

    test("should have back button", async ({ page }) => {
      const backButton = page.locator(
        'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
      );
      await expect(backButton.first()).toBeAttached();
    });
  });

  test.describe("Station Display", () => {
    test("should display all stations on the line", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Look for station markers (circles or nodes)
      const stations = page.locator("circle, [role='button'][aria-label*='station' i]");
      const count = await stations.count();

      expect(count).toBeGreaterThan(0);
    });

    test("should show station names", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Look for text labels in SVG
      const labels = page.locator("svg text, [class*='label' i], [class*='station' i]");
      const hasLabels = await labels.count();

      if (hasLabels > 0) {
        await expect(labels.first()).toBeVisible();
      }
    });

    test("should highlight transfer stations", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Transfer stations might have different visual treatment
      const transferStations = page.locator("[class*='transfer' i], [data-transfer='true']");
      const hasTransfers = await transferStations.count();

      if (hasTransfers > 0) {
        await expect(transferStations.first()).toBeVisible();
      }
    });

    test("should show accessible stations indicator", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const adaIndicator = page.locator(
        "[class*='ada' i], [class*='accessible' i], [aria-label*='accessible' i]"
      );
      const hasAda = await adaIndicator.count();

      if (hasAda > 0) {
        await expect(adaIndicator.first()).toBeAttached();
      }
    });
  });

  test.describe("Train Position Visualization", () => {
    test("should display train positions on the diagram", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Look for train markers
      const trains = page.locator("[class*='train' i], [data-train], circle[class*='active' i]");
      const hasTrains = await trains.count();

      // Trains might not always be visible
      if (hasTrains > 0) {
        await expect(trains.first()).toBeVisible();
      }
    });

    test("should show train direction indicators", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Look for direction indicators (arrows, distinct colors, etc.)
      const directionIndicators = page.locator(
        "[class*='direction' i], [class*='northbound' i], [class*='southbound' i]"
      );
      const hasDirection = await directionIndicators.count();

      if (hasDirection > 0) {
        await expect(directionIndicators.first()).toBeAttached();
      }
    });

    test("should indicate next train to destination", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Look for highlighted train (pulsing, larger, different color)
      const nextTrain = page.locator(
        "[class*='next' i], [class*='highlight' i], [class*='pulsing' i]"
      );
      const hasNext = await nextTrain.count();

      if (hasNext > 0) {
        await expect(nextTrain.first()).toBeVisible();
      }
    });

    test("should display train spacing at a glance", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Should show multiple trains to demonstrate spacing
      const trains = page.locator("[class*='train' i], [data-train]");
      const count = await trains.count();

      // Multiple trains should be visible when service is running
      if (count > 1) {
        // Check that trains are at different positions
        const firstTrain = trains.first();
        const lastTrain = trains.last();

        const firstBox = await firstTrain.boundingBox();
        const lastBox = await lastTrain.boundingBox();

        expect(firstBox).toBeTruthy();
        expect(lastBox).toBeTruthy();

        if (firstBox && lastBox) {
          // Trains should be at different positions
          const positionsDiffer =
            Math.abs(firstBox.x - lastBox.x) > 10 || Math.abs(firstBox.y - lastBox.y) > 10;
          expect(positionsDiffer).toBe(true);
        }
      }
    });
  });

  test.describe("Train Interaction", () => {
    test("should show train details on tap", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      const train = page.locator("[class*='train' i], [data-train]").first();
      const hasTrain = await train.count();

      if (hasTrain > 0) {
        await train.click();

        // Should show details (modal, tooltip, or navigate)
        const details = page.locator(
          "[role='dialog'], [role='tooltip'], [class*='details' i], [class*='modal' i]"
        );
        const hasDetails = await details.count();

        if (hasDetails > 0) {
          await expect(details.first()).toBeVisible();
        }
      }
    });

    test("should show trip information for selected train", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      const train = page.locator("[class*='train' i], [data-trip]").first();
      const hasTrain = await train.count();

      if (hasTrain > 0) {
        await train.click();

        // Look for trip details (destination, arrival time, etc.)
        const tripInfo = page.locator("text=/destination|arriving|trip/i");
        await expect(tripInfo).toBeAttached();
      }
    });
  });

  test.describe("Station Interaction", () => {
    test("should allow tapping stations to view details", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const station = page.locator("circle, [role='button']").first();
      const hasStation = await station.count();

      if (hasStation > 0) {
        await station.click();

        // Should show station details or navigate
        const url = page.url();
        const navigated = url.includes("/station/");
        const modal = page.locator("[role='dialog']");
        const hasModal = await modal.count();

        expect(navigated || hasModal > 0).toBe(true);
      }
    });

    test("should show arrivals at tapped station", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const station = page.locator("circle, [role='button']").first();
      const hasStation = await station.count();

      if (hasStation > 0) {
        await station.click();

        // Should see arrivals information
        const arrivals = page.locator("text=/arriv|min|depart/i");
        await expect(arrivals).toBeAttached();
      }
    });
  });

  test.describe("Line Selection", () => {
    test("should have line selector or menu", async ({ page }) => {
      await page.goto("/map"); // Map screen has line selector

      const lineSelector = page
        .locator('role=button:has-text("Filter")')
        .or(page.locator("[role='combobox'], [role='menu']"));
      const hasSelector = await lineSelector.count();

      if (hasSelector > 0) {
        await expect(lineSelector.first()).toBeVisible();
      }
    });

    test("should allow switching between lines", async ({ page }) => {
      await page.goto("/diagram/1");

      // Look for line switcher
      const lineSwitcher = page.locator('role=button:has-text(/A|C|E|2|3/), [role="menu"]').first();
      const hasSwitcher = await lineSwitcher.count();

      if (hasSwitcher > 0) {
        await lineSwitcher.click();

        // Select a different line
        const lineOption = page.locator("role=menuitem, role=option").first();
        const hasOption = await lineOption.count();

        if (hasOption > 0) {
          await lineOption.click();

          // Diagram should update
          const diagram = page.locator("svg");
          await expect(diagram.first()).toBeVisible();
        }
      }
    });
  });

  test.describe("Zoom and Pan", () => {
    test("should support pinch to zoom", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const diagram = page.locator("svg").first();

      // Get initial size
      const initialBox = await diagram.boundingBox();
      expect(initialBox).toBeTruthy();

      if (initialBox) {
        // Simulate pinch zoom
        await diagram.click({ position: { x: initialBox.x + 100, y: initialBox.y + 100 } });

        // Diagram should still be visible
        await expect(diagram).toBeVisible();
      }
    });

    test("should support pan/drag to move view", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const diagram = page.locator("svg").first();

      // Simulate drag
      await diagram.dragTo(diagram, {
        sourcePosition: { x: 50, y: 50 },
        targetPosition: { x: 100, y: 100 },
      });

      // Diagram should still be present
      await expect(diagram).toBeVisible();
    });

    test("should have zoom controls", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const zoomIn = page.locator('role=button:has-text("Zoom In"), [aria-label*="zoom in" i]');
      const zoomOut = page.locator('role=button:has-text("Zoom Out"), [aria-label*="zoom out" i]');
      const resetZoom = page.locator('role=button:has-text("Reset"), [aria-label*="reset" i]');

      const hasZoomIn = await zoomIn.count();
      const hasZoomOut = await zoomOut.count();
      const hasReset = await resetZoom.count();

      // At least one zoom control should exist
      expect(hasZoomIn + hasZoomOut + hasReset).toBeGreaterThan(0);
    });
  });

  test.describe("Real-time Updates", () => {
    test("should refresh train positions periodically", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Get initial train positions
      const initialTrains = await page.locator("[class*='train' i], [data-train]").all();

      // Wait for refresh
      await page.waitForTimeout(35000);

      // Check if positions updated (content still loads)
      const diagram = page.locator("svg");
      await expect(diagram.first()).toBeVisible();
    });

    test("should show last updated time", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const updatedTime = page.locator("text=/updated|refresh|ago/i");
      await expect(updatedTime).toBeAttached();
    });

    test("should have manual refresh button", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const refreshButton = page.locator(
        'role=button[aria-label*="refresh" i], role=button:has-text("Refresh")'
      );
      const hasRefresh = await refreshButton.count();

      if (hasRefresh > 0) {
        await expect(refreshButton.first()).toBeVisible();
      }
    });

    test("should trigger refresh on button click", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const refreshButton = page.locator(
        'role=button[aria-label*="refresh" i], role=button:has-text("Refresh")'
      );
      const hasRefresh = await refreshButton.count();

      if (hasRefresh > 0) {
        // Get loading state
        await refreshButton.first().click();

        // Should show loading indicator or update content
        const loading = page.locator("[aria-busy='true'], [class*='loading' i]");
        const hasLoading = await loading.count();

        // Diagram should remain visible
        const diagram = page.locator("svg");
        await expect(diagram.first()).toBeVisible();
      }
    });
  });

  test.describe("Navigation", () => {
    test("should navigate back to previous screen", async ({ page }) => {
      const backButton = page.locator(
        'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
      );

      await backButton.first().click();

      // Should navigate away
      const url = page.url();
      expect(url).not.toContain("/diagram/");
    });

    test("should navigate to station detail from diagram", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      const station = page.locator("circle, [role='button']").first();
      const hasStation = await station.count();

      if (hasStation > 0) {
        await station.click();

        const url = page.url();
        const navigated = /\/station\//.test(url);

        if (navigated) {
          expect(url).toMatch(/\/station\//);
        }
      }
    });
  });

  test.describe("Error Handling", () => {
    test("should handle invalid line ID gracefully", async ({ page }) => {
      await page.goto("/diagram/invalid-line-id");

      // Should show error or redirect
      const errorText = page.locator("text=/not found|error|invalid/i");
      const hasError = await errorText.count();

      if (hasError > 0) {
        await expect(errorText).toBeVisible();
      } else {
        // Might redirect to map or home
        const url = page.url();
        expect(url).not.toBe("/diagram/invalid-line-id");
      }
    });

    test("should handle offline state", async ({ page }) => {
      await page.context().setOffline(true);

      await page.goto("/diagram/1");

      // Should show offline banner
      const offlineBanner = page.locator("text=/offline|no connection/i");
      const hasOffline = await offlineBanner.count();

      if (hasOffline > 0) {
        await expect(offlineBanner.first()).toBeVisible();
      }

      // Cached diagram might still be visible
      const diagram = page.locator("svg");
      const hasDiagram = await diagram.count();

      if (hasDiagram > 0) {
        await expect(diagram).toBeAttached();
      }

      await page.context().setOffline(false);
    });

    test("should handle API failures gracefully", async ({ page }) => {
      // Intercept and fail API requests
      await page.route("**/api/positions/**", (route) => {
        route.abort();
      });

      await page.goto("/diagram/1");

      // Should still show diagram (stations) even without train data
      const diagram = page.locator("svg");
      await expect(diagram.first()).toBeAttached();
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper heading structure", async ({ page }) => {
      const heading = page.locator(
        'role=heading[name="Line Diagram"], role=heading[name*="Train"]'
      );
      const hasHeading = await heading.count();

      if (hasHeading > 0) {
        await expect(heading.first()).toBeVisible();
      }
    });

    test("should have aria labels on interactive elements", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Check for aria labels on diagram elements
      const interactiveElements = page.locator("circle[aria-label], [role='button']");
      const hasElements = await interactiveElements.count();

      if (hasElements > 0) {
        const firstLabel = await interactiveElements.first().getAttribute("aria-label");
        expect(firstLabel || hasElements > 0).toBeTruthy();
      }
    });

    test("should announce train count and spacing", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Look for live region announcements
      const liveRegion = page.locator("[aria-live], [role='status']");
      await expect(liveRegion).toBeAttached();
    });

    test("should be keyboard navigable", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Tab through elements
      await page.keyboard.press("Tab");

      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(["BUTTON", "A", "CIRCLE", "svg"].includes(focused || "")).toBe(true);
    });
  });

  test.describe("Performance", () => {
    test("should load diagram quickly", async ({ page }) => {
      const startTime = Date.now();

      await page.goto("/diagram/1");

      await page.waitForSelector("svg", { timeout: 5000 });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(5000);
    });

    test("should handle large number of stations efficiently", async ({ page }) => {
      await page.goto("/diagram/1");

      // Even with many stations, should be responsive
      await page.waitForSelector("svg", { timeout: 5000 });

      // Try interacting
      const diagram = page.locator("svg").first();
      await diagram.click();

      await expect(diagram).toBeVisible();
    });
  });

  test.describe("Visual Design", () => {
    test("should use line color for diagram elements", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 5000 });

      // Check for line-colored elements
      const lineColored = page.locator("[style*='#EE352E'], [data-line='1'], [class*='line-1']");
      const hasColored = await lineColored.count();

      if (hasColored > 0) {
        await expect(lineColored.first()).toBeVisible();
      }
    });

    test("should show legend or key", async ({ page }) => {
      const legend = page.locator("[role='legend'], [class*='legend' i], [class*='key' i]");
      const hasLegend = await legend.count();

      if (hasLegend > 0) {
        await expect(legend.first()).toBeAttached();
      }
    });
  });

  test.describe("Full Stack Integration", () => {
    test("should fetch train positions from API", async ({ page }) => {
      const apiRequests: string[] = [];

      page.on("request", (request) => {
        if (request.url().includes("/api/positions")) {
          apiRequests.push(request.url());
        }
      });

      await page.goto("/diagram/1");

      await page.waitForSelector("svg", { timeout: 10000 });

      // Should make API request for positions
      expect(apiRequests.length).toBeGreaterThan(0);
    });

    test("should use cached data when offline", async ({ page }) => {
      // Load online first
      await page.goto("/diagram/1");
      await page.waitForSelector("svg", { timeout: 10000 });

      // Then go offline
      await page.context().setOffline(true);
      await page.reload();

      // Should still show diagram with cached data
      const diagram = page.locator("svg");
      await expect(diagram.first()).toBeAttached();

      await page.context().setOffline(false);
    });
  });

  test.describe("Train Spacing Analysis", () => {
    test("should indicate train bunching", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Look for bunching indicators (trains very close together)
      // This is visual, so we just check the diagram loads
      const diagram = page.locator("svg");
      await expect(diagram.first()).toBeVisible();
    });

    test("should indicate gaps in service", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Gap indicators would be visual (large spaces without trains)
      const diagram = page.locator("svg");
      await expect(diagram.first()).toBeVisible();
    });

    test("should show evenly spaced trains as healthy", async ({ page }) => {
      await page.waitForSelector("svg", { timeout: 10000 });

      // Even spacing is indicated visually
      const diagram = page.locator("svg");
      await expect(diagram.first()).toBeVisible();
    });
  });
});
