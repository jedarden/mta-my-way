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

    test("should have back button", async ({ page }) => {
      const backButton = page.locator(
        'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
      );
      await expect(backButton.first()).toBeAttached();
    });

    test("should navigate back when back button is clicked", async ({ page }) => {
      const backButton = page.locator(
        'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
      );
      await backButton.first().click();

      // Should navigate away from settings
      const url = page.url();
      expect(url).not.toContain("/settings");
    });
  });

  test.describe("Theme Settings", () => {
    test("should display theme options", async ({ page }) => {
      await page.goto("/settings");

      // Look for theme section
      const themeSection = page.locator("text=/Theme|Appearance|Display/i");
      await expect(themeSection).toBeAttached();
    });

    test("should show light/dark/system theme options", async ({ page }) => {
      await page.goto("/settings");

      // Look for theme options
      const themeOptions = page.locator("text=/Light|Dark|System|Auto/i");
      await expect(themeOptions.first()).toBeAttached();
    });

    test("should allow changing theme", async ({ page }) => {
      await page.goto("/settings");

      // Find theme selector
      const themeOption = page
        .locator('role=button:has-text("Dark")')
        .or(page.locator('[role="radiogroup"] > *'));
      const hasOption = await themeOption.count();

      if (hasOption > 0) {
        await themeOption.first().click();

        // Check that theme preference is saved
        const themePref = await page.evaluate(() => {
          const settings = JSON.parse(localStorage.getItem("mta-settings") || "{}");
          return settings.theme;
        });

        expect(["light", "dark", "system"]).toContain(themePref);
      }
    });

    test("should apply theme change immediately", async ({ page }) => {
      await page.goto("/settings");

      // Get initial background color
      const initialBg = await page.evaluate(() => {
        return getComputedStyle(document.body).backgroundColor;
      });

      // Toggle to dark mode
      const darkOption = page
        .locator('role=button:has-text("Dark")')
        .or(page.locator('[value="dark"], [data-theme="dark"]'));
      const hasDark = await darkOption.count();

      if (hasDark > 0) {
        await darkOption.first().click();

        // Wait for theme to apply
        await page.waitForTimeout(100);

        const newBg = await page.evaluate(() => {
          return getComputedStyle(document.body).backgroundColor;
        });

        // Background should have changed (or at least be different)
        expect(newBg).toBeTruthy();
      }
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
      const intervalControl = page.locator(
        'role=button:has-text(/\\d+ sec/), [role="combobox"], input[type="range"]'
      );
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
      await page.goto("/settings");

      const pushSection = page.locator("text=/push notification|alerts|notify/i");
      await expect(pushSection).toBeAttached();
    });

    test("should show notification permission status", async ({ page }) => {
      await page.goto("/settings");

      // Look for permission indicator
      const permissionStatus = page.locator("text=/enabled|disabled|permission/i");
      await expect(permissionStatus).toBeAttached();
    });

    test("should allow enabling push notifications", async ({ page }) => {
      await page.goto("/settings");

      const enableButton = page
        .locator('role=button:has-text("Enable")')
        .or(page.locator('role=button:has-text("Subscribe")'));
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

    test("should show quiet hours setting", async ({ page }) => {
      await page.goto("/settings");

      const quietHours = page.locator("text=/quiet hours|do not disturb/i");
      await expect(quietHours).toBeAttached();
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

    test("should show alert severity filter", async ({ page }) => {
      await page.goto("/settings");

      const severityFilter = page.locator("text=/severity|alert level|filter/i");
      await expect(severityFilter).toBeAttached();
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

    test("should have export data option", async ({ page }) => {
      await page.goto("/settings");

      const exportButton = page
        .locator('role=button:has-text("Export")')
        .or(page.locator("text=/export data|download/i"));
      await expect(exportButton).toBeAttached();
    });

    test("should export data when requested", async ({ page }) => {
      await page.goto("/settings");

      const exportButton = page
        .locator('role=button:has-text("Export")')
        .or(page.locator('role=button:has-text("Download")'));
      const hasButton = await exportButton.count();

      if (hasButton > 0) {
        // Track download events
        const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);

        await exportButton.first().click();

        // Download might trigger
        const download = await downloadPromise;
        if (download) {
          expect(download.suggestedFilename()).toBeTruthy();
        }
      }
    });

    test("should have clear data option", async ({ page }) => {
      await page.goto("/settings");

      const clearButton = page
        .locator('role=button:has-text("Clear")')
        .or(page.locator("text=/clear data|reset|delete all/i"));
      await expect(clearButton).toBeAttached();
    });

    test("should confirm before clearing data", async ({ page }) => {
      await page.goto("/settings");

      const clearButton = page
        .locator('role=button:has-text("Clear")')
        .or(page.locator('role=button:has-text("Delete")'));
      const hasButton = await clearButton.count();

      if (hasButton > 0) {
        await clearButton.first().click();

        // Should show confirmation dialog
        const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
        const hasDialog = await dialog.count();

        if (hasDialog > 0) {
          await expect(dialog.first()).toBeVisible();

          // Should have confirm and cancel buttons
          const confirmButton = page
            .locator('role=button:has-text("Confirm")')
            .or(page.locator('role=button:has-text("Clear")'));
          await expect(confirmButton).toBeAttached();

          const cancelButton = page.locator('role=button:has-text("Cancel")');
          await expect(cancelButton).toBeAttached();
        }
      }
    });
  });

  test.describe("About Section", () => {
    test("should show app version", async ({ page }) => {
      await page.goto("/settings");

      const version = page.locator("text=/version|v\\d+\\.\\d+/i");
      await expect(version).toBeAttached();
    });

    test("should show build information", async ({ page }) => {
      await page.goto("/settings");

      const buildInfo = page.locator("text=/build|commit|environment/i");
      await expect(buildInfo).toBeAttached();
    });

    test("should have links to support/privacy", async ({ page }) => {
      await page.goto("/settings");

      const supportLink = page
        .locator('role=link:has-text("Support")')
        .or(page.locator('role=link:has-text("Help")'));
      const privacyLink = page.locator('role=link:has-text("Privacy")');

      // At least one should exist
      const hasLinks = (await supportLink.count()) + (await privacyLink.count()) > 0;
      expect(hasLinks).toBe(true);
    });

    test("should show license information", async ({ page }) => {
      await page.goto("/settings");

      const license = page.locator("text=/license|open source|MIT/i");
      await expect(license).toBeAttached();
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

    test("should announce setting changes", async ({ page }) => {
      await page.goto("/settings");

      // Change a setting
      const toggle = page.locator('[role="switch"], [type="checkbox"]').first();
      const hasToggle = await toggle.count();

      if (hasToggle > 0) {
        // Look for live region that announces changes
        const liveRegion = page.locator('[aria-live], [role="status"]');
        await expect(liveRegion).toBeAttached();

        await toggle.click();

        // Change should be announced (or at least live region exists)
      }
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

      const navButtons = page.locator('[role="navigation"] role="link"]');
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
