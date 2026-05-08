# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: subway-year.e2e.ts >> Stats / Subway Year Screen >> Stats Details >> should display overview section
- Location: subway-year.e2e.ts:379:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/Overview|Details/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/Overview|Details/i')

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
  283 | 
  284 |       const stationsVisited = page.locator("text=/Stations Visited/i");
  285 |       await expect(stationsVisited).toBeAttached();
  286 |     });
  287 | 
  288 |     test("should show delay days", async ({ page }) => {
  289 |       await page.goto("/stats");
  290 | 
  291 |       const delayDays = page.locator("text=/Delay Days/i");
  292 |       await expect(delayDays).toBeAttached();
  293 |     });
  294 | 
  295 |     test("should show streak information", async ({ page }) => {
  296 |       await page.goto("/stats");
  297 | 
  298 |       const streak = page.locator("text=/Longest Streak|Current Streak/i");
  299 |       await expect(streak).toBeAttached();
  300 |     });
  301 |   });
  302 | 
  303 |   test.describe("Carbon Savings Section", () => {
  304 |     test.beforeEach(async ({ page }) => {
  305 |       await page.addInitScript(() => {
  306 |         const journalData = {
  307 |           "test-commute": {
  308 |             stats: {
  309 |               totalTrips: 50,
  310 |               totalMinutes: 1000,
  311 |               averageDuration: 20,
  312 |               medianDuration: 19,
  313 |             },
  314 |             records: Array.from({ length: 50 }, (_, i) => ({
  315 |               id: `trip-${i}`,
  316 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  317 |               origin: { stationId: "101", stationName: "South Ferry" },
  318 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  319 |               line: "1",
  320 |               actualDurationMinutes: 20,
  321 |               source: "tracked",
  322 |             })),
  323 |           },
  324 |         };
  325 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  326 |       });
  327 |     });
  328 | 
  329 |     test("should show carbon savings", async ({ page }) => {
  330 |       await page.goto("/stats");
  331 | 
  332 |       const carbonSavings = page.locator("text=/CO₂ Saved|Carbon Savings|kg of CO₂/i");
  333 |       await expect(carbonSavings).toBeAttached();
  334 |     });
  335 | 
  336 |     test("should show environmental equivalents", async ({ page }) => {
  337 |       await page.goto("/stats");
  338 | 
  339 |       // Should show trees equivalent
  340 |       const trees = page.locator("text=/trees|worth of trees/i");
  341 |       await expect(trees).toBeAttached();
  342 | 
  343 |       // Should show flights equivalent
  344 |       const flights = page.locator("text=/NYC↔LA|flights/i");
  345 |       await expect(flights).toBeAttached();
  346 | 
  347 |       // Should show car-free days
  348 |       const carFree = page.locator("text=/car-free|days/i");
  349 |       await expect(carFree).toBeAttached();
  350 |     });
  351 |   });
  352 | 
  353 |   test.describe("Stats Details", () => {
  354 |     test.beforeEach(async ({ page }) => {
  355 |       await page.addInitScript(() => {
  356 |         const journalData = {
  357 |           "test-commute": {
  358 |             stats: {
  359 |               totalTrips: 50,
  360 |               totalMinutes: 1000,
  361 |               averageDuration: 20,
  362 |               medianDuration: 19,
  363 |             },
  364 |             records: Array.from({ length: 50 }, (_, i) => ({
  365 |               id: `trip-${i}`,
  366 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  367 |               origin: { stationId: "101", stationName: "South Ferry" },
  368 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  369 |               line: "1",
  370 |               actualDurationMinutes: 20,
  371 |               source: "tracked",
  372 |             })),
  373 |           },
  374 |         };
  375 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  376 |       });
  377 |     });
  378 | 
  379 |     test("should display overview section", async ({ page }) => {
  380 |       await page.goto("/stats");
  381 | 
  382 |       const overview = page.locator("text=/Overview|Details/i");
> 383 |       await expect(overview).toBeAttached();
      |                              ^ Error: expect(locator).toBeAttached() failed
  384 |     });
  385 | 
  386 |     test("should display favorites section", async ({ page }) => {
  387 |       await page.goto("/stats");
  388 | 
  389 |       const favorites = page.locator("text=/Favorites|Most-Used/i");
  390 |       await expect(favorites).toBeAttached();
  391 |     });
  392 | 
  393 |     test("should display reliability section", async ({ page }) => {
  394 |       await page.goto("/stats");
  395 | 
  396 |       const reliability = page.locator("text=/Reliability|Delay Days/i");
  397 |       await expect(reliability).toBeAttached();
  398 |     });
  399 | 
  400 |     test("should display environmental impact section", async ({ page }) => {
  401 |       await page.goto("/stats");
  402 | 
  403 |       const envImpact = page.locator("text=/Environmental Impact|CO₂ Saved/i");
  404 |       await expect(envImpact).toBeAttached();
  405 |     });
  406 |   });
  407 | 
  408 |   test.describe("Share Functionality", () => {
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
```