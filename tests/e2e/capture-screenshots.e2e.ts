/**
 * Screenshot capture checks for key screens.
 *
 * Captures stay in each test's Playwright output directory so CI runs cannot
 * overwrite tracked README images or another worker's local edits.
 * To generate mobile captures, run with --project="Mobile Chrome".
 */

import { expect, test } from "@playwright/test";

/**
 * Bypass onboarding by setting localStorage state directly.
 * The favorites store persists to localStorage under "mta-favorites".
 */
async function bypassOnboarding(page: import("@playwright/test").Page) {
  const initialResponse = await page.goto("/");
  expect(initialResponse?.status(), "dashboard document should return HTTP 200").toBe(200);
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
  const dashboardResponse = await page.reload();
  expect(dashboardResponse?.status(), "reloaded dashboard should return HTTP 200").toBe(200);
  await expect(page.getByRole("heading", { name: "Your Stations" })).toBeVisible();
  await expect(page.getByText("Times Sq-42 St").first()).toBeVisible();
}

async function navigateToPage(page: import("@playwright/test").Page, path: string): Promise<void> {
  const response = await page.goto(path);
  expect(response?.status(), `${path} should return HTTP 200`).toBe(200);
}

test.describe("Screen captures", () => {
  test.setTimeout(60_000);
  test("capture home dashboard", async ({ page }, testInfo) => {
    await bypassOnboarding(page);

    // Capture home screen with favorites
    await page.screenshot({
      path: testInfo.outputPath("home-dashboard.png"),
      fullPage: false,
    });
  });

  test("capture station detail", async ({ page }, testInfo) => {
    await bypassOnboarding(page);
    // Navigate to Times Square (station 725)
    await navigateToPage(page, "/station/725");
    await expect(page.getByRole("heading", { name: "Times Sq-42 St" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Arrivals" })).toBeVisible();

    // Capture station detail with arrivals
    await page.screenshot({
      path: testInfo.outputPath("station-detail.png"),
      fullPage: false,
    });
  });

  test("capture commute planner", async ({ page }, testInfo) => {
    await bypassOnboarding(page);
    // Navigate to commute planner
    await navigateToPage(page, "/commute");
    await expect(page.getByRole("heading", { name: "Commute Presets" })).toBeVisible();

    // Capture commute planner screen
    await page.screenshot({
      path: testInfo.outputPath("commute-planner.png"),
      fullPage: false,
    });
  });

  test("capture interactive map", async ({ page }, testInfo) => {
    await bypassOnboarding(page);
    // Navigate to map
    await navigateToPage(page, "/map");

    // Wait for a station marker so the captured map includes loaded route data.
    await expect(page.locator('svg [role="button"]').first()).toBeVisible();

    // Capture interactive map screen
    await page.screenshot({
      path: testInfo.outputPath("interactive-map.png"),
      fullPage: false,
    });
  });
});
