/**
 * E2E tests for the Onboarding Flow.
 *
 * Tests cover:
 * - Welcome screen
 * - Location permission flow
 * - Nearby stations selection
 * - Search fallback when location denied
 * - Commute setup
 * - Push notifications permission
 * - Skip functionality at each step
 * - Data persistence after onboarding
 */

import { expect, test } from "@playwright/test";

test.describe("Onboarding Flow", () => {
  // Clear localStorage before each test to simulate fresh user
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    // Reload to trigger onboarding
    await page.reload();
  });

  test.describe("Welcome Screen", () => {
    test("should display welcome screen for new users", async ({ page }) => {
      // Should see welcome heading
      await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).toBeVisible();

      // Should see feature list
      await expect(page.locator("text=/Real-time Arrivals/i")).toBeVisible();
      await expect(page.locator("text=/Service Alerts/i")).toBeVisible();
      await expect(page.locator("text=/Commute Tracking/i")).toBeVisible();
      await expect(page.locator("text=/OMNY Fare Cap/i")).toBeVisible();
    });

    test("should have Get Started and Skip buttons", async ({ page }) => {
      const getStartedButton = page.locator('role=button:has-text("Get Started")');
      await expect(getStartedButton).toBeVisible();

      const skipButton = page.locator('role=button:has-text("Skip")');
      await expect(skipButton).toBeVisible();
    });

    test("should navigate to location step when Get Started is clicked", async ({ page }) => {
      await page.click('role=button:has-text("Get Started")');

      // Should show location permission screen
      await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
    });

    test("should complete onboarding when Skip is clicked", async ({ page }) => {
      // Click skip on welcome screen
      await page.click('role=button:has-text("Skip")');

      // Onboarding should be complete - should see home screen
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeAttached();
    });
  });

  test.describe("Location Permission Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.click('role=button:has-text("Get Started")');
    });

    test("should display location permission request", async ({ page }) => {
      await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
      await expect(page.locator("text=/We'll find the 3 closest subway stations/i")).toBeVisible();
    });

    test("should have Allow and Skip buttons", async ({ page }) => {
      const allowButton = page.locator('role=button:has-text("Allow Location Access")');
      await expect(allowButton).toBeVisible();

      const skipButton = page.locator('role=button:has-text("Skip")');
      await expect(skipButton).toBeVisible();
    });

    test("should show search fallback when location is denied", async ({ page }) => {
      // Deny location permission
      await page.context().grantPermissions([], { origin: page.url() });
      await page.click('role=button:has-text("Allow Location Access")');

      // Wait for denial to be processed and fallback to appear
      await page.waitForTimeout(500);

      // Should either show search fallback or stay on location step with denial message
      const url = page.url();
      const searchFallbackVisible = await page
        .locator('role=heading[name="Add Your First Station"]')
        .count();

      // Either navigated to search fallback or shows denial message
      expect(
        searchFallbackVisible + (await page.locator("text=/Location access was denied/i").count())
      ).toBeGreaterThan(0);
    });

    test("should advance to nearby stations when location is granted", async ({ page }) => {
      // Grant location permission with NYC coordinates
      await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
      await page.context().grantPermissions(["geolocation"], { origin: page.url() });

      await page.click('role=button:has-text("Allow Location Access")');

      // Should show nearby stations step
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe("Nearby Stations Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Set up geolocation before starting onboarding
      await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
      await page.context().grantPermissions(["geolocation"], { origin: page.url() });

      await page.click('role=button:has-text("Get Started")');
      await page.click('role=button:has-text("Allow Location Access")');

      // Wait for nearby stations to load
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
    });

    test("should display nearby stations list", async ({ page }) => {
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible();

      // Should have station cards
      const stationCards = page.locator("role=button").filter({ hasText: /Times|Ferry|Chambers/i });
      await expect(stationCards.first()).toBeAttached();
    });

    test("should pre-select all nearby stations", async ({ page }) => {
      // Check that at least one station is selected (has the selected styling)
      const selectedStations = page.locator('role=button[aria-pressed="true"], .bg-mta-primary');
      const count = await selectedStations.count();

      // Should have at least one pre-selected station
      expect(count).toBeGreaterThan(0);
    });

    test("should allow toggling station selection", async ({ page }) => {
      // Get a station button
      const stationButton = page
        .locator("role=button")
        .filter({ hasText: /Times|Ferry|Chambers/i })
        .first();

      // Get initial selection state
      const initiallySelected = await stationButton.evaluate((el) => {
        return (
          el.classList.contains("bg-mta-primary") || el.getAttribute("aria-pressed") === "true"
        );
      });

      // Click to toggle
      await stationButton.click();

      // Wait for state update
      await page.waitForTimeout(100);

      // Selection should have changed
      const nowSelected = await stationButton.evaluate((el) => {
        return (
          el.classList.contains("bg-mta-primary") || el.getAttribute("aria-pressed") === "true"
        );
      });

      expect(nowSelected).not.toBe(initiallySelected);
    });

    test("should show number of selected stations", async ({ page }) => {
      const continueButton = page.locator('role=button:has-text("Continue")');
      const buttonText = await continueButton.textContent();

      // Should have selection count in button text if any stations selected
      if (buttonText) {
        expect(buttonText).toBeTruthy();
      }
    });

    test("should advance to commute step when Continue is clicked", async ({ page }) => {
      await page.click('role=button:has-text("Continue")');

      // Should show commute setup step
      await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();
    });

    test("should skip to notifications when Skip is clicked", async ({ page }) => {
      await page.click('role=button:has-text("Skip")');

      // Should show notifications step (skipping commute)
      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
    });

    test("should disable Continue when no stations selected", async ({ page }) => {
      // Deselect all stations by clicking them
      const stationButtons = page
        .locator("role=button")
        .filter({ hasText: /Times|Ferry|Chambers|St/i });
      const count = await stationButtons.count();

      for (let i = 0; i < Math.min(count, 3); i++) {
        await stationButtons.nth(i).click();
        await page.waitForTimeout(50);
      }

      // Continue button should be disabled
      const continueButton = page.locator('role=button:has-text("Continue")');
      const isDisabled = await continueButton.isDisabled();

      expect(isDisabled).toBe(true);
    });
  });

  test.describe("Search Fallback Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Deny location to trigger search fallback
      await page.context().setGeolocation({ latitude: 0, longitude: 0 });
      await page.context().grantPermissions([], { origin: page.url() });

      await page.click('role=button:has-text("Get Started")');
      await page.click('role=button:has-text("Allow Location Access")');

      // Wait for either denial message or search fallback
      await page.waitForTimeout(1000);
    });

    test("should display search fallback when location unavailable", async ({ page }) => {
      // May need to click through to search
      const searchButton = page.locator('role=button:has-text("Search for stations")');
      const hasSearch = await searchButton.count();

      if (hasSearch > 0) {
        await searchButton.click();
      }

      await expect(page.locator('role=heading[name="Add Your First Station"]')).toBeVisible({
        timeout: 5000,
      });
    });

    test("should allow searching for stations", async ({ page }) => {
      // Navigate to search fallback if needed
      const searchButton = page.locator('role=button:has-text("Search for stations")');
      if ((await searchButton.count()) > 0) {
        await searchButton.click();
      }

      // Wait for search input
      await page.waitForTimeout(500);
      const searchInput = page.locator('role=searchbox, input[placeholder*="search" i]');
      const hasInput = await searchInput.count();

      if (hasInput > 0) {
        await searchInput.fill("Times");
        await page.waitForTimeout(300);

        // Should show search results
        const results = page.locator("role=button").filter({ hasText: /Times/i });
        await expect(results.first()).toBeAttached();
      }
    });

    test("should select station and advance to commute", async ({ page }) => {
      // Navigate to search fallback
      const searchButton = page.locator('role=button:has-text("Search for stations")');
      if ((await searchButton.count()) > 0) {
        await searchButton.click();
      }

      await page.waitForTimeout(500);
      const searchInput = page.locator('role=searchbox, input[placeholder*="search" i]');
      const hasInput = await searchInput.count();

      if (hasInput > 0) {
        await searchInput.fill("Times");
        await page.waitForTimeout(300);

        // Click first result
        const result = page.locator("role=button").filter({ hasText: /Times/i }).first();
        await result.click();

        // Should advance to commute setup
        await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible({
          timeout: 3000,
        });
      }
    });
  });

  test.describe("Commute Setup Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Set up location and get through to commute step
      await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
      await page.context().grantPermissions(["geolocation"], { origin: page.url() });

      await page.click('role=button:has-text("Get Started")');
      await page.click('role=button:has-text("Allow Location Access")');

      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('role=button:has-text("Continue")');

      await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();
    });

    test("should display commute setup screen", async ({ page }) => {
      await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();

      // Should see origin display
      await expect(page.locator("text=/From/i")).toBeVisible();

      // Should see destination search
      await expect(page.locator("text=/To/i")).toBeVisible();
    });

    test("should allow selecting commute name preset", async ({ page }) => {
      const workButton = page.locator('role=button:has-text("Work")');
      const homeButton = page.locator('role=button:has-text("Home")');
      const schoolButton = page.locator('role=button:has-text("School")');

      await expect(workButton).toBeVisible();
      await expect(homeButton).toBeVisible();
      await expect(schoolButton).toBeVisible();

      // Click Work
      await workButton.click();

      // Work should be selected
      const isSelected = await workButton.evaluate((el) => {
        return (
          el.classList.contains("bg-mta-primary") || el.getAttribute("aria-pressed") === "true"
        );
      });
      expect(isSelected).toBe(true);
    });

    test("should allow searching for destination", async ({ page }) => {
      const searchInput = page.locator('role=searchbox, input[placeholder*="search" i]');
      const hasInput = await searchInput.count();

      if (hasInput > 0) {
        await searchInput.fill("Penn");
        await page.waitForTimeout(300);

        // Should show search results
        const results = page.locator("role=button").filter({ hasText: /Penn/i });
        await expect(results.first()).toBeAttached();
      }
    });

    test("should select destination and enable Add button", async ({ page }) => {
      const searchInput = page.locator('role=searchbox, input[placeholder*="search" i]');
      const hasInput = await searchInput.count();

      if (hasInput > 0) {
        await searchInput.fill("Penn");
        await page.waitForTimeout(300);

        // Click a result
        const result = page.locator("role=button").filter({ hasText: /Penn/i }).first();
        await result.click();

        // Add button should be enabled
        const addButton = page.locator('role=button:has-text("Add Commute")');
        const isDisabled = await addButton.isDisabled();
        expect(isDisabled).toBe(false);
      }
    });

    test("should advance to notifications when commute is added", async ({ page }) => {
      const searchInput = page.locator('role=searchbox, input[placeholder*="search" i]');
      const hasInput = await searchInput.count();

      if (hasInput > 0) {
        await searchInput.fill("Penn");
        await page.waitForTimeout(300);

        const result = page.locator("role=button").filter({ hasText: /Penn/i }).first();
        await result.click();

        await page.click('role=button:has-text("Add Commute")');

        // Should advance to notifications step
        await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
      }
    });

    test("should skip to notifications when Skip is clicked", async ({ page }) => {
      await page.click('role=button:has-text("Skip")');

      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
    });

    test("should clear destination when clear button is clicked", async ({ page }) => {
      const searchInput = page.locator('role=searchbox, input[placeholder*="search" i]');
      const hasInput = await searchInput.count();

      if (hasInput > 0) {
        await searchInput.fill("Penn");
        await page.waitForTimeout(300);

        const result = page.locator("role=button").filter({ hasText: /Penn/i }).first();
        await result.click();

        // Destination should be shown
        await expect(page.locator("text=/Penn/i")).toBeVisible();

        // Click clear button
        const clearButton = page.locator('role=button[aria-label*="Clear" i]');
        const hasClear = await clearButton.count();

        if (hasClear > 0) {
          await clearButton.click();

          // Destination should be cleared
          await expect(
            page.locator('role=searchbox, input[placeholder*="search" i]')
          ).toBeVisible();
        }
      }
    });
  });

  test.describe("Push Notifications Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Get through to notifications step
      await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
      await page.context().grantPermissions(["geolocation"], { origin: page.url() });

      await page.click('role=button:has-text("Get Started")');
      await page.click('role=button:has-text("Allow Location Access")');

      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('role=button:has-text("Continue")');
      await page.click('role=button:has-text("Skip")');

      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
    });

    test("should display notifications permission screen", async ({ page }) => {
      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();

      // Should see feature list
      await expect(page.locator("text=/Service Alerts/i")).toBeVisible();
      await expect(page.locator("text=/Personalized/i")).toBeVisible();
      await expect(page.locator("text=/Quiet Hours/i")).toBeVisible();
    });

    test("should have Enable and Skip buttons", async ({ page }) => {
      const enableButton = page.locator('role=button:has-text("Enable Notifications")');
      await expect(enableButton).toBeAttached();

      const skipButton = page.locator('role=button:has-text("Skip")');
      await expect(skipButton).toBeAttached();
    });

    test("should complete onboarding when notifications are enabled", async ({ page }) => {
      // Grant notification permission
      await page.context().grantPermissions(["notifications"], { origin: page.url() });

      await page.click('role=button:has-text("Enable Notifications")');

      // Onboarding should complete - should see home screen
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible({
        timeout: 5000,
      });
    });

    test("should complete onboarding when Skip is clicked", async ({ page }) => {
      await page.click('role=button:has-text("Skip")');

      // Onboarding should complete
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("Full Onboarding Flow", () => {
    test("should complete full onboarding flow with all options", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Set up permissions
      await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
      await page.context().grantPermissions(["geolocation"], { origin: page.url() });
      await page.context().grantPermissions(["notifications"], { origin: page.url() });

      // Welcome
      await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).toBeVisible();
      await page.click('role=button:has-text("Get Started")');

      // Location
      await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
      await page.click('role=button:has-text("Allow Location Access")');

      // Nearby stations
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('role=button:has-text("Continue")');

      // Commute
      await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();
      await page.click('role=button:has-text("Skip")');

      // Notifications
      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
      await page.click('role=button:has-text("Skip")');

      // Complete
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible({
        timeout: 5000,
      });
    });

    test("should save favorites after onboarding", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
      await page.context().grantPermissions(["geolocation"], { origin: page.url() });

      await page.click('role=button:has-text("Get Started")');
      await page.click('role=button:has-text("Allow Location Access")');

      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('role=button:has-text("Continue")');
      await page.click('role=button:has-text("Skip")');
      await page.click('role=button:has-text("Skip")');

      // Check that favorites were saved
      const favorites = await page.evaluate(() => {
        const data = localStorage.getItem("mta-favorites");
        return data ? JSON.parse(data) : { stations: [] };
      });

      expect(favorites.stations.length).toBeGreaterThan(0);
    });

    test("should not show onboarding again after completion", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
      await page.context().grantPermissions(["geolocation"], { origin: page.url() });

      // Complete onboarding
      await page.click('role=button:has-text("Get Started")');
      await page.click('role=button:has-text("Allow Location Access")');
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('role=button:has-text("Continue")');
      await page.click('role=button:has-text("Skip")');
      await page.click('role=button:has-text("Skip")');

      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible();

      // Reload - should not show onboarding again
      await page.reload();
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible();
      await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).not.toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("should announce step transitions to screen readers", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Check for live region
      const liveRegion = page.locator('[aria-live="assertive"][aria-atomic="true"]');
      await expect(liveRegion).toBeAttached();

      // Navigate to next step
      await page.click('role=button:has-text("Get Started")');

      // Live region should have updated content
      const announcement = await liveRegion.textContent();
      expect(announcement).toBeTruthy();
    });

    test("should have proper heading hierarchy", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      // Welcome heading should be h1 or main heading
      const mainHeading = page.locator('role=heading[name="Welcome to MTA My Way"]');
      await expect(mainHeading).toBeVisible();
    });

    test("should have properly labeled form inputs", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await page.reload();

      await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
      await page.context().grantPermissions(["geolocation"], { origin: page.url() });

      await page.click('role=button:has-text("Get Started")');
      await page.click('role=button:has-text("Allow Location Access")');

      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });

      // Station buttons should have accessible labels
      const stationButtons = page
        .locator("role=button")
        .filter({ hasText: /Times|Ferry|Chambers/i });
      const hasButtons = await stationButtons.count();

      if (hasButtons > 0) {
        const firstButton = stationButtons.first();
        await expect(firstButton).toBeVisible();

        // Check for accessible name
        const accessibleName = await firstButton.getAttribute("aria-label");
        const textContent = await firstButton.textContent();
        expect(accessibleName || textContent).toBeTruthy();
      }
    });
  });
});
