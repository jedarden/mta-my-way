# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: line-diagram.e2e.ts >> Line Diagram Screen >> Accessibility >> should be keyboard navigable
- Location: line-diagram.e2e.ts:506:5

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
Call log:
  - waiting for locator('svg') to be visible

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
  407 | 
  408 |         const url = page.url();
  409 |         const navigated = /\/station\//.test(url);
  410 | 
  411 |         if (navigated) {
  412 |           expect(url).toMatch(/\/station\//);
  413 |         }
  414 |       }
  415 |     });
  416 |   });
  417 | 
  418 |   test.describe("Error Handling", () => {
  419 |     test("should handle invalid line ID gracefully", async ({ page }) => {
  420 |       await page.goto("/diagram/invalid-line-id");
  421 | 
  422 |       // Should show error or redirect
  423 |       const errorText = page.locator("text=/not found|error|invalid/i");
  424 |       const hasError = await errorText.count();
  425 | 
  426 |       if (hasError > 0) {
  427 |         await expect(errorText).toBeVisible();
  428 |       } else {
  429 |         // Might redirect to map or home
  430 |         const url = page.url();
  431 |         expect(url).not.toBe("/diagram/invalid-line-id");
  432 |       }
  433 |     });
  434 | 
  435 |     test("should handle offline state", async ({ page }) => {
  436 |       await page.context().setOffline(true);
  437 | 
  438 |       await page.goto("/diagram/1");
  439 | 
  440 |       // Should show offline banner
  441 |       const offlineBanner = page.locator("text=/offline|no connection/i");
  442 |       const hasOffline = await offlineBanner.count();
  443 | 
  444 |       if (hasOffline > 0) {
  445 |         await expect(offlineBanner.first()).toBeVisible();
  446 |       }
  447 | 
  448 |       // Cached diagram might still be visible
  449 |       const diagram = page.locator("svg");
  450 |       const hasDiagram = await diagram.count();
  451 | 
  452 |       if (hasDiagram > 0) {
  453 |         await expect(diagram).toBeAttached();
  454 |       }
  455 | 
  456 |       await page.context().setOffline(false);
  457 |     });
  458 | 
  459 |     test("should handle API failures gracefully", async ({ page }) => {
  460 |       // Intercept and fail API requests
  461 |       await page.route("**/api/positions/**", (route) => {
  462 |         route.abort();
  463 |       });
  464 | 
  465 |       await page.goto("/diagram/1");
  466 | 
  467 |       // Should still show diagram (stations) even without train data
  468 |       const diagram = page.locator("svg");
  469 |       await expect(diagram.first()).toBeAttached();
  470 |     });
  471 |   });
  472 | 
  473 |   test.describe("Accessibility", () => {
  474 |     test("should have proper heading structure", async ({ page }) => {
  475 |       const heading = page.locator(
  476 |         'role=heading[name="Line Diagram"], role=heading[name*="Train"]'
  477 |       );
  478 |       const hasHeading = await heading.count();
  479 | 
  480 |       if (hasHeading > 0) {
  481 |         await expect(heading.first()).toBeVisible();
  482 |       }
  483 |     });
  484 | 
  485 |     test("should have aria labels on interactive elements", async ({ page }) => {
  486 |       await page.waitForSelector("svg", { timeout: 5000 });
  487 | 
  488 |       // Check for aria labels on diagram elements
  489 |       const interactiveElements = page.locator("circle[aria-label], [role='button']");
  490 |       const hasElements = await interactiveElements.count();
  491 | 
  492 |       if (hasElements > 0) {
  493 |         const firstLabel = await interactiveElements.first().getAttribute("aria-label");
  494 |         expect(firstLabel || hasElements > 0).toBeTruthy();
  495 |       }
  496 |     });
  497 | 
  498 |     test("should announce train count and spacing", async ({ page }) => {
  499 |       await page.waitForSelector("svg", { timeout: 5000 });
  500 | 
  501 |       // Look for live region announcements
  502 |       const liveRegion = page.locator("[aria-live], [role='status']");
  503 |       await expect(liveRegion).toBeAttached();
  504 |     });
  505 | 
  506 |     test("should be keyboard navigable", async ({ page }) => {
> 507 |       await page.waitForSelector("svg", { timeout: 5000 });
      |                  ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  508 | 
  509 |       // Tab through elements
  510 |       await page.keyboard.press("Tab");
  511 | 
  512 |       const focused = await page.evaluate(() => document.activeElement?.tagName);
  513 |       expect(["BUTTON", "A", "CIRCLE", "svg"].includes(focused || "")).toBe(true);
  514 |     });
  515 |   });
  516 | 
  517 |   test.describe("Performance", () => {
  518 |     test("should load diagram quickly", async ({ page }) => {
  519 |       const startTime = Date.now();
  520 | 
  521 |       await page.goto("/diagram/1");
  522 | 
  523 |       await page.waitForSelector("svg", { timeout: 5000 });
  524 | 
  525 |       const loadTime = Date.now() - startTime;
  526 | 
  527 |       expect(loadTime).toBeLessThan(5000);
  528 |     });
  529 | 
  530 |     test("should handle large number of stations efficiently", async ({ page }) => {
  531 |       await page.goto("/diagram/1");
  532 | 
  533 |       // Even with many stations, should be responsive
  534 |       await page.waitForSelector("svg", { timeout: 5000 });
  535 | 
  536 |       // Try interacting
  537 |       const diagram = page.locator("svg").first();
  538 |       await diagram.click();
  539 | 
  540 |       await expect(diagram).toBeVisible();
  541 |     });
  542 |   });
  543 | 
  544 |   test.describe("Visual Design", () => {
  545 |     test("should use line color for diagram elements", async ({ page }) => {
  546 |       await page.waitForSelector("svg", { timeout: 5000 });
  547 | 
  548 |       // Check for line-colored elements
  549 |       const lineColored = page.locator("[style*='#EE352E'], [data-line='1'], [class*='line-1']");
  550 |       const hasColored = await lineColored.count();
  551 | 
  552 |       if (hasColored > 0) {
  553 |         await expect(lineColored.first()).toBeVisible();
  554 |       }
  555 |     });
  556 | 
  557 |     test("should show legend or key", async ({ page }) => {
  558 |       const legend = page.locator("[role='legend'], [class*='legend' i], [class*='key' i]");
  559 |       const hasLegend = await legend.count();
  560 | 
  561 |       if (hasLegend > 0) {
  562 |         await expect(legend.first()).toBeAttached();
  563 |       }
  564 |     });
  565 |   });
  566 | 
  567 |   test.describe("Full Stack Integration", () => {
  568 |     test("should fetch train positions from API", async ({ page }) => {
  569 |       const apiRequests: string[] = [];
  570 | 
  571 |       page.on("request", (request) => {
  572 |         if (request.url().includes("/api/positions")) {
  573 |           apiRequests.push(request.url());
  574 |         }
  575 |       });
  576 | 
  577 |       await page.goto("/diagram/1");
  578 | 
  579 |       await page.waitForSelector("svg", { timeout: 10000 });
  580 | 
  581 |       // Should make API request for positions
  582 |       expect(apiRequests.length).toBeGreaterThan(0);
  583 |     });
  584 | 
  585 |     test("should use cached data when offline", async ({ page }) => {
  586 |       // Load online first
  587 |       await page.goto("/diagram/1");
  588 |       await page.waitForSelector("svg", { timeout: 10000 });
  589 | 
  590 |       // Then go offline
  591 |       await page.context().setOffline(true);
  592 |       await page.reload();
  593 | 
  594 |       // Should still show diagram with cached data
  595 |       const diagram = page.locator("svg");
  596 |       await expect(diagram.first()).toBeAttached();
  597 | 
  598 |       await page.context().setOffline(false);
  599 |     });
  600 |   });
  601 | 
  602 |   test.describe("Train Spacing Analysis", () => {
  603 |     test("should indicate train bunching", async ({ page }) => {
  604 |       await page.waitForSelector("svg", { timeout: 10000 });
  605 | 
  606 |       // Look for bunching indicators (trains very close together)
  607 |       // This is visual, so we just check the diagram loads
```