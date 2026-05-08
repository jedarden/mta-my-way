# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pwa-features.e2e.ts >> PWA Features >> PWA Performance >> should load quickly on repeat visit (from cache)
- Location: pwa-features.e2e.ts:441:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('role=main') to be visible

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
  345 |         return meta?.getAttribute("content");
  346 |       });
  347 | 
  348 |       expect(statusBarStyle).toBeTruthy();
  349 |     });
  350 | 
  351 |     test("should have apple-mobile-web-app-title meta", async ({ page }) => {
  352 |       await page.goto("/");
  353 | 
  354 |       const appTitle = await page.evaluate(() => {
  355 |         const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  356 |         return meta?.getAttribute("content");
  357 |       });
  358 | 
  359 |       expect(appTitle).toBeTruthy();
  360 |     });
  361 |   });
  362 | 
  363 |   test.describe("PWA Display", () => {
  364 |     test("should have proper viewport configuration", async ({ page }) => {
  365 |       await page.goto("/");
  366 | 
  367 |       const viewport = page.locator('meta[name="viewport"]');
  368 |       await expect(viewport).toHaveAttribute("content", /width=device-width/);
  369 |     });
  370 | 
  371 |     test("should have theme color meta tag", async ({ page }) => {
  372 |       await page.goto("/");
  373 | 
  374 |       const themeColor = page.locator('meta[name="theme-color"]');
  375 |       await expect(themeColor).toBeAttached();
  376 | 
  377 |       const content = await themeColor.getAttribute("content");
  378 |       expect(content).toMatch(/^#[0-9A-Fa-f]{6}$/);
  379 |     });
  380 | 
  381 |     test("should have proper background color", async ({ page }) => {
  382 |       await page.goto("/");
  383 | 
  384 |       const backgroundColor = await page.evaluate(() => {
  385 |         const styles = window.getComputedStyle(document.body);
  386 |         return styles.backgroundColor;
  387 |       });
  388 | 
  389 |       expect(backgroundColor).toBeTruthy();
  390 |     });
  391 |   });
  392 | 
  393 |   test.describe("PWA Installation Scenarios", () => {
  394 |     test("should preserve state when installed as PWA", async ({ page }) => {
  395 |       // Set some state
  396 |       await page.goto("/");
  397 | 
  398 |       await page.evaluate(() => {
  399 |         localStorage.setItem("test-state", "preserved");
  400 |       });
  401 | 
  402 |       // Simulate PWA display mode
  403 |       await page.emulateMedia({ reducedMotion: "reduce" });
  404 | 
  405 |       // Reload
  406 |       await page.reload();
  407 | 
  408 |       // State should be preserved
  409 |       const testState = await page.evaluate(() => {
  410 |         return localStorage.getItem("test-state");
  411 |       });
  412 | 
  413 |       expect(testState).toBe("preserved");
  414 |     });
  415 |   });
  416 | 
  417 |   test.describe("Service Worker Message Handling", () => {
  418 |     test("should handle SKIP_WAITING message", async ({ page }) => {
  419 |       await page.goto("/");
  420 | 
  421 |       // Wait for service worker
  422 |       await page.waitForTimeout(2000);
  423 | 
  424 |       // Send skip waiting message
  425 |       const messageHandled = await page.evaluate(async () => {
  426 |         if (!("serviceWorker" in navigator)) return false;
  427 | 
  428 |         const registration = await navigator.serviceWorker.getRegistration();
  429 |         if (!registration?.waiting) return false;
  430 | 
  431 |         registration.waiting.postMessage({ type: "SKIP_WAITING" });
  432 |         return true;
  433 |       });
  434 | 
  435 |       // Message handling is tested - actual behavior depends on SW state
  436 |       expect(typeof messageHandled).toBe("boolean");
  437 |     });
  438 |   });
  439 | 
  440 |   test.describe("PWA Performance", () => {
  441 |     test("should load quickly on repeat visit (from cache)", async ({ page }) => {
  442 |       // First visit
  443 |       const startTime1 = Date.now();
  444 |       await page.goto("/");
> 445 |       await page.waitForSelector("role=main");
      |                  ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  446 |       const loadTime1 = Date.now() - startTime1;
  447 | 
  448 |       // Second visit (should be faster from cache)
  449 |       await page.reload();
  450 |       const startTime2 = Date.now();
  451 |       await page.waitForSelector("role=main");
  452 |       const loadTime2 = Date.now() - startTime2;
  453 | 
  454 |       // Second load should be faster or similar (cached)
  455 |       expect(loadTime2).toBeLessThanOrEqual(loadTime1 + 500);
  456 |     });
  457 | 
  458 |     test("should have reasonable total bundle size", async ({ page }) => {
  459 |       // Check that scripts are loaded
  460 |       await page.goto("/");
  461 | 
  462 |       const scriptsLoaded = await page.evaluate(() => {
  463 |         return Array.from(document.querySelectorAll("script[src]")).length;
  464 |       });
  465 | 
  466 |       expect(scriptsLoaded).toBeGreaterThan(0);
  467 |     });
  468 |   });
  469 | 
  470 |   test.describe("PWA Security", () => {
  471 |     test("should use HTTPS for service worker scope", async ({ page }) => {
  472 |       await page.goto("/");
  473 | 
  474 |       // Service workers require HTTPS or localhost
  475 |       // This test verifies the app is set up correctly for SW
  476 |       const swScope = await page.evaluate(async () => {
  477 |         if (!("serviceWorker" in navigator)) return null;
  478 |         const registration = await navigator.serviceWorker.getRegistration();
  479 |         return registration?.scope;
  480 |       });
  481 | 
  482 |       if (swScope) {
  483 |         // Scope should be absolute URL
  484 |         expect(swScope).toMatch(/^https?:\/\//);
  485 |       }
  486 |     });
  487 |   });
  488 | });
  489 | 
```