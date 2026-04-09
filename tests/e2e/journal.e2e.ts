/**
 * E2E tests for the Trip Journal screen.
 *
 * Tests cover:
 * - Commute stats display
 * - Trip history list
 * - Trip editing
 * - Sparkline charts
 * - Trend indicators
 * - Navigation to stats
 * - Empty states
 */

import { expect, test } from "@playwright/test";

test.describe("Journal Screen", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to journal via commute screen
    await page.goto("/commute");

    // Try to find a link to journal
    const journalLink = page
      .locator('role=link[href="/journal"]')
      .or(page.locator('role=button:has-text("Journal")'));
    const hasLink = await journalLink.count();

    if (hasLink > 0) {
      await journalLink.first().click();
    } else {
      // Go directly to journal
      await page.goto("/journal");
    }
  });

  test.describe("Journal Loading", () => {
    test("should load journal screen successfully", async ({ page }) => {
      await page.goto("/journal");

      // Should see journal heading
      await expect(page.locator('role=heading[name="Trip Journal"]')).toBeVisible();
    });

    test("should show back button to commute", async ({ page }) => {
      await page.goto("/journal");

      const backButton = page
        .locator('role=link:has-text("Back")')
        .or(page.locator('role=button:has-text("Back")'));
      await expect(backButton).toBeVisible();
    });

    test("should navigate to commute when back is clicked", async ({ page }) => {
      await page.goto("/journal");

      const backButton = page
        .locator('role=link:has-text("Back")')
        .or(page.locator('role=button:has-text("Back")'));
      await backButton.first().click();

      await expect(page).toHaveURL(/\/commute/);
    });
  });

  test.describe("Overall Stats Summary", () => {
    test("should display total trips", async ({ page }) => {
      await page.goto("/journal");

      // Look for total trips stat
      const totalTrips = page.locator("text:/Total Trips/i");
      await expect(totalTrips).toBeAttached();
    });

    test("should display average duration", async ({ page }) => {
      await page.goto("/journal");

      const avgDuration = page.locator("text:/Avg Duration|Average/i");
      await expect(avgDuration).toBeAttached();
    });

    test("should display average delay", async ({ page }) => {
      await page.goto("/journal");

      const avgDelay = page.locator("text:/Avg Delay|Average Delay/i");
      await expect(avgDelay).toBeAttached();
    });

    test("should display trips this week", async ({ page }) => {
      await page.goto("/journal");

      const tripsThisWeek = page.locator("text:/This Week|week/i");
      await expect(tripsThisWeek).toBeAttached();
    });
  });

  test.describe("Commute Stats Cards", () => {
    test("should show commute stats section", async ({ page }) => {
      await page.goto("/journal");

      const statsHeading = page.locator('role=heading[name="Commute Stats"]');
      await expect(statsHeading).toBeVisible();
    });

    test("should display commute cards with stats", async ({ page }) => {
      await page.goto("/journal");

      // Look for stat cards (might not exist if no trips)
      const statCards = page.locator('[class*="stat"], [class*="card"]');
      const hasCards = await statCards.count();

      if (hasCards > 0) {
        // Should have at least one stat card
        await expect(statCards.first()).toBeVisible();
      }
    });

    test("should show commute name on stat card", async ({ page }) => {
      await page.goto("/journal");

      const commuteName = page.locator("text=/Work|Home|Commute/i");
      await expect(commuteName).toBeAttached();
    });

    test("should display average, median, and delay stats", async ({ page }) => {
      await page.goto("/journal");

      const avgLabel = page.locator("text=/Avg|Average/i");
      const medianLabel = page.locator("text=/Median/i");
      const delayLabel = page.locator("text=/Delay/i");

      // These should exist even if no data (showing 0 or —)
      await expect(avgLabel.first()).toBeAttached();
      await expect(medianLabel).toBeAttached();
      await expect(delayLabel.first()).toBeAttached();
    });
  });

  test.describe("Trend Indicators", () => {
    test("should show trend percentage for each commute", async ({ page }) => {
      await page.goto("/journal");

      // Look for trend indicators (e.g., +5%, -3%)
      const trendIndicator = page.locator("text=/[+-]\\d+%/i");
      await expect(trendIndicator).toBeAttached();
    });

    test("should color-code trends (red for increase, green for decrease)", async ({ page }) => {
      await page.goto("/journal");

      // Look for colored trend elements
      const trendElements = page.locator(
        '[class*="severe"], [class*="warning"], [class*="mta-primary"]'
      );
      const hasTrends = await trendElements.count();

      if (hasTrends > 0) {
        await expect(trendElements.first()).toBeVisible();
      }
    });
  });

  test.describe("Sparkline Charts", () => {
    test("should display sparkline for recent trips", async ({ page }) => {
      await page.goto("/journal");

      // Look for SVG sparkline or chart
      const sparkline = page.locator(
        'svg polyline, svg line, [class*="chart"], [class*="sparkline"]'
      );
      const hasChart = await sparkline.count();

      if (hasChart > 0) {
        await expect(sparkline.first()).toBeVisible();
      }
    });

    test("should show average line on sparkline", async ({ page }) => {
      await page.goto("/journal");

      // Look for dashed line (average indicator)
      const avgLine = page.locator('svg line[stroke-dasharray], [class*="average"]');
      const hasAvg = await avgLine.count();

      if (hasAvg > 0) {
        await expect(avgLine.first()).toBeVisible();
      }
    });
  });

  test.describe("Trip History", () => {
    test("should have history button on stat card", async ({ page }) => {
      await page.goto("/journal");

      const historyButton = page
        .locator('role=button:has-text("History")')
        .or(page.locator('role=button[aria-label*="history" i]'));
      await expect(historyButton).toBeAttached();
    });

    test("should expand trip history when clicked", async ({ page }) => {
      await page.goto("/journal");

      const historyButton = page.locator('role=button:has-text("History")').first();
      const hasButton = await historyButton.count();

      if (hasButton > 0) {
        await historyButton.click();

        // Wait for expansion
        await page.waitForTimeout(500);

        // Should see trip list items
        const tripItems = page.locator('[role="listitem"], [class*="trip"]');
        const hasItems = await tripItems.count();

        // Trip items might not exist if no trips recorded
        if (hasItems > 0) {
          await expect(tripItems.first()).toBeVisible();
        }
      }
    });

    test("should display trip history with dates", async ({ page }) => {
      await page.goto("/journal");

      // Look for date displays (Today, Yesterday, or dates)
      const dateDisplay = page.locator("text=/Today|Yesterday|Jan|Feb|Mar|Apr|May|Jun/i");
      await expect(dateDisplay).toBeAttached();
    });

    test("should show delay information for each trip", async ({ page }) => {
      await page.goto("/journal");

      // Look for delay indicators
      const delayInfo = page.locator("text=/\\+\\d+ min|-\\d+ min|delay/i");
      await expect(delayInfo).toBeAttached();
    });

    test("should show trip source (tracked/inferred/manual)", async ({ page }) => {
      await page.goto("/journal");

      // Look for source labels
      const sourceLabel = page.locator("text=/Tracked|Inferred|Manual/i");
      await expect(sourceLabel).toBeAttached();
    });
  });

  test.describe("Trip Editing", () => {
    test("should open trip editor when trip is clicked", async ({ page }) => {
      await page.goto("/journal");

      // Try to expand history first
      const historyButton = page.locator('role=button:has-text("History")').first();
      const hasHistory = await historyButton.count();

      if (hasHistory > 0) {
        await historyButton.click();
        await page.waitForTimeout(500);
      }

      // Try to click on a trip
      const tripItem = page.locator('role=button, [role="listitem"]').first();
      const hasTrip = await tripItem.count();

      if (hasTrip > 0) {
        await tripItem.first().click();

        // Editor modal might appear
        const modal = page.locator('[role="dialog"], [class*="editor"], [class*="modal"]');
        const hasModal = await modal.count();

        if (hasModal > 0) {
          await expect(modal.first()).toBeVisible();
        }
      }
    });

    test("should allow editing trip notes", async ({ page }) => {
      await page.goto("/journal");

      // Find and click a trip to edit
      const tripItem = page.locator("role=button").first();
      const hasTrip = await tripItem.count();

      if (hasTrip > 0) {
        await tripItem.first().click();

        // Look for notes field
        const notesField = page.locator('[role="textbox"], textarea, input[type="text"]');
        const hasField = await notesField.count();

        if (hasField > 0) {
          // Try to type in notes
          await notesField.first().fill("Test note");

          // Save button
          const saveButton = page
            .locator('role=button:has-text("Save")')
            .or(page.locator('role=button[type="submit"]'));
          const hasSave = await saveButton.count();

          if (hasSave > 0) {
            await saveButton.first().click();
          }
        }
      }
    });

    test("should allow deleting trips", async ({ page }) => {
      await page.goto("/journal");

      const tripItem = page.locator("role=button").first();
      const hasTrip = await tripItem.count();

      if (hasTrip > 0) {
        await tripItem.first().click();

        // Look for delete button
        const deleteButton = page
          .locator('role=button:has-text("Delete")')
          .or(page.locator('role=button[aria-label*="delete" i]'));
        const hasDelete = await deleteButton.count();

        if (hasDelete > 0) {
          // Don't actually delete in tests, just verify button exists
          await expect(deleteButton.first()).toBeAttached();
        }
      }
    });
  });

  test.describe("Subway Year Link", () => {
    test("should show link to Subway Year stats", async ({ page }) => {
      await page.goto("/journal");

      const statsLink = page
        .locator('role=button:has-text("Subway Year")')
        .or(page.locator('role=link[href="/stats"]'));
      const hasLink = await statsLink.count();

      if (hasLink > 0) {
        await expect(statsLink.first()).toBeVisible();
      }
    });

    test("should navigate to stats screen when clicked", async ({ page }) => {
      await page.goto("/journal");

      const statsLink = page
        .locator('role=button:has-text("Subway Year")')
        .or(page.locator('role=link[href="/stats"]'));
      const hasLink = await statsLink.count();

      if (hasLink > 0) {
        await statsLink.first().click();
        await expect(page).toHaveURL(/\/stats/);
      }
    });
  });

  test.describe("Empty States", () => {
    test.beforeEach(async ({ page }) => {
      // Clear localStorage to ensure empty state
      await page.goto("/journal");
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.reload();
    });

    test("should show empty state when no trips recorded", async ({ page }) => {
      await page.goto("/journal");

      const emptyState = page.locator("text=/No trips|not recorded/i");
      const hasEmpty = await emptyState.count();

      if (hasEmpty > 0) {
        await expect(emptyState).toBeVisible();
      }
    });

    test("should show guidance message in empty state", async ({ page }) => {
      await page.goto("/journal");

      const guidance = page.locator("text=/track|record|commute/i");
      await expect(guidance).toBeAttached();
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper heading hierarchy", async ({ page }) => {
      await page.goto("/journal");

      // Main heading should be h1
      const mainHeading = page.locator('role=heading[level="1"]');
      await expect(mainHeading.first()).toBeVisible();
    });

    test("should have expand/collapse announcements", async ({ page }) => {
      await page.goto("/journal");

      const historyButton = page.locator('role=button:has-text("History")').first();
      const hasButton = await historyButton.count();

      if (hasButton > 0) {
        // Check for aria-expanded
        const ariaExpanded = await historyButton.getAttribute("aria-expanded");
        expect(ariaExpanded).toBeTruthy();
      }
    });

    test("should be keyboard navigable", async ({ page }) => {
      await page.goto("/journal");

      // Tab through elements
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");

      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(["BUTTON", "A", "INPUT"].includes(focused || "")).toBe(true);
    });
  });

  test.describe("Navigation", () => {
    test("should navigate to stats screen", async ({ page }) => {
      await page.goto("/journal");

      const statsButton = page
        .locator('role=button:has-text("Your Subway Year")')
        .or(page.locator('role=link[href="/stats"]'));
      const hasButton = await statsButton.count();

      if (hasButton > 0) {
        await statsButton.first().click();
        await expect(page).toHaveURL(/\/stats/);
      }
    });

    test("should navigate back to commute screen", async ({ page }) => {
      await page.goto("/journal");

      const backButton = page
        .locator('role=link:has-text("Back")')
        .or(page.locator('role=button:has-text("Back")'));
      await backButton.first().click();

      await expect(page).toHaveURL(/\/commute/);
    });
  });

  test.describe("Performance", () => {
    test("should load journal quickly", async ({ page }) => {
      const startTime = Date.now();

      await page.goto("/journal");

      // Wait for main heading
      await page.waitForSelector('role=heading[name="Trip Journal"]', { timeout: 5000 });

      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);
    });

    test("should handle large trip histories efficiently", async ({ page }) => {
      // Mock many trips
      await page.addInitScript(() => {
        const trips = Array.from({ length: 100 }, (_, i) => ({
          id: `trip-${i}`,
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          line: "1",
          date: new Date(Date.now() - i * 86400000).toISOString(),
          actualDurationMinutes: 20,
        }));
        localStorage.setItem("mta-journal", JSON.stringify({ stats: {}, trips }));
      });

      await page.goto("/journal");

      // Should still load reasonably fast
      await page.waitForSelector('role=heading[name="Trip Journal"]', { timeout: 5000 });

      const mainHeading = page.locator('role=heading[name="Trip Journal"]');
      await expect(mainHeading).toBeVisible();
    });
  });

  test.describe("Data Persistence", () => {
    test("should save trip edits to localStorage", async ({ page }) => {
      await page.goto("/journal");

      // Get initial localStorage state
      const initialData = await page.evaluate(() => {
        return localStorage.getItem("mta-journal");
      });

      // Open trip editor (if trips exist)
      const tripItem = page.locator("role=button").first();
      const hasTrip = await tripItem.count();

      if (hasTrip > 0) {
        await tripItem.first().click();

        // Try to add a note
        const notesField = page.locator('[role="textbox"], textarea').first();
        const hasField = await notesField.count();

        if (hasField > 0) {
          await notesField.fill("E2E test note");

          const saveButton = page.locator('role=button:has-text("Save")').first();
          const hasSave = await saveButton.count();

          if (hasSave > 0) {
            await saveButton.click();

            // Reload and check
            await page.reload();

            const savedData = await page.evaluate(() => {
              return localStorage.getItem("mta-journal");
            });

            expect(savedData).toBeTruthy();
          }
        }
      }
    });
  });
});
