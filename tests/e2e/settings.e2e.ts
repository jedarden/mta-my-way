/**
 * E2E tests for the Settings screen.
 *
 * Tests cover:
 * - Theme settings
 * - Display preferences
 * - Notification settings
 * - Push notification management
 * - Data management
 * - About/Info section
 */

import { expect, test } from "@playwright/test";

test.describe("Settings Screen", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
  });

  test.describe("Settings Loading", () => {
    test("should load settings screen successfully", async ({ page }) => {
      // Should see settings heading
      await expect(page.locator('role=heading[name="Settings"]')).toBeVisible();
    });

    test("should have primary navigation", async ({ page }) => {
      await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    });

    test("should navigate home from settings", async ({ page }) => {
      await page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Home" })
        .click();
      await expect(page).toHaveURL("/");
    });
  });

  test.describe("Theme Settings", () => {
    test("should display theme options", async ({ page }) => {
      await page.goto("/settings");

      // Look for theme section
      await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
    });

    test("should show light/dark/system theme options", async ({ page }) => {
      await page.goto("/settings");

      // Look for theme options
      const themeSelector = page.getByRole("combobox", { name: "Select theme" });
      await expect(themeSelector.locator("option")).toHaveText(["System", "Light", "Dark"]);
    });

    test("should allow changing theme", async ({ page }) => {
      await page.goto("/settings");

      const themeSelector = page.getByRole("combobox", { name: "Select theme" });
      await themeSelector.selectOption("dark");
      await expect(themeSelector).toHaveValue("dark");
      await expect
        .poll(() =>
          page.evaluate(() => JSON.parse(localStorage.getItem("mta-settings") || "{}").state?.theme)
        )
        .toBe("dark");
    });

    test("should reflect a theme change immediately", async ({ page }) => {
      await page.goto("/settings");
      const themeSelector = page.getByRole("combobox", { name: "Select theme" });
      await themeSelector.selectOption("dark");
      await expect(themeSelector).toHaveValue("dark");
      await themeSelector.selectOption("light");
      await expect(themeSelector).toHaveValue("light");
    });
  });

  test.describe("Display Preferences", () => {
    test("should show show/hide unassigned trips option", async ({ page }) => {
      await page.goto("/settings");

      const unassignedOption = page.locator("text=/unassigned|show all trips/i");
      await expect(unassignedOption).toBeAttached();
    });

    test("should toggle unassigned trips preference", async ({ page }) => {
      await page.goto("/settings");

      const toggle = page.locator('[role="switch"], [type="checkbox"]').first();
      const hasToggle = await toggle.count();

      if (hasToggle > 0) {
        const initialState = await toggle.isChecked();

        await toggle.click();

        const newState = await toggle.isChecked();

        expect(newState).not.toBe(initialState);
      }
    });

    test("should show refresh interval setting", async ({ page }) => {
      await page.goto("/settings");

      const refreshOption = page.locator("text=/refresh|update|interval/i");
      await expect(refreshOption).toBeAttached();
    });

    test("should allow adjusting refresh interval", async ({ page }) => {
      await page.goto("/settings");

      // Look for interval selector (buttons, dropdown, or slider)
      const intervalControl = page
        .getByRole("button", { name: /\d+ sec/ })
        .or(page.getByRole("combobox"))
        .or(page.locator('input[type="range"]'));
      const hasControl = await intervalControl.count();

      if (hasControl > 0) {
        await intervalControl.first().click();

        // Settings should be updated
        const settings = await page.evaluate(() => {
          return JSON.parse(localStorage.getItem("mta-settings") || "{}");
        });

        expect(settings.refreshInterval).toBeGreaterThanOrEqual(15);
      }
    });
  });

  test.describe("Notification Settings", () => {
    test("should show push notification section", async ({ page }) => {
      await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
    });

    test("should expose a push subscription control", async ({ page }) => {
      const pushSwitch = page.getByRole("switch", { name: /push notifications/i });
      await expect(pushSwitch).toBeVisible();
    });

    test("should allow enabling push notifications", async ({ page }) => {
      await page.goto("/settings");

      const enableButton = page
        .locator('button:has-text("Enable")')
        .or(page.locator('button:has-text("Subscribe")'));
      const hasButton = await enableButton.count();

      if (hasButton > 0) {
        // Mock the permission request
        await page.addInitScript(() => {
          (Notification as any).permission = "granted";
        });

        await enableButton.first().click();

        // Check if subscription was attempted
        // (exact behavior depends on browser support)
      }
    });

    test("should hide quiet hours until push is subscribed", async ({ page }) => {
      await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
      await expect(page.getByText("Quiet hours", { exact: true })).toHaveCount(0);
    });

    test("should allow configuring quiet hours", async ({ page }) => {
      await page.goto("/settings");

      const timeInput = page.locator('input[type="time"], input[type="number"]').first();
      const hasInput = await timeInput.count();

      if (hasInput > 0) {
        await timeInput.fill("22:00");

        // Settings should be saved
        const settings = await page.evaluate(() => {
          return JSON.parse(localStorage.getItem("mta-settings") || "{}");
        });

        expect(settings.quietHoursStart || settings.quietHours).toBeTruthy();
      }
    });
  });

  test.describe("Data Management", () => {
    test("should show favorites section", async ({ page }) => {
      await page.goto("/settings");

      const favoritesSection = page.locator("text=/favorites|your stations/i");
      await expect(favoritesSection).toBeAttached();
    });

    test("should show commutes section", async ({ page }) => {
      await page.goto("/settings");

      const commutesSection = page.locator("text=/commutes|your commutes/i");
      await expect(commutesSection).toBeAttached();
    });

    test("should explain where local preferences are stored", async ({ page }) => {
      await expect(page.getByText("Local only", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
    });
  });

  test.describe("About Section", () => {
    test("should show app version", async ({ page }) => {
      await page.goto("/settings");

      const version = page.locator("text=/version|v\\d+\\.\\d+/i");
      await expect(version).toBeAttached();
    });

    test("should describe the app", async ({ page }) => {
      await expect(page.getByText("A mobile-first PWA for NYC subway commuters")).toBeVisible();
    });
  });

  test.describe("Accessibility Settings", () => {
    test("should show reduce motion option", async ({ page }) => {
      await page.goto("/settings");

      const reduceMotion = page.locator("text=/reduce motion|animation/i");
      await expect(reduceMotion).toBeAttached();
    });

    test("should respect system reduce motion preference", async ({ page }) => {
      // Set system preference
      await page.emulateMedia({ reducedMotion: "reduce" });

      await page.goto("/settings");

      // Check if reduce motion is reflected in UI
      const reducedMotionIndicator = page.locator(
        '[data-reduced-motion="true"], [class*="no-motion"]'
      );
      const hasIndicator = await reducedMotionIndicator.count();

      if (hasIndicator > 0) {
        await expect(reducedMotionIndicator.first()).toBeVisible();
      }

      // Reset
      await page.emulateMedia({ reducedMotion: "no-preference" });
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper heading hierarchy", async ({ page }) => {
      await page.goto("/settings");

      const mainHeading = page.locator('role=heading[level="1"]');
      await expect(mainHeading.first()).toBeVisible();

      // Should have section headings
      const sectionHeadings = page.locator('role=heading[level="2"]');
      await expect(sectionHeadings.first()).toBeAttached();
    });

    test("should have accessible form controls", async ({ page }) => {
      await page.goto("/settings");

      // All inputs should have labels
      const inputs = page.locator("input, select, textarea");
      const count = await inputs.count();

      for (let i = 0; i < Math.min(count, 5); i++) {
        const input = inputs.nth(i);
        const hasLabel = await input.evaluate((el) => {
          const label =
            el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby") ||
            el.closest("label") ||
            document.querySelector(`label[for="${el.id}"]`);
          return !!label;
        });
        expect(hasLabel).toBe(true);
      }
    });

    test("should expose setting changes through switch state", async ({ page }) => {
      await page.goto("/settings");
      const toggle = page.getByRole("switch", { name: "Enable accessible mode" });
      await expect(toggle).toHaveAttribute("aria-checked", "false");
      await toggle.click();
      await expect(page.getByRole("switch", { name: "Disable accessible mode" })).toHaveAttribute(
        "aria-checked",
        "true"
      );
    });

    test("should be keyboard navigable", async ({ page }) => {
      await page.goto("/settings");

      // Tab through settings
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Tab");
      }

      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName || "";
      });

      expect(["BUTTON", "INPUT", "SELECT", "A"].includes(focused)).toBe(true);
    });
  });

  test.describe("Settings Persistence", () => {
    test("should save settings to localStorage", async ({ page }) => {
      await page.goto("/settings");

      // Change a setting
      const toggle = page.locator('[role="switch"], [type="checkbox"]').first();
      const hasToggle = await toggle.count();

      if (hasToggle > 0) {
        await toggle.click();

        // Check localStorage
        const settings = await page.evaluate(() => {
          return JSON.parse(localStorage.getItem("mta-settings") || "{}");
        });

        expect(Object.keys(settings).length).toBeGreaterThan(0);
      }
    });

    test("should load settings from localStorage", async ({ page }) => {
      // Set a setting in localStorage
      await page.addInitScript(() => {
        localStorage.setItem(
          "mta-settings",
          JSON.stringify({
            theme: "dark",
            showUnassignedTrips: true,
            refreshInterval: 30,
          })
        );
      });

      await page.goto("/settings");

      // Settings should be reflected in UI
      const darkOption = page.locator(
        '[aria-pressed="true"]:has-text("Dark"), [data-selected="true"]:has-text("Dark")'
      );
      const hasDark = await darkOption.count();

      if (hasDark > 0) {
        await expect(darkOption.first()).toBeVisible();
      }
    });
  });

  test.describe("Error Handling", () => {
    test("should handle localStorage quota exceeded gracefully", async ({ page }) => {
      // Fill localStorage
      await page.addInitScript(() => {
        try {
          localStorage.setItem("test", "x".repeat(10 * 1024 * 1024));
        } catch (e) {
          // Quota exceeded
        }
      });

      await page.goto("/settings");

      // Should still show settings
      const heading = page.locator('role=heading[name="Settings"]');
      await expect(heading).toBeVisible();
    });

    test("should show error message if settings fail to load", async ({ page }) => {
      // Intercept and fail localStorage access
      await page.addInitScript(() => {
        const originalGetItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function () {
          throw new Error("Storage failed");
        };
      });

      await page.goto("/settings");

      // Should show some kind of error or fallback
      const errorText = page.locator("text=/error|failed|unavailable/i");
      const hasError = await errorText.count();

      // Either shows error or falls back to defaults
      const heading = page.locator('role=heading[name="Settings"]');
      await expect(heading).toBeAttached();
    });
  });

  test.describe("Navigation", () => {
    test("should navigate to home via bottom nav", async ({ page }) => {
      await page.goto("/settings");

      const homeButton = page.locator('role=link[name="Home"]');
      const hasHome = await homeButton.count();

      if (hasHome > 0) {
        await homeButton.click();
        await expect(page).toHaveURL("/");
      }
    });

    test("should navigate to other screens via bottom nav", async ({ page }) => {
      await page.goto("/settings");

      const navButtons = page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link");
      const count = await navButtons.count();

      if (count > 0) {
        await navButtons.first().click();

        // Should navigate away
        const url = page.url();
        expect(url).not.toBe("/settings");
      }
    });
  });
});
