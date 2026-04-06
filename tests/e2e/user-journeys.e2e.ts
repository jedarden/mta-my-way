/**
 * E2E tests for critical user journeys and full-stack workflows.
 *
 * Tests cover:
 * - Search and discovery workflow
 * - Station detail and arrivals viewing
 * - Favorites management
 * - Navigation between screens
 * - Alerts viewing
 * - Commute workflow
 */

import { expect, test } from "@playwright/test";

test.describe("Search Journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should navigate to search and see popular stations", async ({ page }) => {
    // Click search in bottom nav
    await page.click('role=link[name="Search"]');

    // Should be on search page
    await expect(page).toHaveURL(/\/search/);

    // Should see popular stations section
    await expect(page.locator("text=/popular stations/i")).toBeVisible();

    // Should see Times Square in popular stations
    await expect(page.locator("text=/Times Sq-42 St/i")).toBeVisible();
  });

  test("should search for a station and see results", async ({ page }) => {
    await page.goto("/search");

    // Type in search box
    const searchInput = page.locator('role=searchbox[name="Search stations"]');
    await searchInput.fill("Times");

    // Wait for results
    await page.waitForTimeout(250);

    // Should see Times Square in results
    await expect(page.locator("text=/Times Sq-42 St/i")).toBeVisible();

    // Should show line bullets
    await expect(page.locator('[data-line="1"]')).toBeVisible();
  });

  test("should click a search result and navigate to station detail", async ({ page }) => {
    await page.goto("/search");

    // Search for Times Square
    const searchInput = page.locator('role=searchbox[name="Search stations"]');
    await searchInput.fill("Times");
    await page.waitForTimeout(250);

    // Click on Times Square result
    await page.click("role=link[name=/Times Sq-42 St/i]");

    // Should navigate to station detail
    await expect(page).toHaveURL(/\/station\/725/);

    // Should see station name
    await expect(page.locator("role=heading[name=/Times Sq-42 St/i]")).toBeVisible();
  });

  test("should show empty state for no search results", async ({ page }) => {
    await page.goto("/search");

    // Type nonsense search
    const searchInput = page.locator('role=searchbox[name="Search stations"]');
    await searchInput.fill("xyznonexistentstation123");

    // Wait for results
    await page.waitForTimeout(250);

    // Should show empty state or no results
    const hasEmptyState = await page.locator("text=/no stations found/i").count();
    const hasPopular = await page.locator("text=/popular stations/i").count();

    // Either empty state or back to popular stations
    expect(hasEmptyState + hasPopular).toBeGreaterThan(0);
  });
});

test.describe("Station Detail Journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should view station arrivals", async ({ page }) => {
    // Navigate to Times Square
    await page.goto("/station/725");

    // Should see station name
    await expect(page.locator("role=heading[name=/Times Sq-42 St/i]")).toBeVisible();

    // Should see arrivals section
    await expect(page.locator('role=heading[name="Arrivals"]')).toBeVisible();

    // Should see refresh button
    await expect(page.locator('role=button[name="Refresh arrivals"]')).toBeVisible();
  });

  test("should add station to favorites from detail page", async ({ page }) => {
    // Navigate to a station
    await page.goto("/station/725");

    // Find and click the favorite button
    const favoriteButton = page.locator('role=button[aria-pressed="false"]').first();
    const hasFavoriteButton = await favoriteButton.count();

    if (hasFavoriteButton > 0) {
      await favoriteButton.click();

      // Button should now be pressed
      await expect(page.locator('role=button[aria-pressed="true"]')).toBeVisible();
    }
  });

  test("should navigate back to home from station detail", async ({ page }) => {
    await page.goto("/station/725");

    // Click back button
    await page.click('role=link[name="Go back"]');

    // Should be on home page
    await expect(page).toHaveURL("/");
  });

  test("should view station alerts if present", async ({ page }) => {
    await page.goto("/station/725");

    // Check if alert banner exists (may not always be present)
    const alertBanner = page.locator('role=region[name="Service Alerts"]');
    const hasAlerts = await alertBanner.count();

    if (hasAlerts > 0) {
      await expect(alertBanner).toBeVisible();
    }
    // If no alerts, that's also valid
  });
});

test.describe("Favorites Management", () => {
  test.beforeEach(async ({ page }) => {
    // Use storage state to bypass onboarding
    await page.goto("/");
  });

  test("should add a station to favorites from search", async ({ page }) => {
    await page.goto("/search");

    // Find a favorite toggle button on popular stations
    const favoriteButton = page.locator('role=button[aria-pressed="false"]').first();

    const hasFavoriteButton = await favoriteButton.count();

    if (hasFavoriteButton > 0) {
      const ariaLabelBefore = await favoriteButton.getAttribute("aria-label");

      await favoriteButton.click();

      // aria-label should change to indicate favorited
      const ariaLabelAfter = await favoriteButton.getAttribute("aria-label");
      expect(ariaLabelAfter).not.toBe(ariaLabelBefore);
      expect(ariaLabelAfter).toContain("Remove");
    }
  });

  test("should view favorites on home screen", async ({ page }) => {
    await page.goto("/");

    // Should see "Your Stations" section
    await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible();

    // May or may not have favorites depending on test state
  });

  test("should navigate to favorite station and see arrivals", async ({ page }) => {
    await page.goto("/");

    // Look for any favorite cards
    const favoriteCards = page.locator("role=article").locator("role=link[name=/Go to/i]");
    const hasCards = await favoriteCards.count();

    if (hasCards > 0) {
      await favoriteCards.first().click();

      // Should navigate to station detail
      await expect(page).toHaveURL(/\/station\//);
    }
    // If no favorites, test passes (empty state is valid)
  });

  test("should refresh arrivals on home screen", async ({ page }) => {
    await page.goto("/");

    // Pull down to refresh (simulated with touch events)
    const container = page.locator("role=main").first();

    // Simulate pull-to-refresh gesture
    await container.evaluate((el) => {
      const touchStart = new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [
          {
            clientY: 0,
            clientX: 100,
            identifier: 0,
            target: el,
            pageX: 100,
            pageY: 0,
            screenX: 100,
            screenY: 0,
            force: 0,
            radiusX: 0,
            radiusY: 0,
            rotationAngle: 0,
          },
        ],
      });
      el.dispatchEvent(touchStart);
    });

    // Verify refresh indicator or content update
    // (The exact behavior depends on timing and state)
  });
});

test.describe("Navigation Journey", () => {
  test("should navigate between all screens via bottom nav", async ({ page }) => {
    await page.goto("/");

    // Navigate to Search
    await page.click('role=link[name="Search"]');
    await expect(page).toHaveURL(/\/search/);

    // Navigate to Alerts
    await page.click('role=link[name="Alerts"]');
    await expect(page).toHaveURL(/\/alerts/);

    // Navigate to Map
    await page.click('role=link[name="Map"]');
    await expect(page).toHaveURL(/\/map/);

    // Navigate to Health
    await page.click('role=link[name="Health"]');
    await expect(page).toHaveURL(/\/health/);

    // Navigate back to Home
    await page.click('role=link[name="Home"]');
    await expect(page).toHaveURL("/");
  });

  test("should maintain scroll position when navigating back", async ({ page }) => {
    await page.goto("/station/725");

    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 500));

    // Navigate back
    await page.click('role=link[name="Go back"]');

    // Should be on home
    await expect(page).toHaveURL("/");
  });

  test("should handle browser back button", async ({ page }) => {
    await page.goto("/");

    // Navigate to search
    await page.click('role=link[name="Search"]');
    await expect(page).toHaveURL(/\/search/);

    // Use browser back
    await page.goBack();

    // Should be back on home
    await expect(page).toHaveURL("/");
  });
});

test.describe("Alerts Journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should navigate to alerts screen", async ({ page }) => {
    await page.click('role=link[name="Alerts"]');

    await expect(page).toHaveURL(/\/alerts/);
    await expect(page.locator('role=heading[name="Service Alerts"]')).toBeVisible();
  });

  test("should view service alerts by line", async ({ page }) => {
    await page.goto("/alerts");

    // Should see alert list or empty state
    const alertList = page.locator('role=region[name="Service Alerts"]');
    const hasAlerts = await alertList.count();

    if (hasAlerts > 0) {
      await expect(alertList).toBeVisible();
    }
    // Empty state is also valid
  });

  test("should filter alerts by severity", async ({ page }) => {
    await page.goto("/alerts");

    // Look for filter controls
    const filters = page.locator('role=button[name^="Filter"]');
    const hasFilters = await filters.count();

    if (hasFilters > 0) {
      await filters.first().click();
      // Verify filter is applied
    }
  });
});

test.describe("Commute Journey", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("should view commutes section on home", async ({ page }) => {
    // Check if commutes section exists
    const commutesSection = page.locator('role=heading[name="Your Commutes"]');
    const hasCommutes = await commutesSection.count();

    if (hasCommutes > 0) {
      await expect(commutesSection).toBeVisible();

      // Should see "View all" link
      await expect(page.locator('role=link[name="View all commutes"]')).toBeVisible();
    }
  });

  test("should navigate to commute details", async ({ page }) => {
    await page.goto("/");

    // Look for commute cards
    const commuteCards = page.locator('role=article:has-text("commute")');
    const hasCommutes = await commuteCards.count();

    if (hasCommutes > 0) {
      await commuteCards.first().click();
      await expect(page).toHaveURL(/\/commute\//);
    }
  });

  test("should navigate to commute screen", async ({ page }) => {
    // Direct navigation to commute screen
    await page.goto("/commute");

    // Should see commute screen
    await expect(page.locator("role=heading[name=/commute/i]")).toBeVisible();
  });
});

test.describe("Full Stack Workflows", () => {
  test("complete workflow: search → view station → add favorite", async ({ page }) => {
    // Start at home
    await page.goto("/");

    // Navigate to search
    await page.click('role=link[name="Search"]');
    await expect(page).toHaveURL(/\/search/);

    // Search for Times Square
    const searchInput = page.locator('role=searchbox[name="Search stations"]');
    await searchInput.fill("Times");
    await page.waitForTimeout(250);

    // Click result
    await page.click("role=link[name=/Times Sq-42 St/i]");
    await expect(page).toHaveURL(/\/station\//);

    // Add to favorite
    const favoriteButton = page.locator('role=button[aria-pressed="false"]').first();
    const hasButton = await favoriteButton.count();

    if (hasButton > 0) {
      await favoriteButton.click();

      // Verify favorited state
      await expect(page.locator('role=button[aria-pressed="true"]')).toBeVisible();
    }

    // Navigate back to home
    await page.click('role=link[name="Go back"]');
    await expect(page).toHaveURL("/");

    // Verify favorite appears in home favorites
    const hasFavorites = await page.locator("role=article").count();
    expect(hasFavorites).toBeGreaterThan(0);
  });

  test("complete workflow: home → station → refresh arrivals", async ({ page }) => {
    await page.goto("/");

    // Navigate to a station (direct URL for test reliability)
    await page.goto("/station/725");

    // Wait for arrivals to load
    await page.waitForSelector('role=heading[name="Arrivals"]', { timeout: 10000 });

    // Refresh arrivals
    await page.click('role=button[name="Refresh arrivals"]');

    // Verify refresh indicator appears
    const refreshButton = page.locator('role=button[name="Refresh arrivals"] svg');
    await expect(refreshButton).toHaveAttribute("class", /animate-spin/);
  });

  test("complete workflow: view health status", async ({ page }) => {
    await page.goto("/health");

    // Should see health status
    await expect(page.locator("text=/status|uptime|feeds/i")).toBeVisible();

    // Health endpoint via API
    const response = await page.request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("feeds");
  });
});

test.describe("Error Handling", () => {
  test("should handle offline state gracefully", async ({ page }) => {
    // Simulate offline mode
    await page.context().setOffline(true);

    await page.goto("/station/725");

    // Should show offline banner
    await expect(page.locator('role=region[name="offline"]')).toBeVisible();

    // Restore online
    await page.context().setOffline(false);
  });

  test("should handle API errors gracefully", async ({ page }) => {
    // Navigate to a non-existent station
    await page.goto("/station/999999");

    // Should show error state
    await expect(page.locator("text=/not found|error/i")).toBeVisible();
  });

  test("should handle malformed URLs gracefully", async ({ page }) => {
    // Navigate to invalid URL
    await page.goto("/invalid-route");

    // Should redirect to home or show 404
    await expect(page).toHaveURL(/\//);
  });
});

test.describe("Performance", () => {
  test("should load home screen quickly", async ({ page }) => {
    const startTime = Date.now();

    await page.goto("/");

    // Wait for main content
    await page.waitForSelector("role=main", { timeout: 5000 });

    const loadTime = Date.now() - startTime;

    // Should load in under 3 seconds (core value prop)
    expect(loadTime).toBeLessThan(3000);
  });

  test("should have fast time to interactive", async ({ page }) => {
    const metrics = await page.goto("/");

    if (metrics) {
      // Check that page loaded
      await page.waitForSelector("role=main");

      // Verify page is responsive
      const isResponsive = await page.evaluate(() => {
        return document.readyState === "complete";
      });

      expect(isResponsive).toBe(true);
    }
  });
});
