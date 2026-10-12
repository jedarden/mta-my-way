/** Browser coverage for the interactive transit map. */

import { type Page, expect, test } from "@playwright/test";

const stations = [
  {
    id: "101",
    name: "South Ferry",
    lat: 40.702,
    lon: -74.013,
    lines: ["1"],
    northStopId: "101N",
    southStopId: "101S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
  {
    id: "102",
    name: "Rector St",
    lat: 40.708,
    lon: -74.012,
    lines: ["1"],
    northStopId: "102N",
    southStopId: "102S",
    transfers: [],
    ada: false,
    borough: "manhattan",
  },
  {
    id: "725",
    name: "Times Sq-42 St",
    lat: 40.755,
    lon: -73.987,
    lines: ["1", "A"],
    northStopId: "725N",
    southStopId: "725S",
    transfers: [],
    ada: true,
    borough: "manhattan",
  },
];

const routes = [
  {
    id: "1",
    shortName: "1",
    longName: "Broadway Local",
    color: "#EE352E",
    textColor: "#FFFFFF",
    feedId: "gtfs",
    division: "A",
    stops: ["101", "102", "725"],
    isExpress: false,
  },
  {
    id: "A",
    shortName: "A",
    longName: "Eighth Avenue Express",
    color: "#0039A6",
    textColor: "#FFFFFF",
    feedId: "gtfs-ace",
    division: "B",
    stops: ["725", "102"],
    isExpress: true,
  },
];

function lineDiagram(lineId: string) {
  const stopIds = lineId === "1" ? ["101", "102", "725"] : ["725", "102"];
  return {
    routeId: lineId,
    routeColor: lineId === "1" ? "#EE352E" : "#0039A6",
    stops: stopIds.map((stopId, index) => ({
      stopId,
      stopName: stations.find((station) => station.id === stopId)?.name ?? stopId,
      isTerminal: index === 0 || index === stopIds.length - 1,
      isTransferStation: stopId === "725",
    })),
    trains:
      lineId === "1"
        ? [
            {
              tripId: "e2e-map-train",
              routeId: "1",
              direction: "N",
              lastStopId: "102",
              nextStopId: "725",
              progress: 0.5,
              destination: "Times Sq-42 St",
              isAssigned: true,
              isRerouted: false,
              isExpress: false,
            },
          ]
        : [],
    computedAt: Math.floor(Date.now() / 1000),
  };
}

async function mockMapData(
  page: Page,
  options: { stationsError?: boolean; positionsError?: boolean; stationGate?: Promise<void> } = {}
) {
  await page.route("**/api/stations", async (route) => {
    await options.stationGate;
    if (options.stationsError) {
      await route.fulfill({ status: 400, json: { message: "Map stations unavailable" } });
    } else {
      await route.fulfill({ json: stations });
    }
  });
  await page.route("**/api/routes", async (route) => {
    await route.fulfill({ json: routes });
  });
  await page.route(/\/api\/positions\/(1|A)$/, async (route) => {
    if (options.positionsError) {
      await route.fulfill({ status: 404, json: { message: "Positions unavailable" } });
    } else {
      const lineId = new URL(route.request().url()).pathname.split("/").pop() ?? "1";
      await route.fulfill({ json: lineDiagram(lineId) });
    }
  });
}

async function openMap(page: Page) {
  await mockMapData(page);
  await page.goto("/map");
  await expect(
    page.getByRole("group", { name: "Interactive transit map showing subway lines and stations" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "South Ferry" })).toBeVisible();
}

const viewport = (page: Page) =>
  page
    .getByRole("group", { name: "Interactive transit map showing subway lines and stations" })
    .locator(":scope > g");

test.describe("Transit map", () => {
  test("loads the map with labelled station, route, and train markers", async ({ page }) => {
    await openMap(page);

    await expect(page.getByRole("heading", { level: 1, name: "Transit Map" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rector St" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Times Sq-42 St (transfer station)" })
    ).toBeVisible();
    await expect(page.locator('path[aria-hidden="true"][stroke="#EE352E"]')).toBeAttached();
    await expect(page.locator('path[aria-hidden="true"][stroke="#0039A6"]')).toBeAttached();
    await expect(
      page.getByRole("button", { name: "Northbound 1 train to Times Sq-42 St" })
    ).toBeVisible();
  });

  test("shows a loading placeholder until station data arrives", async ({ page }) => {
    let releaseStations!: () => void;
    const stationGate = new Promise<void>((resolve) => {
      releaseStations = resolve;
    });
    await mockMapData(page, { stationGate });
    try {
      await page.goto("/map");
      await expect(
        page.getByRole("main", { name: "Main content" }).locator(".animate-pulse")
      ).toBeVisible();
    } finally {
      releaseStations();
    }
    await expect(page.getByRole("button", { name: "South Ferry" })).toBeVisible();
  });

  test("opens and closes the selected station details", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: "South Ferry" }).click();

    const details = page.getByRole("dialog", { name: "South Ferry" });
    await expect(details).toBeVisible();
    await expect(details.getByText("ADA Accessible")).toBeVisible();
    await expect(details.getByRole("link", { name: "View Full Station Details" })).toBeVisible();
    await details.getByRole("button", { name: "Close" }).click();
    await expect(details).toHaveCount(0);
  });

  test("opens the full station route from map details", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: "South Ferry" }).click();
    await page
      .getByRole("dialog", { name: "South Ferry" })
      .getByRole("link", { name: "View Full Station Details" })
      .click();
    await expect(page).toHaveURL(/\/station\/101$/);
  });

  test("filters route paths and clears the selected line", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: "Show line filter" }).click();

    const lineOne = page.getByRole("button", { name: "1", exact: true });
    await expect(lineOne).toHaveAttribute("aria-pressed", "false");
    await lineOne.click();
    await expect(lineOne).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Hide line filter" })).toContainText("1");
    await expect(page.locator('path[aria-hidden="true"][stroke="#EE352E"]')).toBeAttached();
    await expect(page.locator('path[aria-hidden="true"][stroke="#0039A6"]')).toHaveCount(0);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(lineOne).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator('path[aria-hidden="true"][stroke="#0039A6"]')).toBeAttached();
    await page.getByRole("button", { name: "Hide line filter" }).click();
    await expect(lineOne).toHaveCount(0);
  });

  test("selects every line from the filter panel", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: "Show line filter" }).click();
    await page.getByRole("button", { name: "All", exact: true }).click();

    await expect(page.getByRole("button", { name: "1", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("button", { name: "A", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByRole("button", { name: "Hide line filter" })).toContainText("2");
  });

  test("refresh requests new positions for each route", async ({ page }) => {
    const positionRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/api\/positions\/(1|A)$/.test(new URL(request.url()).pathname)) {
        positionRequests.push(new URL(request.url()).pathname);
      }
    });
    await openMap(page);
    await expect.poll(() => positionRequests.length).toBe(2);

    await page.getByRole("button", { name: "Refresh train positions" }).click();
    await expect.poll(() => positionRequests.length).toBe(4);
    expect(positionRequests).toEqual([
      "/api/positions/1",
      "/api/positions/A",
      "/api/positions/1",
      "/api/positions/A",
    ]);
  });

  test("keeps the static map when positions are unavailable", async ({ page }) => {
    await mockMapData(page, { positionsError: true });
    await page.goto("/map");

    await expect(page.getByRole("button", { name: "South Ferry" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Times Sq-42 St (transfer station)" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Northbound 1 train to Times Sq-42 St" })
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh train positions" })).toBeVisible();
  });

  test("shows an error panel when station data cannot load", async ({ page }) => {
    await mockMapData(page, { stationsError: true });
    await page.goto("/map");

    await expect(page.getByRole("heading", { name: "Transit Map" })).toBeVisible();
    await expect(page.getByRole("main", { name: "Main content" }).getByRole("alert")).toBeVisible();
    await expect(page.getByRole("group", { name: /Interactive transit map/ })).toHaveCount(0);
  });

  test("keeps the loaded map visible when the browser goes offline", async ({ page }) => {
    await openMap(page);
    await page.context().setOffline(true);

    await expect(page.getByText("You are offline", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "South Ferry" })).toBeVisible();
  });

  test("zooms and resets with the map controls", async ({ page }) => {
    await openMap(page);
    await expect(viewport(page)).toHaveAttribute("transform", "translate(0, 0) scale(1)");

    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(viewport(page)).toHaveAttribute("transform", "translate(0, 0) scale(1.2)");
    await page.getByRole("button", { name: "Zoom out" }).click();
    await expect(viewport(page)).toHaveAttribute("transform", "translate(0, 0) scale(1)");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Reset view" }).click();
    await expect(viewport(page)).toHaveAttribute("transform", "translate(0, 0) scale(1)");
  });

  test("pans and resets from the keyboard", async ({ page }) => {
    await openMap(page);
    await page.getByRole("main", { name: "Main content" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(viewport(page)).toHaveAttribute("transform", "translate(-50, 0) scale(1)");
    await page.keyboard.press("Home");
    await expect(viewport(page)).toHaveAttribute("transform", "translate(0, 0) scale(1)");
    await expect(page.getByText(/Arrow keys to navigate/)).toBeVisible();
  });

  test("returns home from the map header", async ({ page }) => {
    await openMap(page);
    await page.getByRole("link", { name: "Go back" }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
