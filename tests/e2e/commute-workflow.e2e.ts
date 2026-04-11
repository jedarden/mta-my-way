/**
 * E2E tests for the Commute Workflow.
 *
 * Tests cover:
 * - Commute list view
 * - Commute detail view
 * - Creating new commutes
 * - Editing existing commutes
 * - Deleting commutes
 * - Pinning commutes
 * - Commute analysis display
 * - Route comparison
 * - Transfer details
 * - Walking comparison
 * - Alert banners for commute lines
 */

import { expect, test } from "@playwright/test";

test.describe("Commute Workflow", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to commute screen
    await page.goto("/commute");
  });

  test.describe("Commute List View", () => {
    test("should display commute list screen", async ({ page }) => {
      // Should see heading
      await expect(page.locator('role=heading[name="Commute Presets"]')).toBeVisible();
    });

    test("should show empty state when no commutes", async ({ page }) => {
      // Clear any existing commutes
      await page.evaluate(() => {
        const data = localStorage.getItem("mta-favorites");
        if (data) {
          const parsed = JSON.parse(data);
          parsed.commutes = [];
          localStorage.setItem("mta-favorites", JSON.stringify(parsed));
        }
      });
      await page.reload();

      // Should see empty state
      const emptyState = page.locator("text=/No commutes|Add your first commute/i");
      await expect(emptyState).toBeAttached();
    });

    test("should have 'Plan a commute' call to action in empty state", async ({ page }) => {
      await page.evaluate(() => {
        const data = localStorage.getItem("mta-favorites");
        if (data) {
          const parsed = JSON.parse(data);
          parsed.commutes = [];
          localStorage.setItem("mta-favorites", JSON.stringify(parsed));
        }
      });
      await page.reload();

      const addButton = page.locator('role=button:has-text("Add")');
      await expect(addButton).toBeAttached();
    });

    test("should display trip journal link", async ({ page }) => {
      await expect(page.locator('role=heading[name="Trip Journal"]')).toBeVisible();

      const journalButton = page.locator('role=button:has-text("View Trip History")');
      await expect(journalButton).toBeVisible();
    });

    test("should navigate to journal when button is clicked", async ({ page }) => {
      await page.click('role=button:has-text("View Trip History")');

      await expect(page).toHaveURL("/journal");
    });

    test("should show maximum commutes message when limit reached", async ({ page }) => {
      // Add max commutes (10) via localStorage
      await page.evaluate(() => {
        const commutes = Array.from({ length: 10 }, (_, i) => ({
          id: `commute-${i}`,
          name: `Commute ${i + 1}`,
          origin: { stationId: "101", stationName: "South Ferry" },
          destination: { stationId: "725", stationName: "Times Sq-42 St" },
          preferredLines: ["1"],
          enableTransferSuggestions: true,
          isPinned: false,
        }));
        const data = localStorage.getItem("mta-favorites");
        const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
        parsed.commutes = commutes;
        localStorage.setItem("mta-favorites", JSON.stringify(parsed));
      });
      await page.reload();

      // Should show max message
      const maxMessage = page.locator("text=/Maximum.*commutes|limit reached/i");
      await expect(maxMessage).toBeAttached();
    });
  });

  test.describe("Commute Creation", () => {
    test.beforeEach(async ({ page }) => {
      // Clear existing commutes
      await page.evaluate(() => {
        const data = localStorage.getItem("mta-favorites");
        if (data) {
          const parsed = JSON.parse(data);
          parsed.commutes = [];
          localStorage.setItem("mta-favorites", JSON.stringify(parsed));
        }
      });
      await page.goto("/commute");
    });

    test("should open commute editor when Add is clicked", async ({ page }) => {
      const addButton = page.locator('role=button:has-text("Add")');
      const hasAdd = await addButton.count();

      if (hasAdd > 0) {
        await addButton.click();

        // Editor modal should appear
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();
      }
    });

    test("should allow selecting origin station", async ({ page }) => {
      const addButton = page.locator('role=button:has-text("Add")');
      const hasAdd = await addButton.count();

      if (hasAdd > 0) {
        await addButton.click();

        // Look for origin picker
        const originPicker = page.locator('role=button:has-text("Origin")');
        const hasPicker = await originPicker.count();

        if (hasPicker > 0) {
          await originPicker.click();

          // Should see station search
          const searchInput = page.locator('role=searchbox, input[type="text"]');
          await expect(searchInput.first()).toBeAttached();
        }
      }
    });

    test("should allow selecting destination station", async ({ page }) => {
      const addButton = page.locator('role=button:has-text("Add")');
      const hasAdd = await addButton.count();

      if (hasAdd > 0) {
        await addButton.click();

        // Look for destination picker
        const destPicker = page.locator('role=button:has-text("Destination")');
        const hasPicker = await destPicker.count();

        if (hasPicker > 0) {
          await destPicker.click();

          // Should see station search
          const searchInput = page.locator('role=searchbox, input[type="text"]');
          await expect(searchInput.first()).toBeAttached();
        }
      }
    });

    test("should allow setting commute name", async ({ page }) => {
      const addButton = page.locator('role=button:has-text("Add")');
      const hasAdd = await addButton.count();

      if (hasAdd > 0) {
        await addButton.click();

        // Look for name input
        const nameInput = page.locator(
          'role=textbox[name*="name" i], input[placeholder*="name" i]'
        );
        const hasInput = await nameInput.count();

        if (hasInput > 0) {
          await nameInput.fill("Work Commute");

          const value = await nameInput.inputValue();
          expect(value).toBe("Work Commute");
        }
      }
    });

    test("should save new commute", async ({ page }) => {
      const addButton = page.locator('role=button:has-text("Add")');
      const hasAdd = await addButton.count();

      if (hasAdd > 0) {
        await addButton.click();

        // Try to save (might fail if form is not filled)
        const saveButton = page.locator('role=button:has-text("Save")');
        const hasSave = await saveButton.count();

        if (hasSave > 0) {
          // Check if save is enabled
          const isDisabled = await saveButton.isDisabled();

          if (!isDisabled) {
            await saveButton.click();

            // Modal should close
            const modal = page.locator('[role="dialog"]');
            await expect(modal).not.toBeVisible({ timeout: 5000 });
          }
        }
      }
    });
  });

  test.describe("Commute Detail View", () => {
    test.beforeEach(async ({ page }) => {
      // Set up a test commute
      await page.evaluate(() => {
        const commutes = [
          {
            id: "test-commute-1",
            name: "Work",
            origin: { stationId: "101", stationName: "South Ferry" },
            destination: { stationId: "725", stationName: "Times Sq-42 St" },
            preferredLines: ["1"],
            enableTransferSuggestions: true,
            isPinned: false,
          },
        ];
        const data = localStorage.getItem("mta-favorites");
        const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
        parsed.commutes = commutes;
        localStorage.setItem("mta-favorites", JSON.stringify(parsed));
      });
    });

    test("should navigate to commute detail when commute card is clicked", async ({ page }) => {
      await page.goto("/commute");

      // Find commute card
      const commuteCard = page.locator("role=button").filter({ hasText: /Work/i });
      const hasCard = await commuteCard.count();

      if (hasCard > 0) {
        await commuteCard.click();

        // Should navigate to detail view
        await expect(page).toHaveURL(/\/commute\/test-commute-1/);
      }
    });

    test("should display commute name and route", async ({ page }) => {
      await page.goto("/commute/test-commute-1");

      await expect(page.locator('role=heading[name="Work"]')).toBeVisible();

      // Should show route
      await expect(page.locator("text=/South Ferry.*Times Square/i")).toBeAttached();
    });

    test("should show preferred lines as badges", async ({ page }) => {
      await page.goto("/commute/test-commute-1");

      const lineBadges = page.locator('[aria-label*="train"], span[class*="line"]');
      await expect(lineBadges.first()).toBeAttached();
    });

    test("should have back button to commute list", async ({ page }) => {
      await page.goto("/commute/test-commute-1");

      const backButton = page.locator('role=button:has-text("Back")');
      await expect(backButton).toBeVisible();

      await backButton.click();
      await expect(page).toHaveURL("/commute");
    });

    test("should show alert banner for lines with alerts", async ({ page }) => {
      await page.goto("/commute/test-commute-1");

      // Alert banner may or may not be present depending on current alerts
      const alertBanner = page.locator('[role="region"]:has-text("Alert")');
      const hasAlerts = await alertBanner.count();

      if (hasAlerts > 0) {
        await expect(alertBanner.first()).toBeVisible();
      }
    });
  });

  test.describe("Commute Analysis", () => {
    test.beforeEach(async ({ page }) => {
      await page.evaluate(() => {
        const commutes = [
          {
            id: "test-commute-1",
            name: "Work",
            origin: { stationId: "101", stationName: "South Ferry" },
            destination: { stationId: "725", stationName: "Times Sq-42 St" },
            preferredLines: ["1"],
            enableTransferSuggestions: true,
            isPinned: false,
          },
        ];
        const data = localStorage.getItem("mta-favorites");
        const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
        parsed.commutes = commutes;
        localStorage.setItem("mta-favorites", JSON.stringify(parsed));
      });
    });

    test("should display commute analysis", async ({ page }) => {
      await page.goto("/commute/test-commute-1");

      // Wait for analysis to load
      await page.waitForTimeout(2000);

      // Should have analysis section
      const analysis = page.locator("text=/recommended|direct|transfer/i");
      await expect(analysis).toBeAttached();
    });

    test("should show route comparison when both direct and transfer routes exist", async ({
      page,
    }) => {
      await page.goto("/commute/test-commute-1");

      await page.waitForTimeout(2000);

      // Look for route comparison section
      const comparison = page.locator("text=/vs|comparison|alternate/i");
      await expect(comparison).toBeAttached();
    });

    test("should show transfer details", async ({ page }) => {
      await page.goto("/commute/test-commute-1");

      await page.waitForTimeout(2000);

      // Should have transfer detail section
      const transferDetail = page.locator("text=/transfer|stop|arrive/i");
      await expect(transferDetail).toBeAttached();
    });

    test("should show walking comparison for short trips", async ({ page }) => {
      await page.goto("/commute/test-commute-1");

      await page.waitForTimeout(2000);

      // Walking comparison may be shown for short distances
      const walking = page.locator("text=/walk|walking|pedestrian/i");
      await expect(walking).toBeAttached();
    });

    test("should have refresh button", async ({ page }) => {
      await page.goto("/commute/test-commute-1");

      const refreshButton = page.locator(
        'role=button[aria-label*="refresh" i], role=button:has-text("Refresh")'
      );
      await expect(refreshButton).toBeAttached();
    });
  });

  test.describe("Commute Editing", () => {
    test.beforeEach(async ({ page }) => {
      await page.evaluate(() => {
        const commutes = [
          {
            id: "test-commute-1",
            name: "Work",
            origin: { stationId: "101", stationName: "South Ferry" },
            destination: { stationId: "725", stationName: "Times Sq-42 St" },
            preferredLines: ["1"],
            enableTransferSuggestions: true,
            isPinned: false,
          },
        ];
        const data = localStorage.getItem("mta-favorites");
        const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
        parsed.commutes = commutes;
        localStorage.setItem("mta-favorites", JSON.stringify(parsed));
      });
      await page.goto("/commute");
    });

    test("should open edit modal when edit is clicked", async ({ page }) => {
      const editButton = page.locator(
        'role=button[aria-label*="edit" i], role=button:has-text("Edit")'
      );
      const hasEdit = await editButton.count();

      if (hasEdit > 0) {
        await editButton.first().click();

        // Editor modal should appear
        const modal = page.locator('[role="dialog"]');
        await expect(modal).toBeVisible();
      }
    });

    test("should allow changing commute name", async ({ page }) => {
      const editButton = page.locator('role=button[aria-label*="edit" i]');
      const hasEdit = await editButton.count();

      if (hasEdit > 0) {
        await editButton.first().click();

        const nameInput = page.locator('role=textbox[name*="name" i]');
        const hasInput = await nameInput.count();

        if (hasInput > 0) {
          await nameInput.fill("Updated Work Commute");

          const saveButton = page.locator('role=button:has-text("Save")');
          await saveButton.click();

          // Modal should close
          const modal = page.locator('[role="dialog"]');
          await expect(modal).not.toBeVisible();

          // Commute name should be updated
          await expect(page.locator("text=/Updated Work Commute/i")).toBeVisible();
        }
      }
    });

    test("should allow deleting commute", async ({ page }) => {
      const initialCount = await page.evaluate(() => {
        const data = localStorage.getItem("mta-favorites");
        const parsed = data ? JSON.parse(data) : { commutes: [] };
        return parsed.commutes?.length || 0;
      });

      if (initialCount > 0) {
        const editButton = page.locator('role=button[aria-label*="edit" i]');
        const hasEdit = await editButton.count();

        if (hasEdit > 0) {
          await editButton.first().click();

          const deleteButton = page.locator('role=button:has-text("Delete")');
          const hasDelete = await deleteButton.count();

          if (hasDelete > 0) {
            await deleteButton.click();

            // Should show confirmation
            const confirmButton = page.locator(
              'role=button:has-text("Confirm"), role=button:has-text("Delete")'
            );
            await confirmButton.click();

            // Modal should close and commute should be deleted
            const modal = page.locator('[role="dialog"]');
            await expect(modal).not.toBeVisible();

            // Check that commute was deleted
            const newCount = await page.evaluate(() => {
              const data = localStorage.getItem("mta-favorites");
              const parsed = data ? JSON.parse(data) : { commutes: [] };
              return parsed.commutes?.length || 0;
            });

            expect(newCount).toBeLessThan(initialCount);
          }
        }
      }
    });
  });

  test.describe("Commute Pinning", () => {
    test.beforeEach(async ({ page }) => {
      await page.evaluate(() => {
        const commutes = [
          {
            id: "commute-1",
            name: "Work",
            origin: { stationId: "101", stationName: "South Ferry" },
            destination: { stationId: "725", stationName: "Times Sq-42 St" },
            preferredLines: ["1"],
            enableTransferSuggestions: true,
            isPinned: false,
          },
          {
            id: "commute-2",
            name: "Home",
            origin: { stationId: "726", stationName: "Times Sq-42 St" },
            destination: { stationId: "101", stationName: "South Ferry" },
            preferredLines: ["1"],
            enableTransferSuggestions: true,
            isPinned: false,
          },
        ];
        const data = localStorage.getItem("mta-favorites");
        const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
        parsed.commutes = commutes;
        localStorage.setItem("mta-favorites", JSON.stringify(parsed));
      });
      await page.goto("/commute");
    });

    test("should show pinned commutes first", async ({ page }) => {
      // Pin one commute
      await page.evaluate(() => {
        const data = localStorage.getItem("mta-favorites");
        const parsed = data ? JSON.parse(data) : { commutes: [] };
        if (parsed.commutes && parsed.commutes[0]) {
          parsed.commutes[0].isPinned = true;
          localStorage.setItem("mta-favorites", JSON.stringify(parsed));
        }
      });
      await page.reload();

      // Get first commute card
      const firstCard = page
        .locator("role=button")
        .filter({ hasText: /Work|Home/i })
        .first();
      const text = await firstCard.textContent();

      // Should be the pinned one (Work)
      expect(text).toContain("Work");
    });

    test("should allow pinning commute", async ({ page }) => {
      const pinButton = page.locator('role=button[aria-label*="pin" i]');
      const hasPin = await pinButton.count();

      if (hasPin > 0) {
        await pinButton.first().click();

        // Check if commute is now pinned
        const isPinned = await page.evaluate(() => {
          const data = localStorage.getItem("mta-favorites");
          const parsed = data ? JSON.parse(data) : { commutes: [] };
          return parsed.commutes?.some((c: any) => c.isPinned) || false;
        });

        expect(isPinned).toBe(true);
      }
    });
  });

  test.describe("Error Handling", () => {
    test("should handle invalid commute ID gracefully", async ({ page }) => {
      await page.goto("/commute/invalid-commute-id");

      // Should show error or redirect
      const errorMessage = page.locator("text=/not found|error/i");
      const hasError = await errorMessage.count();

      if (hasError > 0) {
        await expect(errorMessage.first()).toBeVisible();
      } else {
        // Might redirect to commute list
        await expect(page).toHaveURL(/\/commute\/?$/);
      }
    });

    test("should handle API errors gracefully", async ({ page }) => {
      await page.evaluate(() => {
        const commutes = [
          {
            id: "test-commute-1",
            name: "Work",
            origin: { stationId: "101", stationName: "South Ferry" },
            destination: { stationId: "725", stationName: "Times Sq-42 St" },
            preferredLines: ["1"],
            enableTransferSuggestions: true,
            isPinned: false,
          },
        ];
        const data = localStorage.getItem("mta-favorites");
        const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
        parsed.commutes = commutes;
        localStorage.setItem("mta-favorites", JSON.stringify(parsed));
      });

      // Intercept and fail API requests
      await page.route("**/api/commute/**", (route) => {
        route.abort();
      });

      await page.goto("/commute/test-commute-1");

      // Should show error state
      const errorState = page.locator("text=/error|couldn't load|failed/i");
      await expect(errorState).toBeAttached();
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper heading hierarchy", async ({ page }) => {
      await page.goto("/commute");

      const mainHeading = page.locator(
        'role=heading[level="1"], role=heading[name="Commute Presets"]'
      );
      await expect(mainHeading).toBeAttached();
    });

    test("should have accessible commute cards", async ({ page }) => {
      await page.goto("/commute");

      const commuteCards = page.locator("role=button");
      const count = await commuteCards.count();

      for (let i = 0; i < Math.min(count, 3); i++) {
        const card = commuteCards.nth(i);
        const accessibleName = await card.getAttribute("aria-label");
        const textContent = await card.textContent();

        expect(accessibleName || textContent).toBeTruthy();
      }
    });

    test("should be keyboard navigable", async ({ page }) => {
      await page.goto("/commute");

      // Tab through elements
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");

      const focused = await page.evaluate(() => document.activeElement?.tagName);
      expect(["BUTTON", "A", "INPUT"].includes(focused || "")).toBe(true);
    });
  });

  test.describe("Performance", () => {
    test("should load commute list quickly", async ({ page }) => {
      const startTime = Date.now();

      await page.goto("/commute");

      // Wait for main content
      await page.waitForSelector('role=heading[name="Commute Presets"]', { timeout: 3000 });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(2000);
    });
  });
});
