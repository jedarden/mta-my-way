/**
 * Screenshot capture script for README documentation.
 *
 * Captures key app screens at mobile viewport for README Preview section.
 * Run with: npx playwright test capture-screenshots --project="Mobile Chrome"
 */

import { test, expect } from "@playwright/test";

test.describe("README Screenshots", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto("/");
    // Wait for page to load
    await page.waitForLoadState("networkidle");
  });

  test("capture home dashboard", async ({ page }) => {
    // Wait for home page to load (look for common elements)
    await page.waitForTimeout(2000);

    // Capture home screen with favorites
    await page.screenshot({
      path: "../../docs/screenshots/home-dashboard.png",
      fullPage: false,
    });
  });

  test("capture station detail", async ({ page }) => {
    // Navigate directly to Times Square (station 725)
    await page.goto("/station/725");
    await page.waitForLoadState("networkidle");

    // Wait for page to stabilize and content to load
    await page.waitForTimeout(3000);

    // Capture station detail with arrivals
    await page.screenshot({
      path: "../../docs/screenshots/station-detail.png",
      fullPage: false,
    });
  });

  test("capture commute planner", async ({ page }) => {
    // Navigate to commute planner
    await page.goto("/commute");
    await page.waitForLoadState("networkidle");

    // Wait for commute planner UI
    await page.waitForTimeout(2000);

    // Capture commute planner screen
    await page.screenshot({
      path: "../../docs/screenshots/commute-planner.png",
      fullPage: false,
    });
  });

  test("capture interactive map", async ({ page }) => {
    // Navigate to map
    await page.goto("/map");
    await page.waitForLoadState("networkidle");

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
