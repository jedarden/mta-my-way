# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-journeys.e2e.ts >> Full Stack Workflows >> complete workflow: view health status
- Location: user-journeys.e2e.ts:421:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/status|uptime|feeds/i')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=/status|uptime|feeds/i')

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
  325 | 
  326 | test.describe("Commute Journey", () => {
  327 |   test.beforeEach(async ({ page }) => {
  328 |     await page.goto("/");
  329 |   });
  330 | 
  331 |   test("should view commutes section on home", async ({ page }) => {
  332 |     // Check if commutes section exists
  333 |     const commutesSection = page.locator('role=heading[name="Your Commutes"]');
  334 |     const hasCommutes = await commutesSection.count();
  335 | 
  336 |     if (hasCommutes > 0) {
  337 |       await expect(commutesSection).toBeVisible();
  338 | 
  339 |       // Should see "View all" link
  340 |       await expect(page.locator('role=link[name="View all commutes"]')).toBeVisible();
  341 |     }
  342 |   });
  343 | 
  344 |   test("should navigate to commute details", async ({ page }) => {
  345 |     await page.goto("/");
  346 | 
  347 |     // Look for commute cards
  348 |     const commuteCards = page.locator('role=article:has-text("commute")');
  349 |     const hasCommutes = await commuteCards.count();
  350 | 
  351 |     if (hasCommutes > 0) {
  352 |       await commuteCards.first().click();
  353 |       await expect(page).toHaveURL(/\/commute\//);
  354 |     }
  355 |   });
  356 | 
  357 |   test("should navigate to commute screen", async ({ page }) => {
  358 |     // Direct navigation to commute screen
  359 |     await page.goto("/commute");
  360 | 
  361 |     // Should see commute screen
  362 |     await expect(page.locator("role=heading[name=/commute/i]")).toBeVisible();
  363 |   });
  364 | });
  365 | 
  366 | test.describe("Full Stack Workflows", () => {
  367 |   test("complete workflow: search → view station → add favorite", async ({ page }) => {
  368 |     // Start at home
  369 |     await page.goto("/");
  370 | 
  371 |     // Navigate to search
  372 |     await page.click('role=link[name="Search"]');
  373 |     await expect(page).toHaveURL(/\/search/);
  374 | 
  375 |     // Search for Times Square
  376 |     const searchInput = page.locator('role=searchbox[name="Search stations"]');
  377 |     await searchInput.fill("Times");
  378 |     await page.waitForTimeout(250);
  379 | 
  380 |     // Click result
  381 |     await page.click("role=link[name=/Times Sq-42 St/i]");
  382 |     await expect(page).toHaveURL(/\/station\//);
  383 | 
  384 |     // Add to favorite
  385 |     const favoriteButton = page.locator('role=button[aria-pressed="false"]').first();
  386 |     const hasButton = await favoriteButton.count();
  387 | 
  388 |     if (hasButton > 0) {
  389 |       await favoriteButton.click();
  390 | 
  391 |       // Verify favorited state
  392 |       await expect(page.locator('role=button[aria-pressed="true"]')).toBeVisible();
  393 |     }
  394 | 
  395 |     // Navigate back to home
  396 |     await page.click('role=link[name="Go back"]');
  397 |     await expect(page).toHaveURL("/");
  398 | 
  399 |     // Verify favorite appears in home favorites
  400 |     const hasFavorites = await page.locator("role=article").count();
  401 |     expect(hasFavorites).toBeGreaterThan(0);
  402 |   });
  403 | 
  404 |   test("complete workflow: home → station → refresh arrivals", async ({ page }) => {
  405 |     await page.goto("/");
  406 | 
  407 |     // Navigate to a station (direct URL for test reliability)
  408 |     await page.goto("/station/725");
  409 | 
  410 |     // Wait for arrivals to load
  411 |     await page.waitForSelector('role=heading[name="Arrivals"]', { timeout: 10000 });
  412 | 
  413 |     // Refresh arrivals
  414 |     await page.click('role=button[name="Refresh arrivals"]');
  415 | 
  416 |     // Verify refresh indicator appears
  417 |     const refreshButton = page.locator('role=button[name="Refresh arrivals"] svg');
  418 |     await expect(refreshButton).toHaveAttribute("class", /animate-spin/);
  419 |   });
  420 | 
  421 |   test("complete workflow: view health status", async ({ page }) => {
  422 |     await page.goto("/health");
  423 | 
  424 |     // Should see health status
> 425 |     await expect(page.locator("text=/status|uptime|feeds/i")).toBeVisible();
      |                                                               ^ Error: expect(locator).toBeVisible() failed
  426 | 
  427 |     // Health endpoint via API
  428 |     const response = await page.request.get("/api/health");
  429 |     expect(response.status()).toBe(200);
  430 | 
  431 |     const body = await response.json();
  432 |     expect(body).toHaveProperty("status");
  433 |     expect(body).toHaveProperty("feeds");
  434 |   });
  435 | });
  436 | 
  437 | test.describe("Error Handling", () => {
  438 |   test("should handle offline state gracefully", async ({ page }) => {
  439 |     // Simulate offline mode
  440 |     await page.context().setOffline(true);
  441 | 
  442 |     await page.goto("/station/725");
  443 | 
  444 |     // Should show offline banner
  445 |     await expect(page.locator('role=region[name="offline"]')).toBeVisible();
  446 | 
  447 |     // Restore online
  448 |     await page.context().setOffline(false);
  449 |   });
  450 | 
  451 |   test("should handle API errors gracefully", async ({ page }) => {
  452 |     // Navigate to a non-existent station
  453 |     await page.goto("/station/999999");
  454 | 
  455 |     // Should show error state
  456 |     await expect(page.locator("text=/not found|error/i")).toBeVisible();
  457 |   });
  458 | 
  459 |   test("should handle malformed URLs gracefully", async ({ page }) => {
  460 |     // Navigate to invalid URL
  461 |     await page.goto("/invalid-route");
  462 | 
  463 |     // Should redirect to home or show 404
  464 |     await expect(page).toHaveURL(/\//);
  465 |   });
  466 | });
  467 | 
  468 | test.describe("Performance", () => {
  469 |   test("should load home screen quickly", async ({ page }) => {
  470 |     const startTime = Date.now();
  471 | 
  472 |     await page.goto("/");
  473 | 
  474 |     // Wait for main content
  475 |     await page.waitForSelector("role=main", { timeout: 5000 });
  476 | 
  477 |     const loadTime = Date.now() - startTime;
  478 | 
  479 |     // Should load in under 3 seconds (core value prop)
  480 |     expect(loadTime).toBeLessThan(3000);
  481 |   });
  482 | 
  483 |   test("should have fast time to interactive", async ({ page }) => {
  484 |     const metrics = await page.goto("/");
  485 | 
  486 |     if (metrics) {
  487 |       // Check that page loaded
  488 |       await page.waitForSelector("role=main");
  489 | 
  490 |       // Verify page is responsive
  491 |       const isResponsive = await page.evaluate(() => {
  492 |         return document.readyState === "complete";
  493 |       });
  494 | 
  495 |       expect(isResponsive).toBe(true);
  496 |     }
  497 |   });
  498 | });
  499 | 
```