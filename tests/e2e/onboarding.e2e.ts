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
  test.beforeEach(async ({ page }) => {
    await page.context().setGeolocation({ latitude: 40.7589, longitude: -73.9851 });
    await page.context().grantPermissions(["geolocation", "notifications"]);
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    const stationsLoaded = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/stations" && response.ok()
    );
    const complexesLoaded = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/static/complexes" && response.ok()
    );
    await page.reload();
    await Promise.all([stationsLoaded, complexesLoaded]);
  });

  test.describe("Welcome Screen", () => {
    test("should display welcome screen for new users", async ({ page }) => {
      // Should see welcome heading
      await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).toBeVisible();

      // Should see feature list
      await expect(page.getByRole("heading", { name: "Real-time Arrivals" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Service Alerts" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Commute Tracking" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "OMNY Fare Cap" })).toBeVisible();
    });

    test("should have Get Started and Skip buttons", async ({ page }) => {
      const getStartedButton = page.locator('button:has-text("Get Started")');
      await expect(getStartedButton).toBeVisible();

      const skipButton = page.locator('button:has-text("Skip")');
      await expect(skipButton).toBeVisible();
    });

    test("should navigate to location step when Get Started is clicked", async ({ page }) => {
      await page.click('button:has-text("Get Started")');

      // Should show location permission screen
      await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
    });

    test("should complete onboarding when Skip is clicked", async ({ page }) => {
      // Click skip on welcome screen
      await page.click('button:has-text("Skip")');

      // Onboarding should be complete - should see home screen
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeAttached();
    });
  });

  test.describe("Location Permission Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.click('button:has-text("Get Started")');
    });

    test("should display location permission request", async ({ page }) => {
      await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
      await expect(page.locator("text=/We'll find the 3 closest subway stations/i")).toBeVisible();
    });

    test("should have Allow and Skip buttons", async ({ page }) => {
      const allowButton = page.locator('button:has-text("Allow Location Access")');
      await expect(allowButton).toBeVisible();

      const skipButton = page.locator('button:has-text("Skip")');
      await expect(skipButton).toBeVisible();
    });

    test("should show search fallback when location is denied", async ({ page }) => {
      await page.context().clearPermissions();
      await page.context().grantPermissions(["notifications"]);
      await page.reload();
      await page.getByRole("button", { name: "Get Started" }).click();
      await expect(page.getByRole("button", { name: "Search for stations" })).toBeVisible();
      await page.getByRole("button", { name: "Search for stations" }).click();
      await expect(page.getByRole("heading", { name: "Add Your First Station" })).toBeVisible();
    });

    test("should advance to nearby stations when location is granted", async ({ page }) => {
      await page.click('button:has-text("Allow Location Access")');

      // Should show nearby stations step
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
    });
  });

  test.describe("Nearby Stations Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.click('button:has-text("Get Started")');
      await page.click('button:has-text("Allow Location Access")');

      // Wait for nearby stations to load
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
    });

    test("should display nearby stations list", async ({ page }) => {
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible();

      // Should have station cards
      const stationCards = page.getByRole("button").filter({ hasText: /min walk/ });
      await expect(stationCards.first()).toBeAttached();
    });

    test("should pre-select all nearby stations", async ({ page }) => {
      // Check that at least one station is selected (has the selected styling)
      const stationCards = page.getByRole("button").filter({ hasText: /min walk/ });
      expect(await stationCards.count()).toBeGreaterThan(0);
      await expect(stationCards.first()).toHaveClass(/bg-mta-primary/);
    });

    test("should allow toggling station selection", async ({ page }) => {
      // Get a station button
      const stationButton = page
        .getByRole("button")
        .filter({ hasText: /min walk/ })
        .first();
      await expect(stationButton).toHaveClass(/bg-mta-primary/);

      // Click to toggle
      await stationButton.click();

      await expect(stationButton).not.toHaveClass(/bg-mta-primary/);
    });

    test("should show number of selected stations", async ({ page }) => {
      const continueButton = page.locator('button:has-text("Continue")');
      await expect(continueButton).toHaveText(/Continue \(\d+ selected\)/);
    });

    test("should advance to commute step when Continue is clicked", async ({ page }) => {
      await page.click('button:has-text("Continue")');

      // Should show commute setup step
      await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();
    });

    test("should complete onboarding when Skip is clicked", async ({ page }) => {
      await page.click('button:has-text("Skip")');
      await expect(page.getByRole("heading", { name: "Your Stations" })).toBeVisible();
    });

    test("should disable Continue when no stations selected", async ({ page }) => {
      // Deselect all stations by clicking them
      const stationButtons = page.getByRole("button").filter({ hasText: /min walk/ });
      const count = await stationButtons.count();

      for (let i = 0; i < count; i++) {
        await stationButtons.nth(i).click();
        await expect(stationButtons.nth(i)).not.toHaveClass(/bg-mta-primary/);
      }

      // Continue button should be disabled
      const continueButton = page.locator('button:has-text("Continue")');
      await expect(continueButton).toBeDisabled();
    });
  });

  test.describe("Search Fallback Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.context().clearPermissions();
      await page.context().grantPermissions(["notifications"]);
      await page.reload();
      await page.click('button:has-text("Get Started")');
      await page.getByRole("button", { name: "Search for stations" }).click();
      await expect(page.getByRole("heading", { name: "Add Your First Station" })).toBeVisible();
    });

    test("should display search fallback when location unavailable", async ({ page }) => {
      await expect(page.locator('role=heading[name="Add Your First Station"]')).toBeVisible({
        timeout: 5000,
      });
    });

    test("should allow searching for stations", async ({ page }) => {
      const searchInput = page.getByRole("searchbox", { name: "Search stations" });
      await searchInput.fill("Times");
      await expect(page.getByRole("button", { name: /Times Sq-42 St/i }).first()).toBeVisible();
    });

    test("should select station and advance to commute", async ({ page }) => {
      const searchInput = page.getByRole("searchbox", { name: "Search stations" });
      await searchInput.fill("Times");
      await page
        .getByRole("button", { name: /Times Sq-42 St/i })
        .first()
        .click();
      await expect(page.getByRole("heading", { name: "Where do you commute to?" })).toBeVisible();
    });
  });

  test.describe("Commute Setup Step", () => {
    test.beforeEach(async ({ page }) => {
      await page.click('button:has-text("Get Started")');
      await page.click('button:has-text("Allow Location Access")');

      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('button:has-text("Continue")');

      await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();
    });

    test("should display commute setup screen", async ({ page }) => {
      await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();

      // Should see origin display
      await expect(page.getByText("From", { exact: true })).toBeVisible();

      // Should see destination search
      await expect(page.getByText("To", { exact: true })).toBeVisible();
    });

    test("should allow selecting commute name preset", async ({ page }) => {
      const workButton = page.locator('button:has-text("Work")');
      const homeButton = page.locator('button:has-text("Home")');
      const schoolButton = page.locator('button:has-text("School")');

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
      const searchInput = page.getByRole("searchbox", { name: "Search stations" });
      await searchInput.fill("Penn");
      await expect(page.getByRole("button", { name: /Penn/i }).first()).toBeVisible();
    });

    test("should select destination and enable Add button", async ({ page }) => {
      await page.getByRole("searchbox", { name: "Search stations" }).fill("Penn");
      await page.getByRole("button", { name: /Penn/i }).first().click();
      await expect(page.getByRole("button", { name: "Add Commute" })).toBeEnabled();
    });

    test("should advance to notifications when commute is added", async ({ page }) => {
      await page.getByRole("searchbox", { name: "Search stations" }).fill("Penn");
      await page.getByRole("button", { name: /Penn/i }).first().click();
      await page.getByRole("button", { name: "Add Commute" }).click();
      await expect(page.getByRole("heading", { name: "Stay Informed" })).toBeVisible();
    });

    test("should skip to notifications when Skip is clicked", async ({ page }) => {
      await page.click('button:has-text("Skip")');

      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
    });

    test("should clear destination when clear button is clicked", async ({ page }) => {
      await page.getByRole("searchbox", { name: "Search stations" }).fill("Penn");
      await page.getByRole("button", { name: /Penn/i }).first().click();
      await expect(page.getByRole("button", { name: "Clear destination" })).toBeVisible();
      await page.getByRole("button", { name: "Clear destination" }).click();
      await expect(page.getByRole("searchbox", { name: "Search stations" })).toBeVisible();
    });
  });

  test.describe("Push Notifications Step", () => {
    test.beforeEach(async ({ page }) => {
      // Get through to notifications step
      await page.click('button:has-text("Get Started")');
      await page.click('button:has-text("Allow Location Access")');

      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('button:has-text("Continue")');
      await page.click('button:has-text("Skip")');

      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
    });

    test("should display notifications permission screen", async ({ page }) => {
      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();

      // Should see feature list
      await expect(page.getByRole("heading", { name: "Service Alerts" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Personalized" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Quiet Hours" })).toBeVisible();
    });

    test("should have Enable and Skip buttons", async ({ page }) => {
      const enableButton = page.locator('button:has-text("Enable Notifications")');
      if (await enableButton.count()) {
        await expect(enableButton).toBeVisible();
        await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
      } else {
        await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
      }
    });

    test("should complete onboarding for the available notification permission", async ({
      page,
    }) => {
      const enableButton = page.getByRole("button", { name: "Enable Notifications" });
      if (await enableButton.count()) {
        await enableButton.click();
      } else {
        await expect(
          page.getByText(/Notifications are blocked|Push notifications are not supported/)
        ).toBeVisible();
        await page.getByRole("button", { name: "Continue" }).click();
      }

      // Onboarding should complete - should see home screen
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible({
        timeout: 5000,
      });
    });

    test("should complete onboarding when Skip is clicked", async ({ page }) => {
      await page.getByRole("button", { name: /^(Skip for now|Continue)$/ }).click();

      // Onboarding should complete
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("Full Onboarding Flow", () => {
    test("should complete full onboarding flow with all options", async ({ page }) => {
      // Welcome
      await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).toBeVisible();
      await page.click('button:has-text("Get Started")');

      // Location
      await expect(page.locator('role=heading[name="Find nearby stations"]')).toBeVisible();
      await page.click('button:has-text("Allow Location Access")');

      // Nearby stations
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('button:has-text("Continue")');

      // Commute
      await expect(page.locator('role=heading[name="Where do you commute to?"]')).toBeVisible();
      await page.getByRole("button", { name: /Skip for now|Continue/ }).click();

      // Notifications
      await expect(page.locator('role=heading[name="Stay Informed"]')).toBeVisible();
      await page.getByRole("button", { name: /^(Skip for now|Continue)$/ }).click();

      // Complete
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible({
        timeout: 5000,
      });
    });

    test("should save favorites after onboarding", async ({ page }) => {
      await page.click('button:has-text("Get Started")');
      await page.click('button:has-text("Allow Location Access")');

      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('button:has-text("Continue")');
      await page.getByRole("button", { name: /Skip for now|Continue/ }).click();
      await page.getByRole("button", { name: /^(Skip for now|Continue)$/ }).click();

      // Check that favorites were saved
      const favorites = await page.evaluate(() => {
        const data = localStorage.getItem("mta-favorites");
        return data ? JSON.parse(data) : { state: { favorites: [] } };
      });

      expect(favorites.state.favorites.length).toBeGreaterThan(0);
    });

    test("should not show onboarding again after completion", async ({ page }) => {
      // Complete onboarding
      await page.click('button:has-text("Get Started")');
      await page.click('button:has-text("Allow Location Access")');
      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });
      await page.click('button:has-text("Continue")');
      await page.getByRole("button", { name: /Skip for now|Continue/ }).click();
      await page.getByRole("button", { name: /^(Skip for now|Continue)$/ }).click();

      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible();

      // Reload - should not show onboarding again
      await page.reload();
      await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible();
      await expect(page.locator('role=heading[name="Welcome to MTA My Way"]')).not.toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("should announce step transitions to screen readers", async ({ page }) => {
      // Check for live region
      const liveRegion = page.locator(
        '[aria-live="assertive"][aria-atomic="true"]:not([role="alert"])'
      );
      await expect(liveRegion).toBeAttached();

      // Navigate to next step
      await page.click('button:has-text("Get Started")');

      // Live region should have updated content
      await expect(liveRegion).toHaveText("Step 2 of 5: Find nearby stations");
    });

    test("should have proper heading hierarchy", async ({ page }) => {
      // Welcome heading should be h1 or main heading
      const mainHeading = page.locator('role=heading[name="Welcome to MTA My Way"]');
      await expect(mainHeading).toBeVisible();
    });

    test("should have properly labeled form inputs", async ({ page }) => {
      await page.click('button:has-text("Get Started")');
      await page.click('button:has-text("Allow Location Access")');

      await expect(page.locator('role=heading[name="Nearby Stations"]')).toBeVisible({
        timeout: 10000,
      });

      // Station buttons should have accessible labels
      const firstButton = page
        .getByRole("button")
        .filter({ hasText: /min walk/ })
        .first();
      await expect(firstButton).toBeVisible();
      expect(await firstButton.textContent()).toMatch(/min walk/);
    });
  });
});
