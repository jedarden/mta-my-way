# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: map.e2e.ts >> Map Screen >> Full Stack Integration >> should auto-refresh positions
- Location: map.e2e.ts:388:5

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
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
  292 |       });
  293 | 
  294 |       await page.goto("/map");
  295 | 
  296 |       // Should show some content even if positions fail
  297 |       await expect(page.locator("svg, role=main").first()).toBeAttached();
  298 |     });
  299 |   });
  300 | 
  301 |   test.describe("Performance", () => {
  302 |     test("should load map quickly", async ({ page }) => {
  303 |       const startTime = Date.now();
  304 | 
  305 |       await page.goto("/map");
  306 | 
  307 |       // Wait for map to be interactive
  308 |       await page.waitForSelector("svg", { timeout: 10000 });
  309 | 
  310 |       const loadTime = Date.now() - startTime;
  311 | 
  312 |       // Should load in under 5 seconds
  313 |       expect(loadTime).toBeLessThan(5000);
  314 |     });
  315 | 
  316 |     test("should be responsive to user input", async ({ page }) => {
  317 |       await page.waitForSelector("svg", { timeout: 10000 });
  318 | 
  319 |       // Try interacting with the map
  320 |       const mapContainer = page.locator("svg").first();
  321 | 
  322 |       // Simulate touch/drag
  323 |       await mapContainer.click({ position: { x: 100, y: 100 } });
  324 | 
  325 |       // Map should still be responsive
  326 |       await expect(mapContainer).toBeVisible();
  327 |     });
  328 |   });
  329 | 
  330 |   test.describe("Accessibility", () => {
  331 |     test("should have proper ARIA labels on map controls", async ({ page }) => {
  332 |       // Filter button should have aria-label
  333 |       const filterButton = page.locator(
  334 |         'role=button[aria-label*="filter" i], role=button:has-text("Filter")'
  335 |       );
  336 |       await expect(filterButton).toBeAttached();
  337 | 
  338 |       // Refresh button should have aria-label
  339 |       const refreshButton = page.locator('role=button[aria-label*="refresh" i]');
  340 |       await expect(refreshButton).toBeAttached();
  341 |     });
  342 | 
  343 |     test("should be keyboard navigable", async ({ page }) => {
  344 |       await page.waitForSelector("svg", { timeout: 10000 });
  345 | 
  346 |       // Tab to filter button
  347 |       await page.keyboard.press("Tab");
  348 |       await page.keyboard.press("Tab");
  349 | 
  350 |       // Should have a focused button
  351 |       const focused = await page.evaluate(() => document.activeElement?.tagName);
  352 |       expect(focused).toBe("BUTTON");
  353 |     });
  354 | 
  355 |     test("should announce screen changes", async ({ page }) => {
  356 |       const filterButton = page
  357 |         .locator('role=button:has-text("Filter")')
  358 |         .or(page.locator('role=button[aria-label*="filter" i]'));
  359 | 
  360 |       await filterButton.click();
  361 | 
  362 |       // Should have live region or updated content
  363 |       const liveRegion = page.locator('[aria-live], [role="status"]');
  364 |       await expect(liveRegion).toBeAttached();
  365 |     });
  366 |   });
  367 | 
  368 |   test.describe("Full Stack Integration", () => {
  369 |     test("should fetch positions from API", async ({ page }) => {
  370 |       // Track API requests
  371 |       const apiRequests: string[] = [];
  372 | 
  373 |       page.on("request", (request) => {
  374 |         if (request.url().includes("/api/positions")) {
  375 |           apiRequests.push(request.url());
  376 |         }
  377 |       });
  378 | 
  379 |       await page.goto("/map");
  380 | 
  381 |       // Wait for map to load
  382 |       await page.waitForSelector("svg", { timeout: 10000 });
  383 | 
  384 |       // Should have made at least one position request
  385 |       expect(apiRequests.length).toBeGreaterThan(0);
  386 |     });
  387 | 
  388 |     test("should auto-refresh positions", async ({ page }) => {
  389 |       await page.goto("/map");
  390 | 
  391 |       // Wait for initial load
> 392 |       await page.waitForSelector("svg", { timeout: 10000 });
      |                  ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  393 | 
  394 |       // Track requests
  395 |       let requestCount = 0;
  396 |       page.on("request", (request) => {
  397 |         if (request.url().includes("/api/positions")) {
  398 |           requestCount++;
  399 |         }
  400 |       });
  401 | 
  402 |       // Wait for auto-refresh (30 seconds typically, but we'll wait a shorter time)
  403 |       await page.waitForTimeout(5000);
  404 | 
  405 |       // Should have made initial requests
  406 |       expect(requestCount).toBeGreaterThan(0);
  407 |     });
  408 |   });
  409 | });
  410 | 
```