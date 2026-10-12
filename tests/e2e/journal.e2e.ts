/** E2E coverage for the empty and populated commute journal. */

import { type Page, expect, test } from "@playwright/test";

const commuteId = "journal-test-commute";
const routeName = "South Ferry → Times Sq-42 St";

function trip(id: number, daysAgo: number, duration: number, source: string) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  const arrivalTime = date.getTime();
  return {
    id: `journal-test-trip-${id}`,
    date: new Date(arrivalTime).toISOString(),
    origin: { stationId: "101", stationName: "South Ferry" },
    destination: { stationId: "725", stationName: "Times Sq-42 St" },
    line: "1",
    departureTime: arrivalTime - duration * 60_000,
    arrivalTime,
    actualDurationMinutes: duration,
    scheduledDurationMinutes: 20,
    source,
  };
}

async function openJournal(
  page: Page,
  records = [trip(1, 0, 25, "tracked"), trip(2, 1, 30, "inferred"), trip(3, 2, 20, "manual")]
) {
  const stats = {
    commuteId,
    averageDurationMinutes: 25,
    medianDurationMinutes: 25,
    stdDevMinutes: 4.08,
    totalTrips: records.length,
    tripsThisWeek: 2,
    trend: 12,
    averageDelayMinutes: 5,
    maxDelayMinutes: 10,
    onTimePercentage: 33,
    records,
  };

  await page.addInitScript(
    ({ id, journalStats }) => {
      // Preserve edits on reload; each Playwright test starts in a fresh context.
      if (localStorage.getItem("mta-journal")) return;
      const favorites = JSON.parse(localStorage.getItem("mta-favorites") ?? "{}");
      localStorage.setItem(
        "mta-favorites",
        JSON.stringify({
          state: {
            ...favorites.state,
            favorites: [],
            commutes: [
              {
                id,
                name: "Work",
                origin: { stationId: "101", stationName: "South Ferry" },
                destination: { stationId: "725", stationName: "Times Sq-42 St" },
                preferredLines: ["1"],
                enableTransferSuggestions: true,
              },
            ],
            tapHistory: [],
            onboardingComplete: true,
          },
          version: 1,
        })
      );
      localStorage.setItem(
        "mta-journal",
        JSON.stringify({
          state: { stats: { [id]: journalStats }, dayOfWeekStats: {}, lastStationVisit: null },
          version: 3,
        })
      );
    },
    { id: commuteId, journalStats: stats }
  );

  await page.goto("/journal");
  await expect(page.getByRole("heading", { name: "Trip Journal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work" })).toBeVisible();
}

async function showHistory(page: Page) {
  await page.getByRole("button", { name: "Show trip history" }).click();
  await expect(page.getByRole("button", { name: "Hide trip history" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
}

async function openTripEditor(page: Page) {
  await showHistory(page);
  await page.getByRole("button").filter({ hasText: routeName }).first().click();
  await expect(
    page.getByRole("dialog", { name: /Edit trip from South Ferry to Times Sq-42 St/ })
  ).toBeVisible();
}

test.describe("Journal screen", () => {
  test("shows its heading and empty-state guidance without recorded trips", async ({ page }) => {
    await page.goto("/journal");

    await expect(page.getByRole("heading", { level: 1, name: "Trip Journal" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Commute Stats" })).toBeVisible();
    await expect(page.getByText("No trips recorded yet")).toBeVisible();
    await expect(page.getByText(/Track a commute or let the app infer trips/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Your Subway Year/ })).toHaveCount(0);
  });

  test("returns to commutes from the back button", async ({ page }) => {
    await page.goto("/journal");
    await page.getByRole("button", { name: "Back to commutes" }).click();
    await expect(page).toHaveURL(/\/commute$/);
  });

  test("shows the overall summary and commute statistics", async ({ page }) => {
    await openJournal(page);

    await expect(page.getByText("Total Trips").locator("..")).toContainText("3");
    await expect(page.getByText("Avg Duration").locator("..")).toContainText("25m");
    await expect(page.getByText("Avg Delay", { exact: true }).first().locator("..")).toContainText(
      "+5m"
    );
    await expect(page.getByText("This Week").locator("..")).toContainText("2");
    await expect(page.getByRole("heading", { name: "Work" })).toBeVisible();
    await expect(page.getByText(routeName)).toBeVisible();
    await expect(page.getByText("Median")).toBeVisible();
    await expect(page.getByText("+12%", { exact: true })).toHaveClass(/text-severe/);
  });

  test("draws the duration sparkline and average line", async ({ page }) => {
    await openJournal(page);

    const sparkline = page.locator("svg:has(line[stroke-dasharray])");
    await expect(sparkline).toBeVisible();
    await expect(sparkline.locator("polyline[points]")).toHaveCount(1);
  });

  test("expands and collapses history with dates, sources, and delays", async ({ page }) => {
    await openJournal(page);
    await showHistory(page);

    const trips = page.getByRole("button").filter({ hasText: routeName });
    await expect(trips).toHaveCount(3);
    await expect(trips.first()).toContainText("Today");
    await expect(trips.first()).toContainText("Tracked");
    await expect(trips.first()).toContainText("+5 min");
    await expect(trips.nth(1)).toContainText("Inferred");
    await expect(trips.nth(2)).toContainText("Manual");

    await page.getByRole("button", { name: "Hide trip history" }).click();
    await expect(trips).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show trip history" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("opens the trip editor and saves notes across a reload", async ({ page }) => {
    await openJournal(page);
    await openTripEditor(page);

    await page.getByRole("textbox", { name: "Notes (optional)" }).fill("Signal delay at 14th St");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Signal delay at 14th St")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Trip Journal" })).toBeVisible();
    await showHistory(page);
    await expect(page.getByText("Signal delay at 14th St")).toBeVisible();
  });

  test("confirms deletion and removes the selected trip", async ({ page }) => {
    await openJournal(page);
    await openTripEditor(page);

    await page.getByRole("button", { name: "Delete trip" }).click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button").filter({ hasText: routeName })).toHaveCount(2);
  });

  test("opens Subway Year from a populated journal", async ({ page }) => {
    await openJournal(page);
    await page.getByRole("button", { name: /Your Subway Year/ }).click();
    await expect(page).toHaveURL(/\/stats$/);
  });

  test("supports keyboard expansion of trip history", async ({ page }) => {
    await openJournal(page);
    await page.getByRole("button", { name: "Show trip history" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Hide trip history" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  test("limits a large history to the most recent 20 visible trips", async ({ page }) => {
    const records = Array.from({ length: 100 }, (_, index) =>
      trip(index + 1, index, 20 + (index % 5), "tracked")
    );
    await openJournal(page, records);
    await showHistory(page);

    await expect(page.getByRole("button").filter({ hasText: routeName })).toHaveCount(20);
    await expect(page.getByText("Showing last 20 of 100 trips")).toBeVisible();
  });
});
