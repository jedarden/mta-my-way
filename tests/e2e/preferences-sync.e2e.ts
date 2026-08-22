/**
 * Browser flow for optional cross-device preference sync.
 *
 * The OAuth provider itself is deliberately mocked here: Google/GitHub are
 * third parties, while the app-owned contract is the /auth/google redirect,
 * cookie-backed session, preference fetch/PUT, and local persistence after
 * sign-out.
 */

import { expect, test } from "@playwright/test";

const serverPreferences = {
  favorites: [
    {
      id: "server-favorite",
      stationId: "127",
      stationName: "Times Sq-42 St",
      lines: ["1", "2", "3"],
      direction: "both",
      sortOrder: 0,
      pinned: false,
    },
  ],
  commutes: [],
  settings: {
    theme: "dark",
    showUnassignedTrips: false,
    refreshInterval: 30,
    alertSeverityFilter: "delays",
    hapticFeedback: true,
    accessibleMode: false,
    quietHours: { enabled: false, startHour: 22, endHour: 7 },
  },
  pushSubscription: null,
  schemaVersion: 1,
  tapHistory: [],
  onboardingComplete: true,
};

test("OAuth redirect loads, syncs, and preserves preferences after sign-out", async ({ page }) => {
  let authenticated = false;
  const preferenceWrites: unknown[] = [];

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        authenticated
          ? {
              authenticated: true,
              profile: { userId: "oauth:google:e2e-rider", provider: "google" },
            }
          : { authenticated: false, profile: null }
      ),
    });
  });
  await page.route("**/api/auth/session/revoke", async (route) => {
    authenticated = false;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.route("**/api/preferences", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(serverPreferences),
      });
      return;
    }

    preferenceWrites.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(serverPreferences),
    });
  });
  await page.route("**/auth/google", async (route) => {
    // The real callback performs a PKCE exchange with a third party. This
    // browser test verifies our redirect and simulates its resulting session.
    await route.fulfill({ contentType: "text/html", body: "OAuth provider mock" });
  });

  await page.goto("/settings");

  const googleSignIn = page.getByRole("link", { name: "Continue with Google" });
  await expect(page.getByText("Not signed in", { exact: true })).toBeVisible();
  await expect(googleSignIn).toHaveAttribute("href", "/auth/google");
  const oauthRequest = page.waitForRequest("**/auth/google");
  await googleSignIn.click();
  await oauthRequest;
  authenticated = true;
  await page.goto("/settings");

  await expect(page.getByText("Signed in", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Last synced:/)).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const persisted = JSON.parse(localStorage.getItem("mta-favorites") || "{}");
        return persisted.state?.favorites?.[0]?.stationName;
      });
    })
    .toBe("Times Sq-42 St");

  await page.getByRole("button", { name: "Sync now" }).click();
  await expect.poll(() => preferenceWrites.length).toBeGreaterThan(0);
  expect(preferenceWrites[0]).toMatchObject({
    favorites: [{ id: "server-favorite", stationName: "Times Sq-42 St" }],
  });

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Not signed in", { exact: true })).toBeVisible();
  await page.reload();

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const persisted = JSON.parse(localStorage.getItem("mta-favorites") || "{}");
        return persisted.state?.favorites?.[0]?.stationName;
      });
    })
    .toBe("Times Sq-42 St");
});
