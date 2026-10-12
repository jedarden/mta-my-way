/** E2E coverage for the live line diagram at /line/:lineId. */
import { expect, test } from "@playwright/test";

const diagramData = {
  routeId: "1",
  routeColor: "#EE352E",
  stops: [
    { stopId: "101", stopName: "South Ferry", isTerminal: true, isTransferStation: false },
    { stopId: "102", stopName: "Rector St", isTerminal: false, isTransferStation: false },
    { stopId: "103", stopName: "Times Sq-42 St", isTerminal: true, isTransferStation: true },
  ],
  trains: [
    {
      tripId: "trip-north",
      routeId: "1",
      direction: "N",
      lastStopId: "101",
      nextStopId: "102",
      progress: 0.25,
      destination: "Times Sq-42 St",
      isAssigned: true,
      isRerouted: false,
      isExpress: false,
    },
    {
      tripId: "trip-south",
      routeId: "1",
      direction: "S",
      lastStopId: "102",
      nextStopId: "103",
      progress: 0.5,
      destination: "South Ferry",
      isAssigned: false,
      isRerouted: false,
      isExpress: false,
    },
  ],
  computedAt: 1_700_000_000,
};

test.describe("Line diagram", () => {
  test.use({ serviceWorkers: "block" });

  test.beforeEach(async ({ page }) => {
    // Live feed contents depend on when CI runs. Keep the UI checks tied to a
    // known diagram while still exercising the browser's API request path.
    await page.route("**/api/positions/1", (route) => route.fulfill({ json: diagramData }));
    await page.goto("/line/1");
  });

  test("loads the line screen and its diagram", async ({ page }) => {
    await expect(page).toHaveURL(/\/line\/1$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/1|Broadway/i);
    await expect(page.locator('main figure[role="img"]')).toBeVisible();
    await expect(page.locator('main figure[role="img"] svg')).toBeVisible();
  });

  test("renders station markers, transfer ring, labels, and line color", async ({ page }) => {
    const svg = page.locator('main figure[role="img"] svg');
    await expect(svg.locator(":scope > g")).toHaveCount(5); // 3 stations and 2 trains
    await expect(svg.locator("text")).toContainText([/South Ferry/, /Times Sq/]);
    await expect(svg.locator('line[stroke="#EE352E"]')).toHaveCount(1);
    await expect(svg.locator(":scope > g").nth(2).locator("circle")).toHaveCount(2);
  });

  test("shows direction, train count, spacing, and legend", async ({ page }) => {
    const diagram = page.locator('main figure[role="img"]');
    await expect(diagram).toHaveAttribute("aria-label", /1 line: 2 trains, evenly spaced/);
    await expect(diagram.locator('[aria-live="polite"]')).toContainText("2 trains");
    await expect(page.locator("main")).toContainText("2 trains tracking");
    await expect(page.locator("main")).toContainText("Northbound");
    await expect(page.locator("main")).toContainText("Southbound");
    await expect(page.locator("main")).toContainText("Unassigned");
    await expect(diagram.locator('g[role="button"]')).toHaveCount(2);
  });

  test("opens trip details when a train is clicked", async ({ page }) => {
    await page.locator('main figure g[role="button"][aria-label^="Northbound train"]').click();
    const details = page.getByRole("dialog", { name: "Northbound Train" });
    await expect(details).toBeVisible();
    await expect(details).toContainText("Times Sq-42 St");
    await expect(details).toContainText("Assigned");
    await expect(details).toContainText("trip-north");
    await details.getByRole("button", { name: "Close" }).click();
    await expect(details).toBeHidden();
  });

  test("opens train details with the keyboard", async ({ page }) => {
    const train = page.locator('main figure g[role="button"][aria-label^="Southbound train"]');
    await train.focus();
    await page.keyboard.press("Enter");
    const details = page.getByRole("dialog", { name: "Southbound Train" });
    await expect(details).toContainText("Unassigned");
    await page.keyboard.press("Escape");
    await expect(details).toBeHidden();
  });

  test("navigates to trip tracking from the train details", async ({ page }) => {
    await page.locator('main figure g[role="button"][aria-label^="Northbound train"]').click();
    await page.getByRole("dialog").getByRole("button", { name: "Track this train" }).click();
    await expect(page).toHaveURL(/\/trip\/trip-north$/);
  });

  test("refreshes the diagram with new API data", async ({ page }) => {
    await expect(page.locator('main figure[role="img"]')).toHaveAttribute("aria-label", /2 trains/);
    await page.route("**/api/positions/1", (route) =>
      route.fulfill({ json: { ...diagramData, trains: [] } })
    );
    await page.getByRole("button", { name: "Refresh train positions" }).click();
    await expect(page.locator('main figure[role="img"]')).toHaveAttribute(
      "aria-label",
      "1 line: no trains currently tracking"
    );
    await expect(page.locator("main")).toContainText("0 trains tracking");
  });

  test("keeps station diagram visible when the train feed fails after loading", async ({
    page,
  }) => {
    await expect(page.locator('main figure[role="img"]')).toHaveAttribute("aria-label", /2 trains/);
    // A 4xx response fails immediately; network errors and 5xx responses are
    // retried by the API client with backoff before the UI can show an error.
    await page.route("**/api/positions/1", (route) =>
      route.fulfill({ status: 400, json: { message: "Feed unavailable" } })
    );
    await page.getByRole("button", { name: "Refresh train positions" }).click();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    await expect(page.locator('main figure[role="img"]')).toBeVisible();
  });

  test("recovers when the initial feed request fails", async ({ page }) => {
    let failing = true;
    await page.route("**/api/positions/1", (route) =>
      failing
        ? route.fulfill({ status: 400, json: { message: "Feed unavailable" } })
        : route.fulfill({ json: diagramData })
    );
    await page.reload();
    await expect(page.locator("main").getByRole("alert")).toBeVisible();
    failing = false;
    await page.locator("main").getByRole("button", { name: "Try again" }).click();
    await expect(page.locator('main figure[role="img"]')).toBeVisible();
  });

  test("reports an invalid line ID", async ({ page }) => {
    await page.goto("/line/invalid-line-id");
    await expect(page.locator("main")).toContainText('Line "invalid-line-id" not found');
  });

  test("back link returns to the home screen", async ({ page }) => {
    await page.getByRole("link", { name: "Go back" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
