# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: subway-year.e2e.ts >> Stats / Subway Year Screen >> Data Persistence >> should load data from localStorage
- Location: subway-year.e2e.ts:629:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.textContent: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('text=/Trips Taken/i').locator('..').locator('text=/\\d+/').first()

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
      - generic [ref=e6]:
        - link "Watch" [ref=e7] [cursor=pointer]:
          - /url: "#/watch"
        - link "Compete" [ref=e8] [cursor=pointer]:
          - /url: "#/compete"
        - link "Leaderboard" [ref=e9] [cursor=pointer]:
          - /url: "#/leaderboard"
        - link "Evolution" [ref=e10] [cursor=pointer]:
          - /url: "#/evolution"
        - link "Blog" [ref=e11] [cursor=pointer]:
          - /url: "#/blog"
        - link "Season 1" [ref=e12] [cursor=pointer]:
          - /url: "#/season/1"
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
        - generic [ref=f1e2]:
          - generic [ref=f1e6]:
            - button "Play" [disabled] [ref=f1e7]
            - button "Reset" [disabled] [ref=f1e8]
            - generic [ref=f1e9]: 0 / 0
            - generic [ref=f1e11]:
              - generic [ref=f1e12]: "Speed:"
              - combobox [ref=f1e13]:
                - option "0.5x"
                - option "1x" [selected]
                - option "2x"
                - option "4x"
          - generic [ref=f1e14]:
            - generic [ref=f1e15]: Failed to fetch
            - button "Retry" [ref=f1e16] [cursor=pointer]
          - link "AI Code Battle" [ref=f1e17] [cursor=pointer]:
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
  562 |       const mainHeading = page.locator('role=heading[name="Your Subway Year"]');
  563 |       await expect(mainHeading).toBeVisible();
  564 |     });
  565 | 
  566 |     test("should have aria-pressed on time window buttons", async ({ page }) => {
  567 |       await page.goto("/stats");
  568 | 
  569 |       const windowButtons = page.locator(
  570 |         'role=button:has-text("This"), role=button:has-text("All")'
  571 |       );
  572 |       const count = await windowButtons.count();
  573 | 
  574 |       for (let i = 0; i < Math.min(count, 2); i++) {
  575 |         const ariaPressed = await windowButtons.nth(i).getAttribute("aria-pressed");
  576 |         expect(ariaPressed === "true" || ariaPressed === "false").toBe(true);
  577 |       }
  578 |     });
  579 | 
  580 |     test("should be keyboard navigable", async ({ page }) => {
  581 |       await page.goto("/stats");
  582 | 
  583 |       // Tab through elements
  584 |       await page.keyboard.press("Tab");
  585 |       await page.keyboard.press("Tab");
  586 | 
  587 |       const focused = await page.evaluate(() => document.activeElement?.tagName);
  588 |       expect(["BUTTON", "A"].includes(focused || "")).toBe(true);
  589 |     });
  590 |   });
  591 | 
  592 |   test.describe("Performance", () => {
  593 |     test("should load stats screen quickly", async ({ page }) => {
  594 |       await page.addInitScript(() => {
  595 |         const journalData = {
  596 |           "test-commute": {
  597 |             stats: {
  598 |               totalTrips: 100,
  599 |               totalMinutes: 2000,
  600 |               averageDuration: 20,
  601 |               medianDuration: 19,
  602 |             },
  603 |             records: Array.from({ length: 100 }, (_, i) => ({
  604 |               id: `trip-${i}`,
  605 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  606 |               origin: { stationId: "101", stationName: "South Ferry" },
  607 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  608 |               line: "1",
  609 |               actualDurationMinutes: 20,
  610 |               source: "tracked",
  611 |             })),
  612 |           },
  613 |         };
  614 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  615 |       });
  616 | 
  617 |       const startTime = Date.now();
  618 |       await page.goto("/stats");
  619 | 
  620 |       // Wait for main content
  621 |       await page.waitForSelector('role=heading[name="Your Subway Year"]', { timeout: 5000 });
  622 | 
  623 |       const loadTime = Date.now() - startTime;
  624 |       expect(loadTime).toBeLessThan(3000);
  625 |     });
  626 |   });
  627 | 
  628 |   test.describe("Data Persistence", () => {
  629 |     test("should load data from localStorage", async ({ page }) => {
  630 |       // Set up data
  631 |       await page.addInitScript(() => {
  632 |         const journalData = {
  633 |           "test-commute": {
  634 |             stats: {
  635 |               totalTrips: 25,
  636 |               totalMinutes: 500,
  637 |               averageDuration: 20,
  638 |               medianDuration: 19,
  639 |             },
  640 |             records: Array.from({ length: 25 }, (_, i) => ({
  641 |               id: `trip-${i}`,
  642 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  643 |               origin: { stationId: "101", stationName: "South Ferry" },
  644 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  645 |               line: "1",
  646 |               actualDurationMinutes: 20,
  647 |               source: "tracked",
  648 |             })),
  649 |           },
  650 |         };
  651 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  652 |       });
  653 | 
  654 |       await page.goto("/stats");
  655 | 
  656 |       // Should show the trip count
  657 |       const tripsText = await page
  658 |         .locator("text=/Trips Taken/i")
  659 |         .locator("..")
  660 |         .locator("text=/\\d+/")
  661 |         .first()
> 662 |         .textContent();
      |          ^ Error: locator.textContent: Test timeout of 30000ms exceeded.
  663 |       expect(tripsText).toContain("25");
  664 |     });
  665 | 
  666 |     test("should handle missing journal data gracefully", async ({ page }) => {
  667 |       await page.addInitScript(() => {
  668 |         localStorage.removeItem("mta-journal");
  669 |       });
  670 | 
  671 |       await page.goto("/stats");
  672 | 
  673 |       // Should show empty state, not crash
  674 |       const emptyState = page.locator("text=/No trips recorded/i");
  675 |       await expect(emptyState).toBeAttached();
  676 |     });
  677 |   });
  678 | });
  679 | 
```