# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: map.e2e.ts >> Map Screen >> Error Handling >> should handle map load errors
- Location: map.e2e.ts:280:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: svg, role=main >> nth=0
Expected: attached
Error: Unexpected token "=" while parsing css selector "svg, role=main". Did you mean to CSS.escape it?

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for svg, role=main >> nth=0

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
```

# Test source

```ts
  197 |         if (hasCount > 0) {
  198 |           // Count badge should be gone or show 0
  199 |           expect(await filterCount.first().textContent()).not.toMatch(/\d+/);
  200 |         }
  201 |       }
  202 |     });
  203 | 
  204 |     test("should close filter panel", async ({ page }) => {
  205 |       const filterButton = page
  206 |         .locator('role=button:has-text("Filter")')
  207 |         .or(page.locator('role=button[aria-label*="filter" i]'));
  208 | 
  209 |       // Open filter
  210 |       await filterButton.click();
  211 | 
  212 |       // Close filter
  213 |       await filterButton.click();
  214 | 
  215 |       // Filter panel should be closed
  216 |       const lineButtons = page.locator('[role="button"][aria-pressed]');
  217 |       const hasPanel = await lineButtons.count();
  218 | 
  219 |       // Panel might still be in DOM but not visible
  220 |       if (hasPanel > 0) {
  221 |         const isVisible = await lineButtons.first().isVisible();
  222 |         expect(isVisible).toBe(false);
  223 |       }
  224 |     });
  225 |   });
  226 | 
  227 |   test.describe("Navigation", () => {
  228 |     test("should navigate back to home", async ({ page }) => {
  229 |       const backButton = page
  230 |         .locator('role=link[aria-label*="back" i]')
  231 |         .or(page.locator('role=button[aria-label*="back" i]'));
  232 | 
  233 |       await backButton.click();
  234 | 
  235 |       await expect(page).toHaveURL("/");
  236 |     });
  237 | 
  238 |     test("should navigate to station detail from map", async ({ page }) => {
  239 |       await page.waitForSelector("svg", { timeout: 5000 });
  240 | 
  241 |       // Try to find a clickable station
  242 |       const station = page.locator("circle, [role='button']").first();
  243 |       const hasStation = await station.count();
  244 | 
  245 |       if (hasStation > 0) {
  246 |         await station.click();
  247 | 
  248 |         // Should either open modal or navigate to station detail
  249 |         const url = page.url();
  250 |         const hasStationRoute = /\/station\//.test(url) || url.includes("station");
  251 | 
  252 |         // Either we navigated to station detail or a modal opened
  253 |         const modal = page.locator('[role="dialog"]');
  254 |         const hasModal = await modal.count();
  255 | 
  256 |         expect(hasStationRoute || hasModal > 0).toBe(true);
  257 |       }
  258 |     });
  259 |   });
  260 | 
  261 |   test.describe("Error Handling", () => {
  262 |     test("should handle offline state gracefully", async ({ page }) => {
  263 |       // Simulate offline
  264 |       await page.context().setOffline(true);
  265 | 
  266 |       await page.goto("/map");
  267 | 
  268 |       // Should show offline banner
  269 |       const offlineBanner = page.locator("text=/offline|no connection/i");
  270 |       const hasOffline = await offlineBanner.count();
  271 | 
  272 |       if (hasOffline > 0) {
  273 |         await expect(offlineBanner.first()).toBeVisible();
  274 |       }
  275 | 
  276 |       // Restore online
  277 |       await page.context().setOffline(false);
  278 |     });
  279 | 
  280 |     test("should handle map load errors", async ({ page }) => {
  281 |       // Navigate to map and intercept requests to simulate error
  282 |       await page.route("**/*", (route) => {
  283 |         // Let static assets through
  284 |         if (route.request().resourceType() === "document") {
  285 |           route.continue();
  286 |         } else if (route.request().url().includes("/api/positions")) {
  287 |           // Fail position requests
  288 |           route.abort();
  289 |         } else {
  290 |           route.continue();
  291 |         }
  292 |       });
  293 | 
  294 |       await page.goto("/map");
  295 | 
  296 |       // Should show some content even if positions fail
> 297 |       await expect(page.locator("svg, role=main").first()).toBeAttached();
      |                                                            ^ Error: expect(locator).toBeAttached() failed
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
  392 |       await page.waitForSelector("svg", { timeout: 10000 });
  393 | 
  394 |       // Track requests
  395 |       let requestCount = 0;
  396 |       page.on("request", (request) => {
  397 |         if (request.url().includes("/api/positions")) {
```