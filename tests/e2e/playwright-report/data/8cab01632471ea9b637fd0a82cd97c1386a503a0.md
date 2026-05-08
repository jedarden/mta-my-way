# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: commute-workflow.e2e.ts >> Commute Workflow >> Commute Analysis >> should display commute analysis
- Location: commute-workflow.e2e.ts:317:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/recommended|direct|transfer/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/recommended|direct|transfer/i')

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
        - generic [ref=f2e2]:
          - generic [ref=f2e6]:
            - button "Play" [disabled] [ref=f2e7]
            - button "Reset" [disabled] [ref=f2e8]
            - generic [ref=f2e9]: 0 / 0
            - generic [ref=f2e11]:
              - generic [ref=f2e12]: "Speed:"
              - combobox [ref=f2e13]:
                - option "0.5x"
                - option "1x" [selected]
                - option "2x"
                - option "4x"
          - generic [ref=f2e14]:
            - generic [ref=f2e15]: Failed to fetch
            - button "Retry" [ref=f2e16] [cursor=pointer]
          - link "AI Code Battle" [ref=f2e17] [cursor=pointer]:
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
  225 |           {
  226 |             id: "test-commute-1",
  227 |             name: "Work",
  228 |             origin: { stationId: "101", stationName: "South Ferry" },
  229 |             destination: { stationId: "725", stationName: "Times Sq-42 St" },
  230 |             preferredLines: ["1"],
  231 |             enableTransferSuggestions: true,
  232 |             isPinned: false,
  233 |           },
  234 |         ];
  235 |         const data = localStorage.getItem("mta-favorites");
  236 |         const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
  237 |         parsed.commutes = commutes;
  238 |         localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  239 |       });
  240 |     });
  241 | 
  242 |     test("should navigate to commute detail when commute card is clicked", async ({ page }) => {
  243 |       await page.goto("/commute");
  244 | 
  245 |       // Find commute card
  246 |       const commuteCard = page.locator("role=button").filter({ hasText: /Work/i });
  247 |       const hasCard = await commuteCard.count();
  248 | 
  249 |       if (hasCard > 0) {
  250 |         await commuteCard.click();
  251 | 
  252 |         // Should navigate to detail view
  253 |         await expect(page).toHaveURL(/\/commute\/test-commute-1/);
  254 |       }
  255 |     });
  256 | 
  257 |     test("should display commute name and route", async ({ page }) => {
  258 |       await page.goto("/commute/test-commute-1");
  259 | 
  260 |       await expect(page.locator('role=heading[name="Work"]')).toBeVisible();
  261 | 
  262 |       // Should show route
  263 |       await expect(page.locator("text=/South Ferry.*Times Square/i")).toBeAttached();
  264 |     });
  265 | 
  266 |     test("should show preferred lines as badges", async ({ page }) => {
  267 |       await page.goto("/commute/test-commute-1");
  268 | 
  269 |       const lineBadges = page.locator('[aria-label*="train"], span[class*="line"]');
  270 |       await expect(lineBadges.first()).toBeAttached();
  271 |     });
  272 | 
  273 |     test("should have back button to commute list", async ({ page }) => {
  274 |       await page.goto("/commute/test-commute-1");
  275 | 
  276 |       const backButton = page.locator('role=button:has-text("Back")');
  277 |       await expect(backButton).toBeVisible();
  278 | 
  279 |       await backButton.click();
  280 |       await expect(page).toHaveURL("/commute");
  281 |     });
  282 | 
  283 |     test("should show alert banner for lines with alerts", async ({ page }) => {
  284 |       await page.goto("/commute/test-commute-1");
  285 | 
  286 |       // Alert banner may or may not be present depending on current alerts
  287 |       const alertBanner = page.locator('[role="region"]:has-text("Alert")');
  288 |       const hasAlerts = await alertBanner.count();
  289 | 
  290 |       if (hasAlerts > 0) {
  291 |         await expect(alertBanner.first()).toBeVisible();
  292 |       }
  293 |     });
  294 |   });
  295 | 
  296 |   test.describe("Commute Analysis", () => {
  297 |     test.beforeEach(async ({ page }) => {
  298 |       await page.evaluate(() => {
  299 |         const commutes = [
  300 |           {
  301 |             id: "test-commute-1",
  302 |             name: "Work",
  303 |             origin: { stationId: "101", stationName: "South Ferry" },
  304 |             destination: { stationId: "725", stationName: "Times Sq-42 St" },
  305 |             preferredLines: ["1"],
  306 |             enableTransferSuggestions: true,
  307 |             isPinned: false,
  308 |           },
  309 |         ];
  310 |         const data = localStorage.getItem("mta-favorites");
  311 |         const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
  312 |         parsed.commutes = commutes;
  313 |         localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  314 |       });
  315 |     });
  316 | 
  317 |     test("should display commute analysis", async ({ page }) => {
  318 |       await page.goto("/commute/test-commute-1");
  319 | 
  320 |       // Wait for analysis to load
  321 |       await page.waitForTimeout(2000);
  322 | 
  323 |       // Should have analysis section
  324 |       const analysis = page.locator("text=/recommended|direct|transfer/i");
> 325 |       await expect(analysis).toBeAttached();
      |                              ^ Error: expect(locator).toBeAttached() failed
  326 |     });
  327 | 
  328 |     test("should show route comparison when both direct and transfer routes exist", async ({
  329 |       page,
  330 |     }) => {
  331 |       await page.goto("/commute/test-commute-1");
  332 | 
  333 |       await page.waitForTimeout(2000);
  334 | 
  335 |       // Look for route comparison section
  336 |       const comparison = page.locator("text=/vs|comparison|alternate/i");
  337 |       await expect(comparison).toBeAttached();
  338 |     });
  339 | 
  340 |     test("should show transfer details", async ({ page }) => {
  341 |       await page.goto("/commute/test-commute-1");
  342 | 
  343 |       await page.waitForTimeout(2000);
  344 | 
  345 |       // Should have transfer detail section
  346 |       const transferDetail = page.locator("text=/transfer|stop|arrive/i");
  347 |       await expect(transferDetail).toBeAttached();
  348 |     });
  349 | 
  350 |     test("should show walking comparison for short trips", async ({ page }) => {
  351 |       await page.goto("/commute/test-commute-1");
  352 | 
  353 |       await page.waitForTimeout(2000);
  354 | 
  355 |       // Walking comparison may be shown for short distances
  356 |       const walking = page.locator("text=/walk|walking|pedestrian/i");
  357 |       await expect(walking).toBeAttached();
  358 |     });
  359 | 
  360 |     test("should have refresh button", async ({ page }) => {
  361 |       await page.goto("/commute/test-commute-1");
  362 | 
  363 |       const refreshButton = page.locator(
  364 |         'role=button[aria-label*="refresh" i], role=button:has-text("Refresh")'
  365 |       );
  366 |       await expect(refreshButton).toBeAttached();
  367 |     });
  368 |   });
  369 | 
  370 |   test.describe("Commute Editing", () => {
  371 |     test.beforeEach(async ({ page }) => {
  372 |       await page.evaluate(() => {
  373 |         const commutes = [
  374 |           {
  375 |             id: "test-commute-1",
  376 |             name: "Work",
  377 |             origin: { stationId: "101", stationName: "South Ferry" },
  378 |             destination: { stationId: "725", stationName: "Times Sq-42 St" },
  379 |             preferredLines: ["1"],
  380 |             enableTransferSuggestions: true,
  381 |             isPinned: false,
  382 |           },
  383 |         ];
  384 |         const data = localStorage.getItem("mta-favorites");
  385 |         const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
  386 |         parsed.commutes = commutes;
  387 |         localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  388 |       });
  389 |       await page.goto("/commute");
  390 |     });
  391 | 
  392 |     test("should open edit modal when edit is clicked", async ({ page }) => {
  393 |       const editButton = page.locator(
  394 |         'role=button[aria-label*="edit" i], role=button:has-text("Edit")'
  395 |       );
  396 |       const hasEdit = await editButton.count();
  397 | 
  398 |       if (hasEdit > 0) {
  399 |         await editButton.first().click();
  400 | 
  401 |         // Editor modal should appear
  402 |         const modal = page.locator('[role="dialog"]');
  403 |         await expect(modal).toBeVisible();
  404 |       }
  405 |     });
  406 | 
  407 |     test("should allow changing commute name", async ({ page }) => {
  408 |       const editButton = page.locator('role=button[aria-label*="edit" i]');
  409 |       const hasEdit = await editButton.count();
  410 | 
  411 |       if (hasEdit > 0) {
  412 |         await editButton.first().click();
  413 | 
  414 |         const nameInput = page.locator('role=textbox[name*="name" i]');
  415 |         const hasInput = await nameInput.count();
  416 | 
  417 |         if (hasInput > 0) {
  418 |           await nameInput.fill("Updated Work Commute");
  419 | 
  420 |           const saveButton = page.locator('role=button:has-text("Save")');
  421 |           await saveButton.click();
  422 | 
  423 |           // Modal should close
  424 |           const modal = page.locator('[role="dialog"]');
  425 |           await expect(modal).not.toBeVisible();
```