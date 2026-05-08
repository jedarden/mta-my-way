# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.e2e.ts >> Settings Screen >> Error Handling >> should handle localStorage quota exceeded gracefully
- Location: settings.e2e.ts:505:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('role=heading[name="Settings"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('role=heading[name="Settings"]')

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
  419 |       }
  420 |     });
  421 | 
  422 |     test("should announce setting changes", async ({ page }) => {
  423 |       await page.goto("/settings");
  424 | 
  425 |       // Change a setting
  426 |       const toggle = page.locator('[role="switch"], [type="checkbox"]').first();
  427 |       const hasToggle = await toggle.count();
  428 | 
  429 |       if (hasToggle > 0) {
  430 |         // Look for live region that announces changes
  431 |         const liveRegion = page.locator('[aria-live], [role="status"]');
  432 |         await expect(liveRegion).toBeAttached();
  433 | 
  434 |         await toggle.click();
  435 | 
  436 |         // Change should be announced (or at least live region exists)
  437 |       }
  438 |     });
  439 | 
  440 |     test("should be keyboard navigable", async ({ page }) => {
  441 |       await page.goto("/settings");
  442 | 
  443 |       // Tab through settings
  444 |       for (let i = 0; i < 5; i++) {
  445 |         await page.keyboard.press("Tab");
  446 |       }
  447 | 
  448 |       const focused = await page.evaluate(() => {
  449 |         const el = document.activeElement;
  450 |         return el?.tagName || "";
  451 |       });
  452 | 
  453 |       expect(["BUTTON", "INPUT", "SELECT", "A"].includes(focused)).toBe(true);
  454 |     });
  455 |   });
  456 | 
  457 |   test.describe("Settings Persistence", () => {
  458 |     test("should save settings to localStorage", async ({ page }) => {
  459 |       await page.goto("/settings");
  460 | 
  461 |       // Change a setting
  462 |       const toggle = page.locator('[role="switch"], [type="checkbox"]').first();
  463 |       const hasToggle = await toggle.count();
  464 | 
  465 |       if (hasToggle > 0) {
  466 |         await toggle.click();
  467 | 
  468 |         // Check localStorage
  469 |         const settings = await page.evaluate(() => {
  470 |           return JSON.parse(localStorage.getItem("mta-settings") || "{}");
  471 |         });
  472 | 
  473 |         expect(Object.keys(settings).length).toBeGreaterThan(0);
  474 |       }
  475 |     });
  476 | 
  477 |     test("should load settings from localStorage", async ({ page }) => {
  478 |       // Set a setting in localStorage
  479 |       await page.addInitScript(() => {
  480 |         localStorage.setItem(
  481 |           "mta-settings",
  482 |           JSON.stringify({
  483 |             theme: "dark",
  484 |             showUnassignedTrips: true,
  485 |             refreshInterval: 30,
  486 |           })
  487 |         );
  488 |       });
  489 | 
  490 |       await page.goto("/settings");
  491 | 
  492 |       // Settings should be reflected in UI
  493 |       const darkOption = page.locator(
  494 |         '[aria-pressed="true"]:has-text("Dark"), [data-selected="true"]:has-text("Dark")'
  495 |       );
  496 |       const hasDark = await darkOption.count();
  497 | 
  498 |       if (hasDark > 0) {
  499 |         await expect(darkOption.first()).toBeVisible();
  500 |       }
  501 |     });
  502 |   });
  503 | 
  504 |   test.describe("Error Handling", () => {
  505 |     test("should handle localStorage quota exceeded gracefully", async ({ page }) => {
  506 |       // Fill localStorage
  507 |       await page.addInitScript(() => {
  508 |         try {
  509 |           localStorage.setItem("test", "x".repeat(10 * 1024 * 1024));
  510 |         } catch (e) {
  511 |           // Quota exceeded
  512 |         }
  513 |       });
  514 | 
  515 |       await page.goto("/settings");
  516 | 
  517 |       // Should still show settings
  518 |       const heading = page.locator('role=heading[name="Settings"]');
> 519 |       await expect(heading).toBeVisible();
      |                             ^ Error: expect(locator).toBeVisible() failed
  520 |     });
  521 | 
  522 |     test("should show error message if settings fail to load", async ({ page }) => {
  523 |       // Intercept and fail localStorage access
  524 |       await page.addInitScript(() => {
  525 |         const originalGetItem = Storage.prototype.getItem;
  526 |         Storage.prototype.getItem = function () {
  527 |           throw new Error("Storage failed");
  528 |         };
  529 |       });
  530 | 
  531 |       await page.goto("/settings");
  532 | 
  533 |       // Should show some kind of error or fallback
  534 |       const errorText = page.locator("text=/error|failed|unavailable/i");
  535 |       const hasError = await errorText.count();
  536 | 
  537 |       // Either shows error or falls back to defaults
  538 |       const heading = page.locator('role=heading[name="Settings"]');
  539 |       await expect(heading).toBeAttached();
  540 |     });
  541 |   });
  542 | 
  543 |   test.describe("Navigation", () => {
  544 |     test("should navigate to home via bottom nav", async ({ page }) => {
  545 |       await page.goto("/settings");
  546 | 
  547 |       const homeButton = page.locator('role=link[name="Home"]');
  548 |       const hasHome = await homeButton.count();
  549 | 
  550 |       if (hasHome > 0) {
  551 |         await homeButton.click();
  552 |         await expect(page).toHaveURL("/");
  553 |       }
  554 |     });
  555 | 
  556 |     test("should navigate to other screens via bottom nav", async ({ page }) => {
  557 |       await page.goto("/settings");
  558 | 
  559 |       const navButtons = page.locator('[role="navigation"] role="link"]');
  560 |       const count = await navButtons.count();
  561 | 
  562 |       if (count > 0) {
  563 |         await navButtons.first().click();
  564 | 
  565 |         // Should navigate away
  566 |         const url = page.url();
  567 |         expect(url).not.toBe("/settings");
  568 |       }
  569 |     });
  570 |   });
  571 | });
  572 | 
```