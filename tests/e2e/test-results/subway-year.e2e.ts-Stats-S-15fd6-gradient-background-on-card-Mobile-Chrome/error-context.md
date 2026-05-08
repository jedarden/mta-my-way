# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: subway-year.e2e.ts >> Stats / Subway Year Screen >> Visual Design >> should have gradient background on card
- Location: subway-year.e2e.ts:505:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('.bg-gradient-to-br')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('.bg-gradient-to-br')

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
        - generic [ref=f1e2]:
          - generic [ref=f1e6]:
            - button "Play" [disabled] [ref=f1e7]
            - button "Reset" [disabled] [ref=f1e8]
            - generic [ref=f1e9]: 0 / 0
            - generic [ref=f1e10]:
              - generic [ref=f1e11]: "Speed:"
              - combobox [ref=f1e12]:
                - option "0.5x"
                - option "1x" [selected]
                - option "2x"
                - option "4x"
          - generic [ref=f1e13]:
            - generic [ref=f1e14]: Failed to fetch
            - button "Retry" [ref=f1e15] [cursor=pointer]
          - link "AI Code Battle" [ref=f1e16] [cursor=pointer]:
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
  409 |     test.beforeEach(async ({ page }) => {
  410 |       await page.addInitScript(() => {
  411 |         const journalData = {
  412 |           "test-commute": {
  413 |             stats: {
  414 |               totalTrips: 50,
  415 |               totalMinutes: 1000,
  416 |               averageDuration: 20,
  417 |               medianDuration: 19,
  418 |             },
  419 |             records: Array.from({ length: 50 }, (_, i) => ({
  420 |               id: `trip-${i}`,
  421 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  422 |               origin: { stationId: "101", stationName: "South Ferry" },
  423 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  424 |               line: "1",
  425 |               actualDurationMinutes: 20,
  426 |               source: "tracked",
  427 |             })),
  428 |           },
  429 |         };
  430 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  431 |       });
  432 |     });
  433 | 
  434 |     test("should have share button", async ({ page }) => {
  435 |       await page.goto("/stats");
  436 | 
  437 |       const shareButton = page.locator('role=button:has-text("Share")');
  438 |       await expect(shareButton).toBeVisible();
  439 |     });
  440 | 
  441 |     test("should trigger share when button is clicked", async ({ page }) => {
  442 |       // Mock the share API
  443 |       await page.addInitScript(() => {
  444 |         (window as any).navigator.share = async () => {
  445 |           return true;
  446 |         };
  447 |       });
  448 | 
  449 |       await page.goto("/stats");
  450 | 
  451 |       const shareButton = page.locator('role=button:has-text("Share")');
  452 |       await shareButton.click();
  453 | 
  454 |       // Share dialog or download should be triggered
  455 |       // We just verify no errors occur
  456 |       await page.waitForTimeout(500);
  457 |     });
  458 | 
  459 |     test("should show loading state while sharing", async ({ page }) => {
  460 |       // Mock the share API with a delay
  461 |       await page.addInitScript(() => {
  462 |         (window as any).navigator.share = async () => {
  463 |           await new Promise((resolve) => setTimeout(resolve, 1000));
  464 |           return true;
  465 |         };
  466 |       });
  467 | 
  468 |       await page.goto("/stats");
  469 | 
  470 |       const shareButton = page.locator('role=button:has-text("Share My Subway Year")');
  471 |       await shareButton.click();
  472 | 
  473 |       // Button should show "Sharing..." state
  474 |       const sharingText = await shareButton.textContent();
  475 |       expect(sharingText).toContain("Sharing");
  476 |     });
  477 |   });
  478 | 
  479 |   test.describe("Visual Design", () => {
  480 |     test.beforeEach(async ({ page }) => {
  481 |       await page.addInitScript(() => {
  482 |         const journalData = {
  483 |           "test-commute": {
  484 |             stats: {
  485 |               totalTrips: 50,
  486 |               totalMinutes: 1000,
  487 |               averageDuration: 20,
  488 |               medianDuration: 19,
  489 |             },
  490 |             records: Array.from({ length: 50 }, (_, i) => ({
  491 |               id: `trip-${i}`,
  492 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  493 |               origin: { stationId: "101", stationName: "South Ferry" },
  494 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  495 |               line: "1",
  496 |               actualDurationMinutes: 20,
  497 |               source: "tracked",
  498 |             })),
  499 |           },
  500 |         };
  501 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  502 |       });
  503 |     });
  504 | 
  505 |     test("should have gradient background on card", async ({ page }) => {
  506 |       await page.goto("/stats");
  507 | 
  508 |       const card = page.locator(".bg-gradient-to-br");
> 509 |       await expect(card).toBeAttached();
      |                          ^ Error: expect(locator).toBeAttached() failed
  510 |     });
  511 | 
  512 |     test("should have proper contrast on card", async ({ page }) => {
  513 |       await page.goto("/stats");
  514 | 
  515 |       const card = page.locator(".from-\\[\\#0039A6\\]").first();
  516 | 
  517 |       // Check that text is visible
  518 |       const textColor = await card.evaluate((el) => {
  519 |         return window.getComputedStyle(el).color;
  520 |       });
  521 | 
  522 |       expect(textColor).toBeTruthy();
  523 |     });
  524 | 
  525 |     test("should have tabular numbers for stats", async ({ page }) => {
  526 |       await page.goto("/stats");
  527 | 
  528 |       const tabularNums = page.locator(".tabular-nums");
  529 |       await expect(tabularNums.first()).toBeAttached();
  530 |     });
  531 |   });
  532 | 
  533 |   test.describe("Accessibility", () => {
  534 |     test.beforeEach(async ({ page }) => {
  535 |       await page.addInitScript(() => {
  536 |         const journalData = {
  537 |           "test-commute": {
  538 |             stats: {
  539 |               totalTrips: 50,
  540 |               totalMinutes: 1000,
  541 |               averageDuration: 20,
  542 |               medianDuration: 19,
  543 |             },
  544 |             records: Array.from({ length: 50 }, (_, i) => ({
  545 |               id: `trip-${i}`,
  546 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  547 |               origin: { stationId: "101", stationName: "South Ferry" },
  548 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  549 |               line: "1",
  550 |               actualDurationMinutes: 20,
  551 |               source: "tracked",
  552 |             })),
  553 |           },
  554 |         };
  555 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  556 |       });
  557 |     });
  558 | 
  559 |     test("should have proper heading hierarchy", async ({ page }) => {
  560 |       await page.goto("/stats");
  561 | 
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
```