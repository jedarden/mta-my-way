# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: line-diagram.e2e.ts >> Line Diagram Screen >> Zoom and Pan >> should have zoom controls
- Location: line-diagram.e2e.ts:312:5

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
  213 |         // Should show station details or navigate
  214 |         const url = page.url();
  215 |         const navigated = url.includes("/station/");
  216 |         const modal = page.locator("[role='dialog']");
  217 |         const hasModal = await modal.count();
  218 | 
  219 |         expect(navigated || hasModal > 0).toBe(true);
  220 |       }
  221 |     });
  222 | 
  223 |     test("should show arrivals at tapped station", async ({ page }) => {
  224 |       await page.waitForSelector("svg", { timeout: 5000 });
  225 | 
  226 |       const station = page.locator("circle, [role='button']").first();
  227 |       const hasStation = await station.count();
  228 | 
  229 |       if (hasStation > 0) {
  230 |         await station.click();
  231 | 
  232 |         // Should see arrivals information
  233 |         const arrivals = page.locator("text=/arriv|min|depart/i");
  234 |         await expect(arrivals).toBeAttached();
  235 |       }
  236 |     });
  237 |   });
  238 | 
  239 |   test.describe("Line Selection", () => {
  240 |     test("should have line selector or menu", async ({ page }) => {
  241 |       await page.goto("/map"); // Map screen has line selector
  242 | 
  243 |       const lineSelector = page
  244 |         .locator('role=button:has-text("Filter")')
  245 |         .or(page.locator("[role='combobox'], [role='menu']"));
  246 |       const hasSelector = await lineSelector.count();
  247 | 
  248 |       if (hasSelector > 0) {
  249 |         await expect(lineSelector.first()).toBeVisible();
  250 |       }
  251 |     });
  252 | 
  253 |     test("should allow switching between lines", async ({ page }) => {
  254 |       await page.goto("/diagram/1");
  255 | 
  256 |       // Look for line switcher
  257 |       const lineSwitcher = page.locator('role=button:has-text(/A|C|E|2|3/), [role="menu"]').first();
  258 |       const hasSwitcher = await lineSwitcher.count();
  259 | 
  260 |       if (hasSwitcher > 0) {
  261 |         await lineSwitcher.click();
  262 | 
  263 |         // Select a different line
  264 |         const lineOption = page.locator("role=menuitem, role=option").first();
  265 |         const hasOption = await lineOption.count();
  266 | 
  267 |         if (hasOption > 0) {
  268 |           await lineOption.click();
  269 | 
  270 |           // Diagram should update
  271 |           const diagram = page.locator("svg");
  272 |           await expect(diagram.first()).toBeVisible();
  273 |         }
  274 |       }
  275 |     });
  276 |   });
  277 | 
  278 |   test.describe("Zoom and Pan", () => {
  279 |     test("should support pinch to zoom", async ({ page }) => {
  280 |       await page.waitForSelector("svg", { timeout: 5000 });
  281 | 
  282 |       const diagram = page.locator("svg").first();
  283 | 
  284 |       // Get initial size
  285 |       const initialBox = await diagram.boundingBox();
  286 |       expect(initialBox).toBeTruthy();
  287 | 
  288 |       if (initialBox) {
  289 |         // Simulate pinch zoom
  290 |         await diagram.click({ position: { x: initialBox.x + 100, y: initialBox.y + 100 } });
  291 | 
  292 |         // Diagram should still be visible
  293 |         await expect(diagram).toBeVisible();
  294 |       }
  295 |     });
  296 | 
  297 |     test("should support pan/drag to move view", async ({ page }) => {
  298 |       await page.waitForSelector("svg", { timeout: 5000 });
  299 | 
  300 |       const diagram = page.locator("svg").first();
  301 | 
  302 |       // Simulate drag
  303 |       await diagram.dragTo(diagram, {
  304 |         sourcePosition: { x: 50, y: 50 },
  305 |         targetPosition: { x: 100, y: 100 },
  306 |       });
  307 | 
  308 |       // Diagram should still be present
  309 |       await expect(diagram).toBeVisible();
  310 |     });
  311 | 
  312 |     test("should have zoom controls", async ({ page }) => {
> 313 |       await page.waitForSelector("svg", { timeout: 5000 });
      |                  ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  314 | 
  315 |       const zoomIn = page.locator('role=button:has-text("Zoom In"), [aria-label*="zoom in" i]');
  316 |       const zoomOut = page.locator('role=button:has-text("Zoom Out"), [aria-label*="zoom out" i]');
  317 |       const resetZoom = page.locator('role=button:has-text("Reset"), [aria-label*="reset" i]');
  318 | 
  319 |       const hasZoomIn = await zoomIn.count();
  320 |       const hasZoomOut = await zoomOut.count();
  321 |       const hasReset = await resetZoom.count();
  322 | 
  323 |       // At least one zoom control should exist
  324 |       expect(hasZoomIn + hasZoomOut + hasReset).toBeGreaterThan(0);
  325 |     });
  326 |   });
  327 | 
  328 |   test.describe("Real-time Updates", () => {
  329 |     test("should refresh train positions periodically", async ({ page }) => {
  330 |       await page.waitForSelector("svg", { timeout: 10000 });
  331 | 
  332 |       // Get initial train positions
  333 |       const initialTrains = await page.locator("[class*='train' i], [data-train]").all();
  334 | 
  335 |       // Wait for refresh
  336 |       await page.waitForTimeout(35000);
  337 | 
  338 |       // Check if positions updated (content still loads)
  339 |       const diagram = page.locator("svg");
  340 |       await expect(diagram.first()).toBeVisible();
  341 |     });
  342 | 
  343 |     test("should show last updated time", async ({ page }) => {
  344 |       await page.waitForSelector("svg", { timeout: 5000 });
  345 | 
  346 |       const updatedTime = page.locator("text=/updated|refresh|ago/i");
  347 |       await expect(updatedTime).toBeAttached();
  348 |     });
  349 | 
  350 |     test("should have manual refresh button", async ({ page }) => {
  351 |       await page.waitForSelector("svg", { timeout: 5000 });
  352 | 
  353 |       const refreshButton = page.locator(
  354 |         'role=button[aria-label*="refresh" i], role=button:has-text("Refresh")'
  355 |       );
  356 |       const hasRefresh = await refreshButton.count();
  357 | 
  358 |       if (hasRefresh > 0) {
  359 |         await expect(refreshButton.first()).toBeVisible();
  360 |       }
  361 |     });
  362 | 
  363 |     test("should trigger refresh on button click", async ({ page }) => {
  364 |       await page.waitForSelector("svg", { timeout: 5000 });
  365 | 
  366 |       const refreshButton = page.locator(
  367 |         'role=button[aria-label*="refresh" i], role=button:has-text("Refresh")'
  368 |       );
  369 |       const hasRefresh = await refreshButton.count();
  370 | 
  371 |       if (hasRefresh > 0) {
  372 |         // Get loading state
  373 |         await refreshButton.first().click();
  374 | 
  375 |         // Should show loading indicator or update content
  376 |         const loading = page.locator("[aria-busy='true'], [class*='loading' i]");
  377 |         const hasLoading = await loading.count();
  378 | 
  379 |         // Diagram should remain visible
  380 |         const diagram = page.locator("svg");
  381 |         await expect(diagram.first()).toBeVisible();
  382 |       }
  383 |     });
  384 |   });
  385 | 
  386 |   test.describe("Navigation", () => {
  387 |     test("should navigate back to previous screen", async ({ page }) => {
  388 |       const backButton = page.locator(
  389 |         'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
  390 |       );
  391 | 
  392 |       await backButton.first().click();
  393 | 
  394 |       // Should navigate away
  395 |       const url = page.url();
  396 |       expect(url).not.toContain("/diagram/");
  397 |     });
  398 | 
  399 |     test("should navigate to station detail from diagram", async ({ page }) => {
  400 |       await page.waitForSelector("svg", { timeout: 5000 });
  401 | 
  402 |       const station = page.locator("circle, [role='button']").first();
  403 |       const hasStation = await station.count();
  404 | 
  405 |       if (hasStation > 0) {
  406 |         await station.click();
  407 | 
  408 |         const url = page.url();
  409 |         const navigated = /\/station\//.test(url);
  410 | 
  411 |         if (navigated) {
  412 |           expect(url).toMatch(/\/station\//);
  413 |         }
```