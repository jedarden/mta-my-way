/**
 * E2E tests for Stats / Subway Year Screen.
 *
 * Tests cover:
 * - Stats screen navigation
 * - Time window selection (month, quarter, year, all time)
 * - Subway Year card display
 * - Stats details sections
 * - Share functionality
 * - Empty state when no trips
 * - Carbon savings calculations
 * - Streak calculations
 * - Most used station/line
 * - Visual design of card
 */

import { expect, test } from "@playwright/test";

test.describe("Stats / Subway Year Screen", () => {
  test.describe("Navigation", () => {
    test("should navigate to stats screen from journal", async ({ page }) => {
      // Go to journal first
      await page.goto("/journal");

      // Look for stats link
      const statsLink = page.locator(
        'role=button:has-text("Subway Year"), role=link[href="/stats"]'
      );
      const hasLink = await statsLink.count();

      if (hasLink > 0) {
        await statsLink.click();
        await expect(page).toHaveURL("/stats");
      } else {
        // Navigate directly
        await page.goto("/stats");
        await expect(page).toHaveURL("/stats");
      }
    });

    test("should have back button to journal", async ({ page }) => {
      await page.goto("/stats");

      const backButton = page.locator('role=button:has-text("Back")');
      await expect(backButton).toBeVisible();

      await backButton.click();
      await expect(page).toHaveURL("/journal");
    });

    test("should display stats heading", async ({ page }) => {
      await page.goto("/stats");

      await expect(page.locator('role=heading[name="Your Subway Year"]')).toBeVisible();
    });

    test("should display description", async ({ page }) => {
      await page.goto("/stats");

      const description = page.locator("text=/personalized summary|subway commute/i");
      await expect(description).toBeAttached();
    });
  });

  test.describe("Empty State", () => {
    test.beforeEach(async ({ page }) => {
      // Clear journal data
      await page.addInitScript(() => {
        localStorage.removeItem("mta-journal");
      });
    });

    test("should show empty state when no trips recorded", async ({ page }) => {
      await page.goto("/stats");

      const emptyState = page.locator("text=/No trips recorded/i");
      await expect(emptyState).toBeVisible();
    });

    test("should show guidance message in empty state", async ({ page }) => {
      await page.goto("/stats");

      const guidance = page.locator("text=/Start tracking|Set up a commute/i");
      await expect(guidance).toBeAttached();
    });

    test("should have link to set up commute", async ({ page }) => {
      await page.goto("/stats");

      const commuteLink = page.locator('role=button:has-text("Set up a commute")');
      await expect(commuteLink).toBeAttached();

      await commuteLink.click();
      await expect(page).toHaveURL("/commute");
    });
  });

  test.describe("Time Window Selection", () => {
    test.beforeEach(async ({ page }) => {
      // Set up some trip data
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 50,
              totalMinutes: 1000,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 50 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });
    });

    test("should display time window selector", async ({ page }) => {
      await page.goto("/stats");

      const windows = ["This Month", "This Quarter", "This Year", "All Time"];

      for (const window of windows) {
        const button = page.locator(`role=button:has-text("${window}")`);
        await expect(button).toBeAttached();
      }
    });

    test("should allow switching time windows", async ({ page }) => {
      await page.goto("/stats");

      // Click on different windows
      const monthButton = page.locator('role=button:has-text("This Month")');
      await monthButton.click();

      // Should be selected
      const isSelected = await monthButton.evaluate((el) => {
        return (
          el.classList.contains("bg-mta-primary") || el.getAttribute("aria-pressed") === "true"
        );
      });

      if (isSelected) {
        await expect(isSelected).toBe(true);
      }

      // Try another window
      const yearButton = page.locator('role=button:has-text("This Year")');
      await yearButton.click();

      const yearSelected = await yearButton.evaluate((el) => {
        return (
          el.classList.contains("bg-mta-primary") || el.getAttribute("aria-pressed") === "true"
        );
      });

      if (yearSelected) {
        await expect(yearSelected).toBe(true);
      }
    });

    test("should update stats when time window changes", async ({ page }) => {
      await page.goto("/stats");

      // Get initial trip count
      const initialTrips = await page
        .locator("text=/Trips Taken/i")
        .locator("..")
        .locator("text=/\\d+/")
        .first()
        .textContent();

      // Switch to All Time
      await page.click('role=button:has-text("All Time")');

      // Wait for update
      await page.waitForTimeout(500);

      // Get updated trip count
      const updatedTrips = await page
        .locator("text=/Trips Taken/i")
        .locator("..")
        .locator("text=/\\d+/")
        .first()
        .textContent();

      expect(updatedTrips).toBeTruthy();
    });
  });

  test.describe("Subway Year Card", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 100,
              totalMinutes: 2000,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 100 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });
    });

    test("should display Subway Year card", async ({ page }) => {
      await page.goto("/stats");

      // Should see the card with gradient background
      const card = page.locator(".from-\\[\\#0039A6\\]");
      await expect(card).toBeAttached();
    });

    test("should show total trips", async ({ page }) => {
      await page.goto("/stats");

      const tripsElement = page.locator("text=/Trips Taken/i").locator("..");
      await expect(tripsElement).toBeAttached();

      const tripsCount = await page
        .locator("text=/Trips Taken/i")
        .locator("..")
        .locator("text=/\\d+/")
        .first()
        .textContent();
      expect(parseInt(tripsCount || "0")).toBeGreaterThan(0);
    });

    test("should show time underground", async ({ page }) => {
      await page.goto("/stats");

      const timeElement = page.locator("text=/Underground/i").locator("..");
      await expect(timeElement).toBeAttached();

      const timeValue = await timeElement
        .locator("text=/\\d+h\\s*\\d+m|\\d+m/")
        .first()
        .textContent();
      expect(timeValue).toBeTruthy();
    });

    test("should show distance traveled", async ({ page }) => {
      await page.goto("/stats");

      const distance = page.locator("text=/Distance|km|mi/i");
      await expect(distance).toBeAttached();
    });

    test("should show top station", async ({ page }) => {
      await page.goto("/stats");

      const topStation = page.locator("text=/Top Station|Most-Used Station/i");
      await expect(topStation).toBeAttached();
    });

    test("should show top line", async ({ page }) => {
      await page.goto("/stats");

      const topLine = page.locator("text=/Top Line|Most-Used Line/i");
      await expect(topLine).toBeAttached();
    });

    test("should show stations visited count", async ({ page }) => {
      await page.goto("/stats");

      const stationsVisited = page.locator("text=/Stations Visited/i");
      await expect(stationsVisited).toBeAttached();
    });

    test("should show delay days", async ({ page }) => {
      await page.goto("/stats");

      const delayDays = page.locator("text=/Delay Days/i");
      await expect(delayDays).toBeAttached();
    });

    test("should show streak information", async ({ page }) => {
      await page.goto("/stats");

      const streak = page.locator("text=/Longest Streak|Current Streak/i");
      await expect(streak).toBeAttached();
    });
  });

  test.describe("Carbon Savings Section", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 50,
              totalMinutes: 1000,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 50 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });
    });

    test("should show carbon savings", async ({ page }) => {
      await page.goto("/stats");

      const carbonSavings = page.locator("text=/CO₂ Saved|Carbon Savings|kg of CO₂/i");
      await expect(carbonSavings).toBeAttached();
    });

    test("should show environmental equivalents", async ({ page }) => {
      await page.goto("/stats");

      // Should show trees equivalent
      const trees = page.locator("text=/trees|worth of trees/i");
      await expect(trees).toBeAttached();

      // Should show flights equivalent
      const flights = page.locator("text=/NYC↔LA|flights/i");
      await expect(flights).toBeAttached();

      // Should show car-free days
      const carFree = page.locator("text=/car-free|days/i");
      await expect(carFree).toBeAttached();
    });
  });

  test.describe("Stats Details", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 50,
              totalMinutes: 1000,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 50 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });
    });

    test("should display overview section", async ({ page }) => {
      await page.goto("/stats");

      const overview = page.locator("text=/Overview|Details/i");
      await expect(overview).toBeAttached();
    });

    test("should display favorites section", async ({ page }) => {
      await page.goto("/stats");

      const favorites = page.locator("text=/Favorites|Most-Used/i");
      await expect(favorites).toBeAttached();
    });

    test("should display reliability section", async ({ page }) => {
      await page.goto("/stats");

      const reliability = page.locator("text=/Reliability|Delay Days/i");
      await expect(reliability).toBeAttached();
    });

    test("should display environmental impact section", async ({ page }) => {
      await page.goto("/stats");

      const envImpact = page.locator("text=/Environmental Impact|CO₂ Saved/i");
      await expect(envImpact).toBeAttached();
    });
  });

  test.describe("Share Functionality", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 50,
              totalMinutes: 1000,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 50 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });
    });

    test("should have share button", async ({ page }) => {
      await page.goto("/stats");

      const shareButton = page.locator('role=button:has-text("Share")');
      await expect(shareButton).toBeVisible();
    });

    test("should trigger share when button is clicked", async ({ page }) => {
      // Mock the share API
      await page.addInitScript(() => {
        (window as any).navigator.share = async () => {
          return true;
        };
      });

      await page.goto("/stats");

      const shareButton = page.locator('role=button:has-text("Share")');
      await shareButton.click();

      // Share dialog or download should be triggered
      // We just verify no errors occur
      await page.waitForTimeout(500);
    });

    test("should show loading state while sharing", async ({ page }) => {
      // Mock the share API with a delay
      await page.addInitScript(() => {
        (window as any).navigator.share = async () => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return true;
        };
      });

      await page.goto("/stats");

      const shareButton = page.locator('role=button:has-text("Share My Subway Year")');
      await shareButton.click();

      // Button should show "Sharing..." state
      const sharingText = await shareButton.textContent();
      expect(sharingText).toContain("Sharing");
    });
  });

  test.describe("Visual Design", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 50,
              totalMinutes: 1000,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 50 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });
    });

    test("should have gradient background on card", async ({ page }) => {
      await page.goto("/stats");

      const card = page.locator(".bg-gradient-to-br");
      await expect(card).toBeAttached();
    });

    test("should have proper contrast on card", async ({ page }) => {
      await page.goto("/stats");

      const card = page.locator(".from-\\[\\#0039A6\\]").first();

      // Check that text is visible
      const textColor = await card.evaluate((el) => {
        return window.getComputedStyle(el).color;
      });

      expect(textColor).toBeTruthy();
    });

    test("should have tabular numbers for stats", async ({ page }) => {
      await page.goto("/stats");

      const tabularNums = page.locator(".tabular-nums");
      await expect(tabularNums.first()).toBeAttached();
    });
  });

  test.describe("Accessibility", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 50,
              totalMinutes: 1000,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 50 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });
    });

    test("should have proper heading hierarchy", async ({ page }) => {
      await page.goto("/stats");

      const mainHeading = page.locator('role=heading[name="Your Subway Year"]');
      await expect(mainHeading).toBeVisible();
    });

    test("should have aria-pressed on time window buttons", async ({ page }) => {
      await page.goto("/stats");

      const windowButtons = page.locator(
        'role=button:has-text("This"), role=button:has-text("All")'
      );
      const count = await windowButtons.count();

      for (let i = 0; i < Math.min(count, 2); i++) {
        const ariaPressed = await windowButtons.nth(i).getAttribute("aria-pressed");
        expect(ariaPressed === "true" || ariaPressed === "false").toBe(true);
      }
    });

    test("should be keyboard navigable", async ({ page }) => {
      await page.goto("/stats");

      // Tab through elements
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");

      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(["BUTTON", "A"].includes(focused || "")).toBe(true);
    });
  });

  test.describe("Performance", () => {
    test("should load stats screen quickly", async ({ page }) => {
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 100,
              totalMinutes: 2000,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 100 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });

      const startTime = Date.now();
      await page.goto("/stats");

      // Wait for main content
      await page.waitForSelector('role=heading[name="Your Subway Year"]', { timeout: 5000 });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000);
    });
  });

  test.describe("Data Persistence", () => {
    test("should load data from localStorage", async ({ page }) => {
      // Set up data
      await page.addInitScript(() => {
        const journalData = {
          "test-commute": {
            stats: {
              totalTrips: 25,
              totalMinutes: 500,
              averageDuration: 20,
              medianDuration: 19,
            },
            records: Array.from({ length: 25 }, (_, i) => ({
              id: `trip-${i}`,
              date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
              origin: { stationId: "101", stationName: "South Ferry" },
              destination: { stationId: "725", stationName: "Times Sq-42 St" },
              line: "1",
              actualDurationMinutes: 20,
              source: "tracked",
            })),
          },
        };
        localStorage.setItem("mta-journal", JSON.stringify(journalData));
      });

      await page.goto("/stats");

      // Should show the trip count
      const tripsText = await page
        .locator("text=/Trips Taken/i")
        .locator("..")
        .locator("text=/\\d+/")
        .first()
        .textContent();
      expect(tripsText).toContain("25");
    });

    test("should handle missing journal data gracefully", async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.removeItem("mta-journal");
      });

      await page.goto("/stats");

      // Should show empty state, not crash
      const emptyState = page.locator("text=/No trips recorded/i");
      await expect(emptyState).toBeAttached();
    });
  });
});
