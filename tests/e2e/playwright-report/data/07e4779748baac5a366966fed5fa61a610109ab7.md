# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fare-tracking.e2e.ts >> Fare Tracking >> Empty State >> should show fare tracker after first ride is tracked
- Location: fare-tracking.e2e.ts:353:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/OMNY Fare Cap/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/OMNY Fare Cap/i')

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
        - generic [ref=f2e2]:
          - generic [ref=f2e6]:
            - button "Play" [disabled] [ref=f2e7]
            - button "Reset" [disabled] [ref=f2e8]
            - generic [ref=f2e9]: 0 / 0
            - generic [ref=f2e10]:
              - generic [ref=f2e11]: "Speed:"
              - combobox [ref=f2e12]:
                - option "0.5x"
                - option "1x" [selected]
                - option "2x"
                - option "4x"
          - generic [ref=f2e13]:
            - generic [ref=f2e14]: Failed to fetch
            - button "Retry" [ref=f2e15] [cursor=pointer]
          - link "AI Code Battle" [ref=f2e16] [cursor=pointer]:
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
  281 |           weeklyRides: 11,
  282 |           monthlyRides: 44,
  283 |           currentFare: 2.9,
  284 |           unlimitedPassPrice: 132,
  285 |           lastReset: new Date().toISOString(),
  286 |         };
  287 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  288 |       });
  289 | 
  290 |       await page.goto("/");
  291 | 
  292 |       // Should show nudge banner
  293 |       const nudge = page.locator("text=/Take.*for free rides/i");
  294 |       await expect(nudge).toBeAttached();
  295 |     });
  296 | 
  297 |     test("should not show nudge when cap is reached", async ({ page }) => {
  298 |       await page.addInitScript(() => {
  299 |         const fareData = {
  300 |           weeklyRides: 12,
  301 |           monthlyRides: 48,
  302 |           currentFare: 2.9,
  303 |           unlimitedPassPrice: 132,
  304 |           lastReset: new Date().toISOString(),
  305 |         };
  306 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  307 |       });
  308 | 
  309 |       await page.goto("/");
  310 | 
  311 |       // Should not show nudge banner
  312 |       const nudge = page.locator("text=/Take 1 more ride/i");
  313 |       const hasNudge = await nudge.count();
  314 |       expect(hasNudge).toBe(0);
  315 |     });
  316 | 
  317 |     test("should not show nudge when far from cap", async ({ page }) => {
  318 |       await page.addInitScript(() => {
  319 |         const fareData = {
  320 |           weeklyRides: 5,
  321 |           monthlyRides: 20,
  322 |           currentFare: 2.9,
  323 |           unlimitedPassPrice: 132,
  324 |           lastReset: new Date().toISOString(),
  325 |         };
  326 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  327 |       });
  328 | 
  329 |       await page.goto("/");
  330 | 
  331 |       // Should not show nudge banner
  332 |       const nudge = page.locator("text=/Take.*more.*for free/i");
  333 |       const hasNudge = await nudge.count();
  334 |       expect(hasNudge).toBe(0);
  335 |     });
  336 |   });
  337 | 
  338 |   test.describe("Empty State", () => {
  339 |     test("should not show fare tracker when no rides tracked", async ({ page }) => {
  340 |       await page.addInitScript(() => {
  341 |         localStorage.removeItem("mta-fare");
  342 |       });
  343 | 
  344 |       await page.goto("/");
  345 | 
  346 |       // Fare tracker should not be visible
  347 |       const fareTracker = page.locator("text=/OMNY Fare Cap/i");
  348 |       const hasTracker = await fareTracker.count();
  349 | 
  350 |       expect(hasTracker).toBe(0);
  351 |     });
  352 | 
  353 |     test("should show fare tracker after first ride is tracked", async ({ page }) => {
  354 |       await page.addInitScript(() => {
  355 |         localStorage.removeItem("mta-fare");
  356 |       });
  357 | 
  358 |       await page.goto("/");
  359 | 
  360 |       // Initially no tracker
  361 |       let fareTracker = page.locator("text=/OMNY Fare Cap/i");
  362 |       let hasTracker = await fareTracker.count();
  363 |       expect(hasTracker).toBe(0);
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
> 381 |       await expect(fareTracker).toBeAttached();
      |                                 ^ Error: expect(locator).toBeAttached() failed
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
  464 |       await expect(progressBar).toBeAttached();
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
```