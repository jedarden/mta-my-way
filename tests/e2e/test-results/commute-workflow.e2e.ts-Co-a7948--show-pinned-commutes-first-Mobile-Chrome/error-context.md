# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: commute-workflow.e2e.ts >> Commute Workflow >> Commute Pinning >> should show pinned commutes first
- Location: commute-workflow.e2e.ts:508:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.textContent: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('role=button').filter({ hasText: /Work|Home/i }).first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#app"
  - navigation [ref=e3]:
    - generic [ref=e4]:
      - link "⚔️ AI Code Battle" [ref=e5] [cursor=pointer]:
        - /url: "#/"
      - button "Toggle menu" [ref=e6] [cursor=pointer]: ☰
  - generic [ref=e8]:
    - link "🏠 Home" [ref=e9] [cursor=pointer]:
      - /url: "#/"
    - link "👀 Watch" [ref=e10] [cursor=pointer]:
      - /url: "#/watch"
    - link "⚔️ Compete" [ref=e11] [cursor=pointer]:
      - /url: "#/compete"
    - link "🏆 Board" [ref=e12] [cursor=pointer]:
      - /url: "#/leaderboard"
  - generic [ref=e14]:
    - generic [ref=e15]:
      - heading "AI Code Battle" [level=1] [ref=e16]
      - paragraph [ref=e17]: Bots compete. Strategies evolve. You watch.
      - generic [ref=e18]:
        - link "Watch Battles" [ref=e19] [cursor=pointer]:
          - /url: "#/watch/replays"
        - link "Build a Bot" [ref=e20] [cursor=pointer]:
          - /url: "#/compete/register"
    - generic [ref=e21]:
      - iframe [ref=e23]:
        - generic [ref=f3e2]:
          - generic [ref=f3e6]:
            - button "Play" [disabled] [ref=f3e7]
            - button "Reset" [disabled] [ref=f3e8]
            - generic [ref=f3e9]: 0 / 0
            - generic [ref=f3e10]:
              - generic [ref=f3e11]: "Speed:"
              - combobox [ref=f3e12]:
                - option "0.5x"
                - option "1x" [selected]
                - option "2x"
                - option "4x"
          - generic [ref=f3e13]:
            - generic [ref=f3e14]: Failed to fetch
            - button "Retry" [ref=f3e15] [cursor=pointer]
          - link "AI Code Battle" [ref=f3e16] [cursor=pointer]:
            - /url: https://ai-code-battle.pages.dev
      - generic [ref=e24]:
        - paragraph [ref=e25]:
          - strong [ref=e26]: SwarmBot
          - text: vs
          - strong [ref=e27]: HunterBot
          - text: vs
          - strong [ref=e28]: GathererBot
          - text: vs
          - strong [ref=e29]: RusherBot
          - text: vs
          - strong [ref=e30]: GuardianBot
          - text: vs
          - strong [ref=e31]: RandomBot
          - text: "— Winner:"
          - strong [ref=e32]: SwarmBot
        - link "Watch Full Replay →" [ref=e33] [cursor=pointer]:
          - /url: "#/watch/replay?url=/replays/m_test_6p_v1.json.gz"
    - generic [ref=e34]:
      - generic [ref=e35]:
        - heading "Top 5 Bots" [level=2] [ref=e36]
        - generic [ref=e37]:
          - generic [ref=e38]:
            - generic [ref=e39]: "#1"
            - link "HunterBot" [ref=e40] [cursor=pointer]:
              - /url: "#/bot/b_457b876ca1c4"
            - generic [ref=e41]: "1710"
          - generic [ref=e42]:
            - generic [ref=e43]: "#2"
            - link "SwarmBot" [ref=e44] [cursor=pointer]:
              - /url: "#/bot/b_62beeb03c196"
            - generic [ref=e45]: "1680"
          - generic [ref=e46]:
            - generic [ref=e47]: "#3"
            - link "GathererBot" [ref=e48] [cursor=pointer]:
              - /url: "#/bot/b_2fa5681bf0ff"
            - generic [ref=e49]: "1640"
          - generic [ref=e50]:
            - generic [ref=e51]: "#4"
            - link "GuardianBot" [ref=e52] [cursor=pointer]:
              - /url: "#/bot/b_f3af8d6177eb"
            - generic [ref=e53]: "1590"
          - generic [ref=e54]:
            - generic [ref=e55]: "#5"
            - link "RusherBot" [ref=e56] [cursor=pointer]:
              - /url: "#/bot/b_ae1845729bbf"
            - generic [ref=e57]: "1520"
        - link "Full leaderboard →" [ref=e58] [cursor=pointer]:
          - /url: "#/leaderboard"
      - generic [ref=e59]:
        - heading "Latest Stories" [level=2] [ref=e60]
        - link "Week 13 Meta Report — Season 1 2026-03-29" [ref=e62] [cursor=pointer]:
          - /url: "#/blog/meta-week-13-season-1"
          - generic [ref=e63]: Week 13 Meta Report — Season 1
          - generic [ref=e64]: 2026-03-29
        - link "All stories →" [ref=e65] [cursor=pointer]:
          - /url: "#/blog"
```

# Test source

```ts
  425 |           await expect(modal).not.toBeVisible();
  426 | 
  427 |           // Commute name should be updated
  428 |           await expect(page.locator("text=/Updated Work Commute/i")).toBeVisible();
  429 |         }
  430 |       }
  431 |     });
  432 | 
  433 |     test("should allow deleting commute", async ({ page }) => {
  434 |       const initialCount = await page.evaluate(() => {
  435 |         const data = localStorage.getItem("mta-favorites");
  436 |         const parsed = data ? JSON.parse(data) : { commutes: [] };
  437 |         return parsed.commutes?.length || 0;
  438 |       });
  439 | 
  440 |       if (initialCount > 0) {
  441 |         const editButton = page.locator('role=button[aria-label*="edit" i]');
  442 |         const hasEdit = await editButton.count();
  443 | 
  444 |         if (hasEdit > 0) {
  445 |           await editButton.first().click();
  446 | 
  447 |           const deleteButton = page.locator('role=button:has-text("Delete")');
  448 |           const hasDelete = await deleteButton.count();
  449 | 
  450 |           if (hasDelete > 0) {
  451 |             await deleteButton.click();
  452 | 
  453 |             // Should show confirmation
  454 |             const confirmButton = page.locator(
  455 |               'role=button:has-text("Confirm"), role=button:has-text("Delete")'
  456 |             );
  457 |             await confirmButton.click();
  458 | 
  459 |             // Modal should close and commute should be deleted
  460 |             const modal = page.locator('[role="dialog"]');
  461 |             await expect(modal).not.toBeVisible();
  462 | 
  463 |             // Check that commute was deleted
  464 |             const newCount = await page.evaluate(() => {
  465 |               const data = localStorage.getItem("mta-favorites");
  466 |               const parsed = data ? JSON.parse(data) : { commutes: [] };
  467 |               return parsed.commutes?.length || 0;
  468 |             });
  469 | 
  470 |             expect(newCount).toBeLessThan(initialCount);
  471 |           }
  472 |         }
  473 |       }
  474 |     });
  475 |   });
  476 | 
  477 |   test.describe("Commute Pinning", () => {
  478 |     test.beforeEach(async ({ page }) => {
  479 |       await page.evaluate(() => {
  480 |         const commutes = [
  481 |           {
  482 |             id: "commute-1",
  483 |             name: "Work",
  484 |             origin: { stationId: "101", stationName: "South Ferry" },
  485 |             destination: { stationId: "725", stationName: "Times Sq-42 St" },
  486 |             preferredLines: ["1"],
  487 |             enableTransferSuggestions: true,
  488 |             isPinned: false,
  489 |           },
  490 |           {
  491 |             id: "commute-2",
  492 |             name: "Home",
  493 |             origin: { stationId: "726", stationName: "Times Sq-42 St" },
  494 |             destination: { stationId: "101", stationName: "South Ferry" },
  495 |             preferredLines: ["1"],
  496 |             enableTransferSuggestions: true,
  497 |             isPinned: false,
  498 |           },
  499 |         ];
  500 |         const data = localStorage.getItem("mta-favorites");
  501 |         const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
  502 |         parsed.commutes = commutes;
  503 |         localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  504 |       });
  505 |       await page.goto("/commute");
  506 |     });
  507 | 
  508 |     test("should show pinned commutes first", async ({ page }) => {
  509 |       // Pin one commute
  510 |       await page.evaluate(() => {
  511 |         const data = localStorage.getItem("mta-favorites");
  512 |         const parsed = data ? JSON.parse(data) : { commutes: [] };
  513 |         if (parsed.commutes && parsed.commutes[0]) {
  514 |           parsed.commutes[0].isPinned = true;
  515 |           localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  516 |         }
  517 |       });
  518 |       await page.reload();
  519 | 
  520 |       // Get first commute card
  521 |       const firstCard = page
  522 |         .locator("role=button")
  523 |         .filter({ hasText: /Work|Home/i })
  524 |         .first();
> 525 |       const text = await firstCard.textContent();
      |                                    ^ Error: locator.textContent: Test timeout of 30000ms exceeded.
  526 | 
  527 |       // Should be the pinned one (Work)
  528 |       expect(text).toContain("Work");
  529 |     });
  530 | 
  531 |     test("should allow pinning commute", async ({ page }) => {
  532 |       const pinButton = page.locator('role=button[aria-label*="pin" i]');
  533 |       const hasPin = await pinButton.count();
  534 | 
  535 |       if (hasPin > 0) {
  536 |         await pinButton.first().click();
  537 | 
  538 |         // Check if commute is now pinned
  539 |         const isPinned = await page.evaluate(() => {
  540 |           const data = localStorage.getItem("mta-favorites");
  541 |           const parsed = data ? JSON.parse(data) : { commutes: [] };
  542 |           return parsed.commutes?.some((c: any) => c.isPinned) || false;
  543 |         });
  544 | 
  545 |         expect(isPinned).toBe(true);
  546 |       }
  547 |     });
  548 |   });
  549 | 
  550 |   test.describe("Error Handling", () => {
  551 |     test("should handle invalid commute ID gracefully", async ({ page }) => {
  552 |       await page.goto("/commute/invalid-commute-id");
  553 | 
  554 |       // Should show error or redirect
  555 |       const errorMessage = page.locator("text=/not found|error/i");
  556 |       const hasError = await errorMessage.count();
  557 | 
  558 |       if (hasError > 0) {
  559 |         await expect(errorMessage.first()).toBeVisible();
  560 |       } else {
  561 |         // Might redirect to commute list
  562 |         await expect(page).toHaveURL(/\/commute\/?$/);
  563 |       }
  564 |     });
  565 | 
  566 |     test("should handle API errors gracefully", async ({ page }) => {
  567 |       await page.evaluate(() => {
  568 |         const commutes = [
  569 |           {
  570 |             id: "test-commute-1",
  571 |             name: "Work",
  572 |             origin: { stationId: "101", stationName: "South Ferry" },
  573 |             destination: { stationId: "725", stationName: "Times Sq-42 St" },
  574 |             preferredLines: ["1"],
  575 |             enableTransferSuggestions: true,
  576 |             isPinned: false,
  577 |           },
  578 |         ];
  579 |         const data = localStorage.getItem("mta-favorites");
  580 |         const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
  581 |         parsed.commutes = commutes;
  582 |         localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  583 |       });
  584 | 
  585 |       // Intercept and fail API requests
  586 |       await page.route("**/api/commute/**", (route) => {
  587 |         route.abort();
  588 |       });
  589 | 
  590 |       await page.goto("/commute/test-commute-1");
  591 | 
  592 |       // Should show error state
  593 |       const errorState = page.locator("text=/error|couldn't load|failed/i");
  594 |       await expect(errorState).toBeAttached();
  595 |     });
  596 |   });
  597 | 
  598 |   test.describe("Accessibility", () => {
  599 |     test("should have proper heading hierarchy", async ({ page }) => {
  600 |       await page.goto("/commute");
  601 | 
  602 |       const mainHeading = page.locator(
  603 |         'role=heading[level="1"], role=heading[name="Commute Presets"]'
  604 |       );
  605 |       await expect(mainHeading).toBeAttached();
  606 |     });
  607 | 
  608 |     test("should have accessible commute cards", async ({ page }) => {
  609 |       await page.goto("/commute");
  610 | 
  611 |       const commuteCards = page.locator("role=button");
  612 |       const count = await commuteCards.count();
  613 | 
  614 |       for (let i = 0; i < Math.min(count, 3); i++) {
  615 |         const card = commuteCards.nth(i);
  616 |         const accessibleName = await card.getAttribute("aria-label");
  617 |         const textContent = await card.textContent();
  618 | 
  619 |         expect(accessibleName || textContent).toBeTruthy();
  620 |       }
  621 |     });
  622 | 
  623 |     test("should be keyboard navigable", async ({ page }) => {
  624 |       await page.goto("/commute");
  625 | 
```