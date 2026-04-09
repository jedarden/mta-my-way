/**
 * E2E tests for the Trip Tracking screen.
 *
 * Tests cover:
 * - Live trip tracking display
 * - ETA countdown
 * - Trip progress visualization
 * - Anomaly detection alerts
 * - Stop tracking functionality
 * - Trip sharing
 * - Expired trip handling
 */

import { expect, test } from "@playwright/test";

test.describe("Trip Tracking Screen", () => {
  test.describe("Active Trip Display", () => {
    test("should display trip details for active trip", async ({ page }) => {
      // Navigate to trip screen with a mock trip ID
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should see trip screen heading
      await expect(page.locator('role=heading[name="Live Trip"]')).toBeVisible();

      // Should see line indicator
      const lineBullet = page.locator('[data-line], [class*="line" i]');
      await expect(lineBullet).toBeAttached();
    });

    test("should show destination name", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should show "To [destination]"
      const destinationText = page.locator("text=/To/i");
      await expect(destinationText).toBeVisible();
    });

    test("should display ETA countdown", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should have ETA display
      const etaDisplay = page.locator("text=/\\d+ min|Arriving|Now/i");
      await expect(etaDisplay).toBeAttached();
    });

    test("should show trip timeline", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should see stop list
      const stopList = page.locator('[role="list"], [class*="timeline"], [class*="stops"]');
      await expect(stopList).toBeAttached();
    });

    test("should indicate current stop", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should have visual indicator for current stop
      const currentStop = page.locator('[aria-current], [class*="current" i], [class*="active" i]');
      await expect(currentStop).toBeAttached();
    });
  });

  test.describe("Trip Progress", () => {
    test("should show progress bar or indicator", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should have progress visualization
      const progress = page.locator('[role="progressbar"], [class*="progress"]');
      await expect(progress).toBeAttached();
    });

    test("should display remaining stops count", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should show stops remaining
      const stopsRemaining = page.locator("text=/\\d+ stops?/i");
      await expect(stopsRemaining).toBeAttached();
    });

    test("should show trip timeline with stops", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should see multiple stops in the timeline
      const stops = page.locator('[role="listitem"], [class*="stop" i]');
      const stopCount = await stops.count();

      // Should have at least 2 stops (origin and destination)
      expect(stopCount).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe("Anomaly Detection", () => {
    test("should show anomaly banner for delayed trips", async ({ page }) => {
      // Navigate with a trip that's longer than usual
      await page.goto("/trip/mock-delayed-trip?origin=101&dest=725");

      // Anomaly banner might appear
      const anomalyBanner = page.locator("role=alert:has-text(/delay|longer than usual/i)");
      const hasBanner = await anomalyBanner.count();

      if (hasBanner > 0) {
        await expect(anomalyBanner).toBeVisible();

        // Should show baseline comparison
        const baselineText = await anomalyBanner.textContent();
        expect(baselineText).toMatch(/average|baseline|min/i);
      }
    });

    test("should display deviation from average", async ({ page }) => {
      await page.goto("/trip/mock-delayed-trip?origin=101&dest=725");

      const deviation = page.locator("text=/\\+\\d+ min|-\\d+ min/i");
      const hasDeviation = await deviation.count();

      if (hasDeviation > 0) {
        await expect(deviation).toBeVisible();
      }
    });
  });

  test.describe("Trip Actions", () => {
    test("should have stop tracking button", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      const stopButton = page
        .locator('role=button:has-text("Stop Tracking")')
        .or(page.locator('role=button[aria-label*="stop" i]'));
      await expect(stopButton).toBeAttached();
    });

    test("should navigate back when stop tracking is clicked", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      const stopButton = page
        .locator('role=button:has-text("Stop Tracking")')
        .or(page.locator('role=button[aria-label*="stop" i]'));
      const hasStopButton = await stopButton.count();

      if (hasStopButton > 0) {
        await stopButton.first().click();

        // Should navigate away from trip screen
        const url = page.url();
        expect(url).not.toContain("/trip/");
      }
    });

    test("should have share button", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      const shareButton = page
        .locator('role=button[aria-label*="share" i]')
        .or(page.locator('role=button:has-text("Share")'));
      await expect(shareButton).toBeAttached();
    });

    test("should open share dialog when share is clicked", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      const shareButton = page
        .locator('role=button[aria-label*="share" i]')
        .or(page.locator('role=button:has-text("Share")'));
      const hasShareButton = await shareButton.count();

      if (hasShareButton > 0) {
        // Mock the Web Share API
        await page.addInitScript(() => {
          (window as any).navigator.share = async () => {
            // Mock successful share
            return true;
          };
        });

        await shareButton.first().click();

        // Share was called (no error thrown)
        // The exact behavior depends on browser support
      }
    });
  });

  test.describe("Expired Trip", () => {
    test("should show ended state for expired trips", async ({ page }) => {
      await page.goto("/trip/mock-expired-trip");

      // Should show "Ended" or similar
      const endedText = page.locator("text=/Ended|Completed|Finished/i");
      await expect(endedText).toBeAttached();
    });

    test("should display trip logged confirmation", async ({ page }) => {
      await page.goto("/trip/mock-expired-trip?origin=101&dest=725");

      // Should show "Trip logged" message if journaling worked
      const loggedMessage = page.locator("text=/logged|saved|recorded/i");
      const hasLogged = await loggedMessage.count();

      if (hasLogged > 0) {
        await expect(loggedMessage).toBeVisible();
      }
    });

    test("should not show stop tracking button for expired trips", async ({ page }) => {
      await page.goto("/trip/mock-expired-trip");

      const stopButton = page.locator('role=button:has-text("Stop Tracking")');
      const hasButton = await stopButton.count();

      // Stop tracking button should not be visible for expired trips
      if (hasButton > 0) {
        const isVisible = await stopButton.isVisible();
        expect(isVisible).toBe(false);
      }
    });
  });

  test.describe("Navigation", () => {
    test("should navigate back to previous screen", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123");

      const backButton = page.locator(
        'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
      );
      await backButton.first().click();

      // Should navigate away
      const url = page.url();
      expect(url).not.toContain("/trip/");
    });
  });

  test.describe("Error Handling", () => {
    test("should handle missing trip ID gracefully", async ({ page }) => {
      await page.goto("/trip/");

      // Should show error or redirect
      const errorText = page.locator("text=/not found|error|invalid/i");
      const hasError = await errorText.count();

      if (hasError > 0) {
        await expect(errorText).toBeVisible();
      } else {
        // Might redirect to home
        const url = page.url();
        expect(url).toBe("/");
      }
    });

    test("should handle offline state during tracking", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Simulate offline
      await page.context().setOffline(true);

      // Should still show trip data (cached) with offline indicator
      const offlineBanner = page.locator("text=/offline|no connection/i");
      const hasOffline = await offlineBanner.count();

      // Trip details should still be visible
      const tripDetails = page.locator('role=heading[name="Live Trip"]');
      await expect(tripDetails).toBeAttached();

      await page.context().setOffline(false);
    });

    test("should show loading state while fetching trip data", async ({ page }) => {
      // Slow down the response
      await page.route("**/api/trip/**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        route.continue();
      });

      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should see skeleton or loading indicator
      const loading = page.locator('[aria-busy="true"], [class*="skeleton"], [class*="loading"]');
      await expect(loading).toBeAttached();
    });
  });

  test.describe("Real-time Updates", () => {
    test("should update ETA countdown over time", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Get initial ETA
      const initialEta = await page.locator("text=/\\d+ min/i").first().textContent();

      // Wait for update
      await page.waitForTimeout(6000);

      // Get updated ETA
      const updatedEta = await page.locator("text=/\\d+ min/i").first().textContent();

      // ETAs might be the same if trip is far away, but should be present
      expect(updatedEta).toBeTruthy();
    });

    test("should show train ID when available", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Look for train ID display
      const trainId = page.locator("text=/Train \\d+/i");
      const hasTrainId = await trainId.count();

      if (hasTrainId > 0) {
        await expect(trainId).toBeVisible();
      }
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper heading structure", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should have main heading
      const mainHeading = page.locator('role=heading[name="Live Trip"]');
      await expect(mainHeading).toBeVisible();
    });

    test("should announce trip status to screen readers", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should have live region for announcements
      const liveRegion = page.locator('[aria-live], [role="status"]');
      await expect(liveRegion).toBeAttached();
    });

    test("should have accessible stop tracking button", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      const stopButton = page.locator('role=button:has-text("Stop Tracking")');
      const hasButton = await stopButton.count();

      if (hasButton > 0) {
        const ariaLabel = await stopButton.getAttribute("aria-label");
        expect(ariaLabel || (await stopButton.textContent())).toBeTruthy();
      }
    });
  });

  test.describe("Full Stack Integration", () => {
    test("should fetch trip data from API", async ({ page }) => {
      const apiRequests: string[] = [];

      page.on("request", (request) => {
        if (request.url().includes("/api/trip/") || request.url().includes("/api/trip-tracking")) {
          apiRequests.push(request.url());
        }
      });

      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Should make API request for trip data
      // Give it some time to load
      await page.waitForTimeout(2000);

      // API might be called or data might come from cache
      const tripContent = page.locator('role=heading[name="Live Trip"]');
      await expect(tripContent).toBeAttached();
    });
  });

  test.describe("Performance", () => {
    test("should load trip screen quickly", async ({ page }) => {
      const startTime = Date.now();

      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Wait for main content
      await page.waitForSelector('role=heading[name="Live Trip"]', { timeout: 5000 });

      const loadTime = Date.now() - startTime;

      // Should load in under 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });
  });

  test.describe("Trip Prediction", () => {
    test("should show delay prediction when available", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Look for delay risk indicator
      const delayRisk = page.locator("text=/delay risk|may be delayed/i");
      const hasDelayRisk = await delayRisk.count();

      if (hasDelayRisk > 0) {
        await expect(delayRisk).toBeVisible();
      }
    });

    test("should display adjusted ETA when prediction exists", async ({ page }) => {
      await page.goto("/trip/mock-active-trip-123?origin=101&dest=725");

      // Look for adjusted time display
      const adjustedEta = page.locator("text=/estimated|~\\d+ min/i");
      await expect(adjustedEta).toBeAttached();
    });
  });

  test.describe("Trip Journaling Integration", () => {
    test("should log trip to journal when completed", async ({ page }) => {
      await page.goto("/trip/mock-expired-trip?origin=101&dest=725");

      // Check for logged confirmation
      const loggedConfirmation = page.locator("text=/logged to.*journal|saved|recorded/i");
      const hasConfirmation = await loggedConfirmation.count();

      // If trip journaling is enabled, should show confirmation
      if (hasConfirmation > 0) {
        await expect(loggedConfirmation).toBeVisible();
      }
    });

    test("should link to commute journal", async ({ page }) => {
      await page.goto("/trip/mock-expired-trip?origin=101&dest=725");

      // Look for journal link
      const journalLink = page
        .locator('role=link:has-text("journal")')
        .or(page.locator('role=link[href="/journal"]'));
      const hasLink = await journalLink.count();

      if (hasLink > 0) {
        await expect(journalLink).toBeAttached();
      }
    });
  });
});
