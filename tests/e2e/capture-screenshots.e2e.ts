/**
 * Screenshot capture script for README documentation.
 *
 * Captures key app screens at mobile viewport for README Preview section.
 * Run with: npx playwright test capture-screenshots --project="Mobile Chrome"
 */

import { test, expect } from "@playwright/test";

/**
 * Bypass onboarding by setting localStorage state directly.
 * The favorites store persists to localStorage under "mta-favorites".
 */
async function bypassOnboarding(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const existing = JSON.parse(localStorage.getItem("mta-favorites") || "{}");
    const persisted = {
      state: {
        ...(existing.state || {}),
        onboardingComplete: true,
        favorites: [
          {
            stationId: "725",
            stationName: "Times Sq-42 St",
            lines: ["1", "2", "3", "7", "N", "Q", "R", "S"],
            direction: "both",
            addedAt: Date.now(),
          },
          {
            stationId: "127",
            stationName: "Grand Central-42 St",
            lines: ["4", "5", "6", "7"],
            direction: "both",
            addedAt: Date.now(),
          },
          {
            stationId: "631",
            stationName: "Fulton St",
            lines: ["A", "C", "J", "Z", "2", "3", "4", "5"],
            direction: "both",
            addedAt: Date.now(),
          },
        ],
        commutes: [],
        tapHistory: [],
      },
      version: existing.version ?? 1,
    };
    localStorage.setItem("mta-favorites", JSON.stringify(persisted));
  });
  // Reload to pick up the new state
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

test.describe("README Screenshots", () => {
  test.setTimeout(60_000);
  test("capture home dashboard", async ({ page }) => {
    await bypassOnboarding(page);
    // Wait for favorites to render
    await page.waitForTimeout(2000);

    // Capture home screen with favorites
    await page.screenshot({
      path: "../../docs/screenshots/home-dashboard.png",
      fullPage: false,
    });
  });

  test("capture station detail", async ({ page }) => {
    await bypassOnboarding(page);
    // Navigate to Times Square (station 725)
    await page.goto("/station/725");
    await page.waitForLoadState("domcontentloaded");

    // Wait for station detail with arrivals to load
    await page.waitForTimeout(3000);

    // Capture station detail with arrivals
    await page.screenshot({
      path: "../../docs/screenshots/station-detail.png",
      fullPage: false,
    });
  });

  test("capture commute planner", async ({ page }) => {
    await bypassOnboarding(page);
    // Navigate to commute planner
    await page.goto("/commute");
    await page.waitForLoadState("domcontentloaded");

    // Wait for commute planner UI
    await page.waitForTimeout(2000);

    // Capture commute planner screen
    await page.screenshot({
      path: "../../docs/screenshots/commute-planner.png",
      fullPage: false,
    });
  });

  test("capture interactive map", async ({ page }) => {
    await bypassOnboarding(page);
    // Navigate to map
    await page.goto("/map");
    await page.waitForLoadState("domcontentloaded");

    // Wait for map to render
    await page.waitForSelector("svg", { timeout: 10000 });
    // Wait a bit for SVG to fully render
    await page.waitForTimeout(1000);

    // Capture interactive map screen
    await page.screenshot({
      path: "../../docs/screenshots/interactive-map.png",
      fullPage: false,
    });
  });
});
