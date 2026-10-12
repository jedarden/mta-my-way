/** Browser coverage for the live trip route and its API-backed states. */

import { type Page, expect, test } from "@playwright/test";

const tripId = "e2e-active-trip";
const tripUrl = `/trip/${tripId}?origin=101&dest=725`;

function activeTrip() {
  const now = Math.floor(Date.now() / 1000);
  return {
    tripId,
    routeId: "1",
    direction: "N",
    destination: "Times Sq-42 St",
    isAssigned: true,
    trainId: "789",
    stops: [
      {
        stopId: "101N",
        stationId: "101",
        stationName: "South Ferry",
        arrivalTime: now - 600,
        departureTime: now - 570,
        scheduledTrack: null,
        actualTrack: null,
      },
      {
        stopId: "135N",
        stationId: "135",
        stationName: "Chambers St",
        arrivalTime: now - 60,
        departureTime: now - 30,
        scheduledTrack: null,
        actualTrack: null,
      },
      {
        stopId: "132N",
        stationId: "132",
        stationName: "14 St",
        arrivalTime: now + 240,
        departureTime: now + 270,
        scheduledTrack: null,
        actualTrack: null,
      },
      {
        stopId: "725N",
        stationId: "725",
        stationName: "Times Sq-42 St",
        arrivalTime: now + 720,
        departureTime: now + 750,
        scheduledTrack: null,
        actualTrack: null,
      },
    ],
    currentStopIndex: 1,
    updatedAt: now,
    feedAge: 5,
    progressPercent: 33,
    remainingStops: 2,
    totalStops: 4,
  };
}

function prediction(hasPredictions: boolean) {
  const now = Date.now();
  return {
    tripId,
    routeId: "1",
    direction: "N",
    destination: "Times Sq-42 St",
    progressPercent: 33,
    remainingStops: 2,
    totalStops: 4,
    baseEta: new Date(now + 12 * 60_000).toISOString(),
    adjustedEta: new Date(now + 16 * 60_000).toISOString(),
    delayRisk: "high",
    delayMinutesRange: "3-5 min",
    routeDelayProbability: 0.8,
    segments: [],
    hasPredictions,
  };
}

async function mockActiveTrip(
  page: Page,
  options: { hasPrediction?: boolean; tripGate?: Promise<void> } = {}
) {
  await page.route(`**/api/trip/${tripId}/predict`, async (route) => {
    await route.fulfill({ json: prediction(options.hasPrediction ?? true) });
  });
  await page.route(`**/api/trip/${tripId}`, async (route) => {
    await options.tripGate;
    await route.fulfill({ json: activeTrip() });
  });
}

async function openActiveTrip(page: Page) {
  await mockActiveTrip(page);
  await page.goto(tripUrl);
  await expect(page.getByRole("region", { name: "Trip progress" })).toBeVisible();
}

test.describe("Trip tracking screen", () => {
  test("loads the active trip from the trip API and shows its identity and ETA", async ({
    page,
  }) => {
    await mockActiveTrip(page);
    const tripRequest = page.waitForRequest(
      (request) => new URL(request.url()).pathname === `/api/trip/${tripId}`
    );
    await page.goto(tripUrl);

    await tripRequest;
    await expect(page.getByRole("heading", { level: 1, name: "Live Trip" })).toBeVisible();
    await expect(page.getByRole("button", { name: "1 train" })).toBeVisible();
    await expect(page.getByText("To Times Sq-42 St")).toBeVisible();
    await expect(page.getByText("Train 789")).toBeVisible();
    await expect(page.locator("main section").first().getByText("12 min")).toBeVisible();
    await expect(page.getByRole("button", { name: "Share trip progress" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop tracking this trip" })).toBeVisible();
  });

  test("shows the current stop, upcoming stop, destination, and live announcement", async ({
    page,
  }) => {
    await openActiveTrip(page);

    const progress = page.getByRole("region", { name: "Trip progress" });
    await expect(progress.getByText("South Ferry")).toBeVisible();
    await expect(progress.getByText("Chambers St", { exact: true })).toBeVisible();
    await expect(progress.getByText("Train is here")).toBeVisible();
    await expect(progress.getByText("14 St")).toBeVisible();
    await expect(progress.getByText("Times Sq-42 St")).toBeVisible();
    await expect(progress.getByLabel("Current position")).toBeVisible();
    await expect(progress.getByRole("status")).toContainText(
      "Currently at Chambers St. 2 stops remaining."
    );
  });

  test("shows prediction progress, remaining stops, and delay adjustment", async ({ page }) => {
    await openActiveTrip(page);

    await expect(page.getByRole("progressbar", { name: "Trip 33% complete" })).toHaveAttribute(
      "aria-valuenow",
      "33"
    );
    await expect(page.getByText("2 stops remaining", { exact: true })).toBeVisible();
    await expect(page.getByText("of 4 total")).toBeVisible();
    await expect(page.getByText("High delay risk")).toBeVisible();
    await expect(page.getByText("Adjusted for current conditions: 3-5 min")).toBeVisible();
    await expect(page.getByText(/16 min \(\+4 min\)/)).toBeVisible();
  });

  test("keeps the scheduled ETA and timeline when no prediction exists", async ({ page }) => {
    await mockActiveTrip(page, { hasPrediction: false });
    await page.goto(tripUrl);

    await expect(page.getByRole("region", { name: "Trip progress" })).toBeVisible();
    await expect(page.locator("main section").first().getByText("12 min")).toBeVisible();
    await expect(page.getByText("ETA to destination")).toHaveCount(0);
  });

  test("shares a URL with the trip and station context", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: ShareData) => {
          sessionStorage.setItem("e2e-shared-trip", JSON.stringify(data));
        },
      });
    });
    await openActiveTrip(page);
    await page.getByRole("button", { name: "Share trip progress" }).click();

    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("e2e-shared-trip")))
      .not.toBeNull();
    const shared = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("e2e-shared-trip") ?? "{}")
    );
    expect(shared).toMatchObject({
      title: "Live trip on 1 line",
      text: "Track my trip to Times Sq-42 St",
      url: new URL(tripUrl, page.url()).toString(),
    });
  });

  test("stop tracking returns to the previous screen", async ({ page }) => {
    await page.goto("/");
    await mockActiveTrip(page);
    await page.goto(tripUrl);
    await expect(page.getByRole("region", { name: "Trip progress" })).toBeVisible();

    await page.getByRole("button", { name: "Stop tracking this trip" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("the header back button returns to the previous screen", async ({ page }) => {
    await page.goto("/");
    await mockActiveTrip(page);
    await page.goto(tripUrl);
    await expect(page.getByRole("region", { name: "Trip progress" })).toBeVisible();

    await page.getByRole("button", { name: "Go back" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("shows a loading timeline until the trip response arrives", async ({ page }) => {
    let releaseTrip!: () => void;
    const tripGate = new Promise<void>((resolve) => {
      releaseTrip = resolve;
    });
    await mockActiveTrip(page, { tripGate });
    try {
      await page.goto(tripUrl);
      await expect(page.getByLabel("Loading trip progress")).toBeVisible();
    } finally {
      releaseTrip();
    }
    await expect(page.getByRole("region", { name: "Trip progress" })).toBeVisible();
  });

  test("shows an ended state when the trip has left the feed", async ({ page }) => {
    await page.route("**/api/trip/e2e-expired-trip", async (route) => {
      await route.fulfill({ status: 404, json: { error: "Trip not found or no longer active" } });
    });
    await page.goto("/trip/e2e-expired-trip");

    await expect(page.getByText("Ended", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Something went wrong" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Share trip progress" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Stop tracking this trip" })).toHaveCount(0);
  });

  test("redirects a trip URL with no ID to the home screen", async ({ page }) => {
    await page.goto("/trip/");
    await expect(page).toHaveURL(/\/$/);
  });

  test("keeps a loaded timeline visible when the browser goes offline", async ({ page }) => {
    await openActiveTrip(page);
    await page.context().setOffline(true);

    await expect(page.getByRole("alert").filter({ hasText: "You are offline" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Trip progress" })).toBeVisible();
    await expect(page.getByText("To Times Sq-42 St")).toBeVisible();
  });
});
