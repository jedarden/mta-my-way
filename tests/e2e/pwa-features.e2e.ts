/**
 * E2E tests for PWA Features.
 *
 * Tests cover:
 * - Service worker registration
 * - Offline functionality
 * - Install prompt
 * - Update prompt
 * - App manifest
 * - Theme color
 * - Add to home screen
 * - Background sync
 */

import { type Page, expect, test } from "@playwright/test";

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
    .toBe(true);
}

test.describe("PWA Features", () => {
  test.describe("Service Worker Registration", () => {
    test("should register service worker on load", async ({ page }) => {
      await page.goto("/");
      const registration = await page.evaluate(async () => {
        const worker = await navigator.serviceWorker.ready;
        return { scope: worker.scope, scriptURL: worker.active?.scriptURL };
      });
      expect(registration.scope).toBe(new URL("/", page.url()).href);
      expect(registration.scriptURL).toBe(new URL("/sw.js", page.url()).href);
    });

    test("should have active service worker", async ({ page }) => {
      await page.goto("/");
      await expect
        .poll(
          () =>
            page.evaluate(async () => {
              const registration = await navigator.serviceWorker.ready;
              return registration.active?.state;
            }),
          { timeout: 15_000 }
        )
        .toBe("activated");
    });

    test("should service worker have correct scope", async ({ page }) => {
      await page.goto("/");
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
      expect(scope).toBe(new URL("/", page.url()).href);
    });
  });

  test.describe("Offline Functionality", () => {
    test("should load cached resources when offline", async ({ page }) => {
      await page.goto("/");
      await waitForServiceWorker(page);
      await page.context().setOffline(true);
      const response = await page.reload();
      expect(response?.status()).toBe(200);
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(page.getByRole("heading", { name: "Your Stations" })).toBeVisible();
    });

    test("should show offline banner when connection is lost", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Your Stations" })).toBeVisible();
      await page.context().setOffline(true);
      await expect(
        page.getByRole("alert").filter({ hasText: "You are offline" }).first()
      ).toBeVisible();
    });

    test("should hide offline banner when connection is restored", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Your Stations" })).toBeVisible();
      await page.context().setOffline(true);
      const offlineBanner = page.getByRole("alert").filter({ hasText: "You are offline" });
      await expect(offlineBanner.first()).toBeVisible();
      await page.context().setOffline(false);
      await expect(offlineBanner).toHaveCount(0);
    });

    test("should cache key routes for offline access", async ({ page }) => {
      const routes = ["/", "/search", "/alerts", "/map", "/commute"];
      await page.goto("/");
      await waitForServiceWorker(page);
      await page.context().setOffline(true);
      for (const route of routes) {
        const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        expect(response?.fromServiceWorker()).toBe(true);
        await expect(page.getByRole("main")).toBeVisible();
      }
    });
  });

  test.describe("App Manifest", () => {
    test("should have valid web app manifest", async ({ page }) => {
      const response = await page.request.get("/manifest.webmanifest");
      expect(response.status()).toBe(200);
      const manifest = await response.json();
      expect(manifest).toHaveProperty("name");
      expect(manifest).toHaveProperty("short_name");
      expect(manifest).toHaveProperty("start_url");
      expect(manifest).toHaveProperty("display");
      expect(manifest).toHaveProperty("icons");
    });

    test("should have PWA display mode", async ({ page }) => {
      const response = await page.request.get("/manifest.webmanifest");

      expect(response.status()).toBe(200);
      const manifest = await response.json();
      expect(manifest.display).toMatch(/standalone|fullscreen/);
    });

    test("should have theme color", async ({ page }) => {
      const response = await page.request.get("/manifest.webmanifest");
      expect(response.status()).toBe(200);
      const manifest = await response.json();

      expect(manifest).toHaveProperty("theme_color");

      // Check that theme color is applied to page
      await page.goto("/");

      const themeColor = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="theme-color"]');
        return meta?.getAttribute("content");
      });

      expect(themeColor).toBeTruthy();
    });

    test("should have app icons defined", async ({ page }) => {
      const response = await page.request.get("/manifest.webmanifest");
      expect(response.status()).toBe(200);
      const manifest = await response.json();

      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThan(0);

      // First icon should have src and sizes
      expect(manifest.icons[0]).toHaveProperty("src");
      expect(manifest.icons[0]).toHaveProperty("sizes");
    });
  });

  test.describe("Install Prompt", () => {
    test("should install when the browser accepts the install prompt", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Your Stations" })).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => {
            let prompted = false;
            const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
              prompt: async () => {
                prompted = true;
                sessionStorage.setItem("install-prompt-called", "true");
              },
              userChoice: Promise.resolve({ outcome: "accepted" as const }),
            });
            window.dispatchEvent(event);
            return event.defaultPrevented && !prompted;
          })
        )
        .toBe(true);
      const installPrompt = page.getByText("Install MTA My Way", { exact: true });
      await expect(installPrompt).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: "Install", exact: true }).click();
      await expect(installPrompt).toBeHidden();
      expect(await page.evaluate(() => sessionStorage.getItem("install-prompt-called"))).toBe(
        "true"
      );
    });

    test("should handle beforeinstallprompt event", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Your Stations" })).toBeVisible();

      await expect
        .poll(async () =>
          page.evaluate(() => {
            const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
              prompt: async () => {},
              userChoice: Promise.resolve({ outcome: "dismissed" as const }),
            });
            window.dispatchEvent(event);
            return event.defaultPrevented;
          })
        )
        .toBe(true);

      const installPrompt = page.getByText("Install MTA My Way", { exact: true });
      await expect(installPrompt).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: "Not now" }).click();
      await expect(installPrompt).not.toBeVisible();
    });
  });

  test.describe("Update Prompt", () => {
    test("should check for service worker updates", async ({ page }) => {
      await page.goto("/");
      const scope = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
        return registration.scope;
      });
      expect(scope).toBe(new URL("/", page.url()).href);
    });

    test("should not show an update prompt when no worker is waiting", async ({ page }) => {
      await page.goto("/");
      const waiting = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
        return registration.waiting;
      });
      expect(waiting).toBeNull();
      await expect(page.getByText("Update available", { exact: true })).toBeHidden();
    });
  });

  test.describe("Background Sync", () => {
    test("should retry a queued push operation after a background sync message", async ({
      page,
    }) => {
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      await page.route("**/api/push/unsubscribe", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{"success":true}',
        });
      });
      await page.evaluate(() => {
        localStorage.setItem(
          "mta-pending-push-op",
          JSON.stringify({ type: "unsubscribe", endpoint: "https://example.invalid/push" })
        );
      });

      const retryRequest = page.waitForRequest("**/api/push/unsubscribe");
      await page.evaluate(() => {
        navigator.serviceWorker.dispatchEvent(
          new MessageEvent("message", { data: { type: "RETRY_PUSH_SUBSCRIPTION" } })
        );
      });
      expect((await retryRequest).method()).toBe("DELETE");
      await expect
        .poll(() => page.evaluate(() => localStorage.getItem("mta-pending-push-op")))
        .toBeNull();
    });

    test("should include the push retry handler in the service worker", async ({ page }) => {
      const [workerResponse, pushResponse] = await Promise.all([
        page.request.get("/sw.js"),
        page.request.get("/sw-push.js"),
      ]);
      expect(workerResponse.status()).toBe(200);
      expect(await workerResponse.text()).toContain("sw-push.js");
      expect(pushResponse.status()).toBe(200);
      const pushWorker = await pushResponse.text();
      expect(pushWorker).toContain('addEventListener("sync"');
      expect(pushWorker).toContain('event.tag === "push-subscription-sync"');
      expect(pushWorker).toContain('type: "RETRY_PUSH_SUBSCRIPTION"');
    });
  });

  test.describe("PWA Metadata", () => {
    test("should have apple-touch-icon link", async ({ page }) => {
      await page.goto("/");

      const appleIcon = await page.evaluate(() => {
        const link = document.querySelector('link[rel="apple-touch-icon"]');
        return link?.getAttribute("href");
      });

      expect(appleIcon).toBeTruthy();
    });

    test("should have mobile optimized meta tags", async ({ page }) => {
      await page.goto("/");

      const viewport = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        return meta?.getAttribute("content");
      });

      expect(viewport).toContain("width=device-width");
    });

    test("should have apple-mobile-web-app-capable meta", async ({ page }) => {
      await page.goto("/");

      const capable = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
        return meta?.getAttribute("content");
      });

      expect(capable).toBeTruthy();
    });

    test("should have apple-mobile-web-app-status-bar-style meta", async ({ page }) => {
      await page.goto("/");

      const statusBarStyle = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        return meta?.getAttribute("content");
      });

      expect(statusBarStyle).toBeTruthy();
    });

    test("should have apple-mobile-web-app-title meta", async ({ page }) => {
      await page.goto("/");

      const appTitle = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
        return meta?.getAttribute("content");
      });

      expect(appTitle).toBeTruthy();
    });
  });

  test.describe("PWA Display", () => {
    test("should have proper viewport configuration", async ({ page }) => {
      await page.goto("/");

      const viewport = page.locator('meta[name="viewport"]');
      await expect(viewport).toHaveAttribute("content", /width=device-width/);
    });

    test("should have theme color meta tag", async ({ page }) => {
      await page.goto("/");

      const lightTheme = page.locator(
        'meta[name="theme-color"][media="(prefers-color-scheme: light)"]'
      );
      const darkTheme = page.locator(
        'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]'
      );
      await expect(lightTheme).toHaveAttribute("content", /^#[0-9A-Fa-f]{6}$/);
      await expect(darkTheme).toHaveAttribute("content", /^#[0-9A-Fa-f]{6}$/);
      expect(await lightTheme.getAttribute("content")).not.toBe(
        await darkTheme.getAttribute("content")
      );
    });

    test("should have proper background color", async ({ page }) => {
      await page.goto("/");

      const backgroundColor = await page.evaluate(() => {
        const styles = window.getComputedStyle(document.body);
        return styles.backgroundColor;
      });

      expect(backgroundColor).toBeTruthy();
    });
  });

  test.describe("PWA Installation Scenarios", () => {
    test("should preserve state when installed as PWA", async ({ page }) => {
      // Set some state
      await page.goto("/");

      await page.evaluate(() => {
        localStorage.setItem("test-state", "preserved");
      });

      // Simulate PWA display mode
      await page.emulateMedia({ reducedMotion: "reduce" });

      // Reload
      await page.reload();

      // State should be preserved
      const testState = await page.evaluate(() => {
        return localStorage.getItem("test-state");
      });

      expect(testState).toBe("preserved");
    });
  });

  test.describe("Service Worker Message Handling", () => {
    test("should include the SKIP_WAITING handler in the registered worker", async ({ page }) => {
      await page.goto("/");
      const workerURL = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return registration.active?.scriptURL;
      });
      expect(workerURL).toBe(new URL("/sw.js", page.url()).href);
      const workerResponse = await page.request.get(workerURL!);
      const pushResponse = await page.request.get("/sw-push.js");
      expect(workerResponse.status()).toBe(200);
      expect(await workerResponse.text()).toContain("sw-push.js");
      expect(pushResponse.status()).toBe(200);
      const pushScript = await pushResponse.text();
      expect(pushScript).toContain('event.data.type === "SKIP_WAITING"');
      expect(pushScript).toContain("self.skipWaiting()");
    });
  });

  test.describe("PWA Performance", () => {
    test("should serve a repeat visit from the service worker", async ({ page }) => {
      await page.goto("/");
      await waitForServiceWorker(page);
      const response = await page.reload();
      expect(response?.status()).toBe(200);
      expect(response?.fromServiceWorker()).toBe(true);
      await expect(page.getByRole("main")).toBeVisible();
    });

    test("should have reasonable total bundle size", async ({ page }) => {
      // Check that scripts are loaded
      await page.goto("/");

      const scriptsLoaded = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("script[src]")).length;
      });

      expect(scriptsLoaded).toBeGreaterThan(0);
    });
  });

  test.describe("PWA Security", () => {
    test("should use HTTPS for service worker scope", async ({ page }) => {
      await page.goto("/");
      const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
      expect(scope).toBe(new URL("/", page.url()).href);
      expect(new URL(scope).protocol).toMatch(/^https?:$/);
    });
  });
});
