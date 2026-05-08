# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fare-tracking.e2e.ts >> Fare Tracking >> Accessibility >> should have proper ARIA labels on progress bar
- Location: fare-tracking.e2e.ts:449:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('[role="progressbar"]')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('[role="progressbar"]')

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
  364 | 
  365 |       // Add a ride
  366 |       await page.evaluate(() => {
  367 |         const fareData = {
  368 |           weeklyRides: 1,
  369 |           monthlyRides: 1,
  370 |           currentFare: 2.9,
  371 |           unlimitedPassPrice: 132,
  372 |           lastReset: new Date().toISOString(),
  373 |         };
  374 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  375 |       });
  376 | 
  377 |       await page.reload();
  378 | 
  379 |       // Now tracker should be visible
  380 |       fareTracker = page.locator("text=/OMNY Fare Cap/i");
  381 |       await expect(fareTracker).toBeAttached();
  382 |     });
  383 |   });
  384 | 
  385 |   test.describe("Data Persistence", () => {
  386 |     test("should persist fare data across page reloads", async ({ page }) => {
  387 |       // Set initial data
  388 |       await page.addInitScript(() => {
  389 |         const fareData = {
  390 |           weeklyRides: 7,
  391 |           monthlyRides: 28,
  392 |           currentFare: 2.9,
  393 |           unlimitedPassPrice: 132,
  394 |           lastReset: new Date().toISOString(),
  395 |         };
  396 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  397 |       });
  398 | 
  399 |       await page.goto("/");
  400 | 
  401 |       // Verify initial data
  402 |       const ridesText = await page.locator("text=/\\d+\\/12/i").first().textContent();
  403 |       expect(ridesText).toContain("7");
  404 | 
  405 |       // Reload page
  406 |       await page.reload();
  407 | 
  408 |       // Data should persist
  409 |       const ridesTextAfter = await page.locator("text=/\\d+\\/12/i").first().textContent();
  410 |       expect(ridesTextAfter).toContain("7");
  411 |     });
  412 | 
  413 |     test("should update when rides are added", async ({ page }) => {
  414 |       await page.addInitScript(() => {
  415 |         const fareData = {
  416 |           weeklyRides: 7,
  417 |           monthlyRides: 28,
  418 |           currentFare: 2.9,
  419 |           unlimitedPassPrice: 132,
  420 |           lastReset: new Date().toISOString(),
  421 |         };
  422 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  423 |       });
  424 | 
  425 |       await page.goto("/");
  426 | 
  427 |       // Add a ride
  428 |       await page.evaluate(() => {
  429 |         const data = localStorage.getItem("mta-fare");
  430 |         if (data) {
  431 |           const fareData = JSON.parse(data);
  432 |           fareData.weeklyRides = 8;
  433 |           fareData.monthlyRides = 29;
  434 |           localStorage.setItem("mta-fare", JSON.stringify(fareData));
  435 |         }
  436 |       });
  437 | 
  438 |       // Trigger update (navigate and back)
  439 |       await page.goto("/search");
  440 |       await page.goBack();
  441 | 
  442 |       // Should show updated count
  443 |       const ridesText = await page.locator("text=/\\d+\\/12/i").first().textContent();
  444 |       expect(ridesText).toContain("8");
  445 |     });
  446 |   });
  447 | 
  448 |   test.describe("Accessibility", () => {
  449 |     test("should have proper ARIA labels on progress bar", async ({ page }) => {
  450 |       await page.addInitScript(() => {
  451 |         const fareData = {
  452 |           weeklyRides: 8,
  453 |           monthlyRides: 32,
  454 |           currentFare: 2.9,
  455 |           unlimitedPassPrice: 132,
  456 |           lastReset: new Date().toISOString(),
  457 |         };
  458 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  459 |       });
  460 | 
  461 |       await page.goto("/");
  462 | 
  463 |       const progressBar = page.locator('[role="progressbar"]');
> 464 |       await expect(progressBar).toBeAttached();
      |                                 ^ Error: expect(locator).toBeAttached() failed
  465 | 
  466 |       // Should have proper ARIA attributes
  467 |       const ariaValueNow = await progressBar.getAttribute("aria-valuenow");
  468 |       const ariaValueMin = await progressBar.getAttribute("aria-valuemin");
  469 |       const ariaValueMax = await progressBar.getAttribute("aria-valuemax");
  470 |       const ariaLabel = await progressBar.getAttribute("aria-label");
  471 | 
  472 |       expect(ariaValueNow).toBeTruthy();
  473 |       expect(ariaValueMin).toBe("0");
  474 |       expect(ariaValueMax).toBe("12");
  475 |       expect(ariaLabel).toBeTruthy();
  476 |     });
  477 | 
  478 |     test("should announce progress to screen readers", async ({ page }) => {
  479 |       await page.addInitScript(() => {
  480 |         const fareData = {
  481 |           weeklyRides: 8,
  482 |           monthlyRides: 32,
  483 |           currentFare: 2.9,
  484 |           unlimitedPassPrice: 132,
  485 |           lastReset: new Date().toISOString(),
  486 |         };
  487 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  488 |       });
  489 | 
  490 |       await page.goto("/");
  491 | 
  492 |       // Progress section should be accessible
  493 |       const progressSection = page.locator("text=/8.*12|rides/i");
  494 |       await expect(progressSection).toBeAttached();
  495 |     });
  496 |   });
  497 | 
  498 |   test.describe("Visual Design", () => {
  499 |     test("should use appropriate colors for progress states", async ({ page }) => {
  500 |       await page.addInitScript(() => {
  501 |         const fareData = {
  502 |           weeklyRides: 8,
  503 |           monthlyRides: 32,
  504 |           currentFare: 2.9,
  505 |           unlimitedPassPrice: 132,
  506 |           lastReset: new Date().toISOString(),
  507 |         };
  508 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  509 |       });
  510 | 
  511 |       await page.goto("/");
  512 | 
  513 |       // Progress bar fill should have a color class
  514 |       const progressFill = page.locator('[role="progressbar"] > div');
  515 |       await expect(progressFill).toBeAttached();
  516 | 
  517 |       // Check that it has a background color
  518 |       const backgroundColor = await progressFill.first().evaluate((el) => {
  519 |         return window.getComputedStyle(el).backgroundColor;
  520 |       });
  521 | 
  522 |       expect(backgroundColor).toBeTruthy();
  523 |       expect(backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  524 |     });
  525 | 
  526 |     test("should show nudge with distinct styling", async ({ page }) => {
  527 |       await page.addInitScript(() => {
  528 |         const fareData = {
  529 |           weeklyRides: 10,
  530 |           monthlyRides: 40,
  531 |           currentFare: 2.9,
  532 |           unlimitedPassPrice: 132,
  533 |           lastReset: new Date().toISOString(),
  534 |         };
  535 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  536 |       });
  537 | 
  538 |       await page.goto("/");
  539 | 
  540 |       // Nudge should have distinct background/border
  541 |       const nudge = page.locator("text=/Take.*more.*for free/i").locator("..");
  542 |       const hasNudge = await nudge.count();
  543 | 
  544 |       if (hasNudge > 0) {
  545 |         const backgroundColor = await nudge.first().evaluate((el) => {
  546 |           return window.getComputedStyle(el).backgroundColor;
  547 |         });
  548 | 
  549 |         expect(backgroundColor).toBeTruthy();
  550 |       }
  551 |     });
  552 |   });
  553 | });
  554 | 
```