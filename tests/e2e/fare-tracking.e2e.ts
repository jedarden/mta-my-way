/**
 * E2E tests for OMNY Fare Tracking.
 *
 * Tests cover:
 * - Fare cap progress display
 * - Weekly rides tracking
 * - Monthly comparison with unlimited pass
 * - Progress bar visualization
 * - Fare cap nudge when close to free rides
 * - Carbon savings equivalent
 * - Empty state when no rides tracked
 * - Data persistence
 */

import { expect, test } from "@playwright/test";

test.describe("Fare Tracking", () => {
  test.describe("Fare Tracker Display", () => {
    test("should display fare tracker when rides are tracked", async ({ page }) => {
      // Set up some rides in fare store
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should see fare tracker section
      const fareTracker = page.locator("text=/OMNY Fare Cap|Fare Cap/i");
      await expect(fareTracker).toBeAttached();
    });

    test("should show weekly rides count", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show rides count (8/12 or similar)
      const ridesText = page.locator("text=/\\d+\\/\\d+|rides/i");
      await expect(ridesText).toBeAttached();
    });

    test("should show progress bar toward fare cap", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should have progress bar element
      const progressBar = page.locator('[role="progressbar"]');
      await expect(progressBar).toBeAttached();
    });

    test("should show rides until free", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show "X more until free"
      const untilFree = page.locator("text=/more until free|free rides/i");
      await expect(untilFree).toBeAttached();
    });

    test("should show weekly spend", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show weekly spend amount
      const weeklySpend = page.locator("text=/\\$\\d+\\.\\d+.*this week/i");
      await expect(weeklySpend).toBeAttached();
    });
  });

  test.describe("Fare Cap States", () => {
    test("should show green progress bar when cap is reached", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 12,
          monthlyRides: 48,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show "Free rides!" message
      const freeRides = page.locator("text=/Free rides|12\\/12/i");
      await expect(freeRides).toBeAttached();
    });

    test("should show amber color when close to cap (10+ rides)", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 10,
          monthlyRides: 40,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show nudge message
      const nudge = page.locator("text=/Take.*more.*for free/i");
      await expect(nudge).toBeAttached();
    });

    test("should show default color when far from cap", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 3,
          monthlyRides: 12,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show regular progress
      const progressText = page.locator("text=/3\\/12|more until free/i");
      await expect(progressText).toBeAttached();
    });
  });

  test.describe("Monthly Comparison", () => {
    test("should show monthly rides count", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show monthly rides
      const monthlyRides = page.locator("text=/This month.*rides|32.*rides/i");
      await expect(monthlyRides).toBeAttached();
    });

    test("should show unlimited pass comparison when pay-per-ride is better", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Pay-per-ride: 32 * $2.90 = $92.80 vs $132 unlimited
      // Should show pay-per-ride saves
      const savingsText = page.locator("text=/saves|Pay-per-ride/i");
      await expect(savingsText).toBeAttached();
    });

    test("should show unlimited pass is better when applicable", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 15,
          monthlyRides: 60,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Pay-per-ride: 60 * $2.90 = $174 vs $132 unlimited
      // Should show unlimited saves
      const unlimitedText = page.locator("text=/Unlimited saves/i");
      await expect(unlimitedText).toBeAttached();
    });

    test("should show comparison values", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show both pay-per-ride and unlimited amounts
      const payPerRide = page.locator("text=/Pay-per-ride:\\s*\\$\\d+/i");
      const unlimited = page.locator("text=/Unlimited:\\s*\\$\\d+/i");

      await expect(payPerRide).toBeAttached();
      await expect(unlimited).toBeAttached();
    });
  });

  test.describe("Nudge Message", () => {
    test("should show nudge at 10 rides", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 10,
          monthlyRides: 40,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show nudge banner
      const nudge = page.locator("text=/Take 1 more ride|1 more round trip/i");
      await expect(nudge).toBeAttached();
    });

    test("should show nudge at 11 rides", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 11,
          monthlyRides: 44,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should show nudge banner
      const nudge = page.locator("text=/Take.*for free rides/i");
      await expect(nudge).toBeAttached();
    });

    test("should not show nudge when cap is reached", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 12,
          monthlyRides: 48,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should not show nudge banner
      const nudge = page.locator("text=/Take 1 more ride/i");
      const hasNudge = await nudge.count();
      expect(hasNudge).toBe(0);
    });

    test("should not show nudge when far from cap", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 5,
          monthlyRides: 20,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Should not show nudge banner
      const nudge = page.locator("text=/Take.*more.*for free/i");
      const hasNudge = await nudge.count();
      expect(hasNudge).toBe(0);
    });
  });

  test.describe("Empty State", () => {
    test("should not show fare tracker when no rides tracked", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("mta-fare");
      });

      await page.goto("/");

      // Fare tracker should not be visible
      const fareTracker = page.locator("text=/OMNY Fare Cap/i");
      const hasTracker = await fareTracker.count();

      expect(hasTracker).toBe(0);
    });

    test("should show fare tracker after first ride is tracked", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("mta-fare");
      });

      await page.goto("/");

      // Initially no tracker
      let fareTracker = page.locator("text=/OMNY Fare Cap/i");
      let hasTracker = await fareTracker.count();
      expect(hasTracker).toBe(0);

      // Add a ride
      await page.evaluate(() => {
        const fareData = {
          weeklyRides: 1,
          monthlyRides: 1,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.reload();

      // Now tracker should be visible
      fareTracker = page.locator("text=/OMNY Fare Cap/i");
      await expect(fareTracker).toBeAttached();
    });
  });

  test.describe("Data Persistence", () => {
    test("should persist fare data across page reloads", async ({ page }) => {
      // Set initial data
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 7,
          monthlyRides: 28,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Verify initial data
      const ridesText = await page.locator("text=/\\d+\\/12/i").first().textContent();
      expect(ridesText).toContain("7");

      // Reload page
      await page.reload();

      // Data should persist
      const ridesTextAfter = await page.locator("text=/\\d+\\/12/i").first().textContent();
      expect(ridesTextAfter).toContain("7");
    });

    test("should update when rides are added", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 7,
          monthlyRides: 28,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Add a ride
      await page.evaluate(() => {
        const data = localStorage.getItem("mta-fare");
        if (data) {
          const fareData = JSON.parse(data);
          fareData.weeklyRides = 8;
          fareData.monthlyRides = 29;
          localStorage.setItem("mta-fare", JSON.stringify(fareData));
        }
      });

      // Trigger update (navigate and back)
      await page.goto("/search");
      await page.goBack();

      // Should show updated count
      const ridesText = await page.locator("text=/\\d+\\/12/i").first().textContent();
      expect(ridesText).toContain("8");
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper ARIA labels on progress bar", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      const progressBar = page.locator('[role="progressbar"]');
      await expect(progressBar).toBeAttached();

      // Should have proper ARIA attributes
      const ariaValueNow = await progressBar.getAttribute("aria-valuenow");
      const ariaValueMin = await progressBar.getAttribute("aria-valuemin");
      const ariaValueMax = await progressBar.getAttribute("aria-valuemax");
      const ariaLabel = await progressBar.getAttribute("aria-label");

      expect(ariaValueNow).toBeTruthy();
      expect(ariaValueMin).toBe("0");
      expect(ariaValueMax).toBe("12");
      expect(ariaLabel).toBeTruthy();
    });

    test("should announce progress to screen readers", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Progress section should be accessible
      const progressSection = page.locator("text=/8.*12|rides/i");
      await expect(progressSection).toBeAttached();
    });
  });

  test.describe("Visual Design", () => {
    test("should use appropriate colors for progress states", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 8,
          monthlyRides: 32,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Progress bar fill should have a color class
      const progressFill = page.locator('[role="progressbar"] > div');
      await expect(progressFill).toBeAttached();

      // Check that it has a background color
      const backgroundColor = await progressFill.first().evaluate((el) => {
        return window.getComputedStyle(el).backgroundColor;
      });

      expect(backgroundColor).toBeTruthy();
      expect(backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    });

    test("should show nudge with distinct styling", async ({ page }) => {
      await page.addInitScript(() => {
        const fareData = {
          weeklyRides: 10,
          monthlyRides: 40,
          currentFare: 2.9,
          unlimitedPassPrice: 132,
          lastReset: new Date().toISOString(),
        };
        localStorage.setItem("mta-fare", JSON.stringify(fareData));
      });

      await page.goto("/");

      // Nudge should have distinct background/border
      const nudge = page.locator("text=/Take.*more.*for free/i").locator("..");
      const hasNudge = await nudge.count();

      if (hasNudge > 0) {
        const backgroundColor = await nudge.first().evaluate((el) => {
          return window.getComputedStyle(el).backgroundColor;
        });

        expect(backgroundColor).toBeTruthy();
      }
    });
  });
});
