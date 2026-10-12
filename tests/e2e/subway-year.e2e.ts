/** Browser coverage for the journal-backed Subway Year screen. */
import { type Page, expect, test } from "@playwright/test";

const currentYear = new Date().getFullYear();

function trip(id: string, date: string, line: string, minutes: number) {
  const arrivalTime = Date.parse(`${date}T12:00:00Z`);
  return {
    id,
    date,
    origin: { stationId: "101", stationName: "South Ferry" },
    destination: { stationId: "725", stationName: "Times Sq-42 St" },
    line,
    departureTime: arrivalTime - minutes * 60_000,
    arrivalTime,
    actualDurationMinutes: minutes,
    source: "manual",
  };
}

const records = [
  trip("recent", new Date().toISOString().slice(0, 10), "1", 10),
  trip("year", `${currentYear}-01-15`, "1", 20),
  trip("archive", `${currentYear - 1}-12-15`, "A", 30),
];

async function seedJournal(page: Page) {
  await page.addInitScript((trips) => {
    localStorage.setItem(
      "mta-journal",
      JSON.stringify({
        state: {
          stats: {
            work: {
              commuteId: "work",
              averageDurationMinutes: 20,
              medianDurationMinutes: 20,
              stdDevMinutes: 8.16,
              totalTrips: trips.length,
              tripsThisWeek: 1,
              trend: 0,
              averageDelayMinutes: 0,
              maxDelayMinutes: 0,
              onTimePercentage: 100,
              records: trips,
            },
          },
          dayOfWeekStats: {},
          lastStationVisit: null,
        },
        version: 3,
      })
    );
  }, records);
}

async function openStats(page: Page) {
  await seedJournal(page);
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Your Subway Year", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "This Year" })).toBeVisible();
}

function card(page: Page) {
  return page.locator("main .bg-gradient-to-br");
}

function cardValue(page: Page, label: string) {
  return card(page).getByText(label, { exact: true }).locator("..").locator("p").first();
}

test.describe("Subway Year", () => {
  test.use({ serviceWorkers: "block" });

  test("shows an empty journal message and commute setup action", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("mta-journal"));
    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Your Subway Year", level: 1 })).toBeVisible();
    await expect(page.locator("main")).toContainText("No trips recorded yet");
    await expect(page.locator("main")).toContainText("Start tracking commutes");
    await expect(page.getByRole("button", { name: "Share My Subway Year" })).toHaveCount(0);
    await page.getByRole("button", { name: "Set up a commute" }).click();
    await expect(page).toHaveURL(/\/commute$/);
  });

  test("opens from the journal and returns with the back button", async ({ page }) => {
    await seedJournal(page);
    await page.goto("/journal");
    await page.getByRole("button", { name: /Your Subway Year/ }).click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(page.getByRole("heading", { name: "Your Subway Year", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Back to journal" }).click();
    await expect(page).toHaveURL(/\/journal$/);
  });

  test("shows current-year trip, time, and station aggregates", async ({ page }) => {
    await openStats(page);
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toContainText(String(currentYear));
    await expect(cardValue(page, "Trips Taken")).toHaveText("2");
    await expect(cardValue(page, "Underground")).toHaveText("30m");
    await expect(card(page).getByText("Top Station").locator("..")).toContainText("South Ferry");
    await expect(card(page).getByText("Top Line").locator("..")).toContainText("1");
    await expect(
      card(page).getByText("Stations Visited").locator("..").locator("span").last()
    ).toHaveText("2");
    await expect(
      card(page).getByText("Delay Days").locator("..").locator("span").last()
    ).toHaveText("0");
  });

  test("switches windows and recomputes trips and underground time", async ({ page }) => {
    await openStats(page);
    for (const name of ["This Month", "This Quarter", "This Year", "All Time"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "This Year" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.getByRole("button", { name: "All Time" }).click();
    await expect(page.getByRole("button", { name: "All Time" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("button", { name: "This Year" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    await expect(cardValue(page, "Trips Taken")).toHaveText("3");
    await expect(cardValue(page, "Underground")).toHaveText("1h");
    await page.getByRole("button", { name: "This Month" }).click();
    await expect(page.getByRole("button", { name: "This Month" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(cardValue(page, "Trips Taken")).toHaveText(
      new Date().getMonth() === 0 ? "2" : "1"
    );
  });

  test("shows detailed statistics and environmental equivalents", async ({ page }) => {
    await openStats(page);
    for (const name of ["Overview", "Favorites", "Reliability", "Environmental Impact"]) {
      await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
    }
    await expect(page.locator("main")).toContainText("Most-Used Station");
    await expect(page.locator("main")).toContainText("Longest Streak");
    await expect(page.locator("main")).toContainText("CO₂ Saved");
    await expect(card(page)).toContainText("worth of trees");
    await expect(card(page)).toContainText("NYC↔LA");
    await expect(card(page)).toContainText("car-free");
  });

  test("shares a PNG with the current trip total", async ({ page }) => {
    // Exercise the screen's share flow with a deterministic canvas result.
    // Browser canvas encoding is covered by the rendering library itself.
    await page.route(/\/assets\/html2canvas[^/]*\.js$/, (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default async function () { return { toBlob(callback) { callback(new Blob(["png"], { type: "image/png" })); } }; }',
      })
    );
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          (window as Window & { sharedTripSummary?: string }).sharedTripSummary = data.text;
        },
      });
    });
    await openStats(page);
    const share = page.getByRole("button", { name: "Share My Subway Year" });
    await expect(share).toBeEnabled();
    await share.click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { sharedTripSummary?: string }).sharedTripSummary)
      )
      .toContain("2 subway trips");
  });

  test("keeps journal totals after a reload", async ({ page }) => {
    await openStats(page);
    await expect(cardValue(page, "Trips Taken")).toHaveText("2");
    await page.reload();
    await expect(cardValue(page, "Trips Taken")).toHaveText("2");
  });

  test("connects the skip link to main content and supports keyboard window selection", async ({
    page,
  }) => {
    await openStats(page);
    await expect(page.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content"
    );
    await expect(page.locator("main#main-content")).toBeVisible();
    const allTime = page.getByRole("button", { name: "All Time" });
    await allTime.focus();
    await page.keyboard.press("Enter");
    await expect(allTime).toHaveAttribute("aria-pressed", "true");
    await expect(cardValue(page, "Trips Taken")).toHaveText("3");
  });
});
