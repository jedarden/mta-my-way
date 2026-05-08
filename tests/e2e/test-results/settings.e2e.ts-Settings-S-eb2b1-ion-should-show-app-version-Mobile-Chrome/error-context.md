# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.e2e.ts >> Settings Screen >> About Section >> should show app version
- Location: settings.e2e.ts:325:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/version|v\\d+\\.\\d+/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/version|v\\d+\\.\\d+/i')

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
  229 | 
  230 |     test("should show alert severity filter", async ({ page }) => {
  231 |       await page.goto("/settings");
  232 | 
  233 |       const severityFilter = page.locator("text=/severity|alert level|filter/i");
  234 |       await expect(severityFilter).toBeAttached();
  235 |     });
  236 |   });
  237 | 
  238 |   test.describe("Data Management", () => {
  239 |     test("should show favorites section", async ({ page }) => {
  240 |       await page.goto("/settings");
  241 | 
  242 |       const favoritesSection = page.locator("text=/favorites|your stations/i");
  243 |       await expect(favoritesSection).toBeAttached();
  244 |     });
  245 | 
  246 |     test("should show commutes section", async ({ page }) => {
  247 |       await page.goto("/settings");
  248 | 
  249 |       const commutesSection = page.locator("text=/commutes|your commutes/i");
  250 |       await expect(commutesSection).toBeAttached();
  251 |     });
  252 | 
  253 |     test("should have export data option", async ({ page }) => {
  254 |       await page.goto("/settings");
  255 | 
  256 |       const exportButton = page
  257 |         .locator('role=button:has-text("Export")')
  258 |         .or(page.locator("text=/export data|download/i"));
  259 |       await expect(exportButton).toBeAttached();
  260 |     });
  261 | 
  262 |     test("should export data when requested", async ({ page }) => {
  263 |       await page.goto("/settings");
  264 | 
  265 |       const exportButton = page
  266 |         .locator('role=button:has-text("Export")')
  267 |         .or(page.locator('role=button:has-text("Download")'));
  268 |       const hasButton = await exportButton.count();
  269 | 
  270 |       if (hasButton > 0) {
  271 |         // Track download events
  272 |         const downloadPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
  273 | 
  274 |         await exportButton.first().click();
  275 | 
  276 |         // Download might trigger
  277 |         const download = await downloadPromise;
  278 |         if (download) {
  279 |           expect(download.suggestedFilename()).toBeTruthy();
  280 |         }
  281 |       }
  282 |     });
  283 | 
  284 |     test("should have clear data option", async ({ page }) => {
  285 |       await page.goto("/settings");
  286 | 
  287 |       const clearButton = page
  288 |         .locator('role=button:has-text("Clear")')
  289 |         .or(page.locator("text=/clear data|reset|delete all/i"));
  290 |       await expect(clearButton).toBeAttached();
  291 |     });
  292 | 
  293 |     test("should confirm before clearing data", async ({ page }) => {
  294 |       await page.goto("/settings");
  295 | 
  296 |       const clearButton = page
  297 |         .locator('role=button:has-text("Clear")')
  298 |         .or(page.locator('role=button:has-text("Delete")'));
  299 |       const hasButton = await clearButton.count();
  300 | 
  301 |       if (hasButton > 0) {
  302 |         await clearButton.first().click();
  303 | 
  304 |         // Should show confirmation dialog
  305 |         const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
  306 |         const hasDialog = await dialog.count();
  307 | 
  308 |         if (hasDialog > 0) {
  309 |           await expect(dialog.first()).toBeVisible();
  310 | 
  311 |           // Should have confirm and cancel buttons
  312 |           const confirmButton = page
  313 |             .locator('role=button:has-text("Confirm")')
  314 |             .or(page.locator('role=button:has-text("Clear")'));
  315 |           await expect(confirmButton).toBeAttached();
  316 | 
  317 |           const cancelButton = page.locator('role=button:has-text("Cancel")');
  318 |           await expect(cancelButton).toBeAttached();
  319 |         }
  320 |       }
  321 |     });
  322 |   });
  323 | 
  324 |   test.describe("About Section", () => {
  325 |     test("should show app version", async ({ page }) => {
  326 |       await page.goto("/settings");
  327 | 
  328 |       const version = page.locator("text=/version|v\\d+\\.\\d+/i");
> 329 |       await expect(version).toBeAttached();
      |                             ^ Error: expect(locator).toBeAttached() failed
  330 |     });
  331 | 
  332 |     test("should show build information", async ({ page }) => {
  333 |       await page.goto("/settings");
  334 | 
  335 |       const buildInfo = page.locator("text=/build|commit|environment/i");
  336 |       await expect(buildInfo).toBeAttached();
  337 |     });
  338 | 
  339 |     test("should have links to support/privacy", async ({ page }) => {
  340 |       await page.goto("/settings");
  341 | 
  342 |       const supportLink = page
  343 |         .locator('role=link:has-text("Support")')
  344 |         .or(page.locator('role=link:has-text("Help")'));
  345 |       const privacyLink = page.locator('role=link:has-text("Privacy")');
  346 | 
  347 |       // At least one should exist
  348 |       const hasLinks = (await supportLink.count()) + (await privacyLink.count()) > 0;
  349 |       expect(hasLinks).toBe(true);
  350 |     });
  351 | 
  352 |     test("should show license information", async ({ page }) => {
  353 |       await page.goto("/settings");
  354 | 
  355 |       const license = page.locator("text=/license|open source|MIT/i");
  356 |       await expect(license).toBeAttached();
  357 |     });
  358 |   });
  359 | 
  360 |   test.describe("Accessibility Settings", () => {
  361 |     test("should show reduce motion option", async ({ page }) => {
  362 |       await page.goto("/settings");
  363 | 
  364 |       const reduceMotion = page.locator("text=/reduce motion|animation/i");
  365 |       await expect(reduceMotion).toBeAttached();
  366 |     });
  367 | 
  368 |     test("should respect system reduce motion preference", async ({ page }) => {
  369 |       // Set system preference
  370 |       await page.emulateMedia({ reducedMotion: "reduce" });
  371 | 
  372 |       await page.goto("/settings");
  373 | 
  374 |       // Check if reduce motion is reflected in UI
  375 |       const reducedMotionIndicator = page.locator(
  376 |         '[data-reduced-motion="true"], [class*="no-motion"]'
  377 |       );
  378 |       const hasIndicator = await reducedMotionIndicator.count();
  379 | 
  380 |       if (hasIndicator > 0) {
  381 |         await expect(reducedMotionIndicator.first()).toBeVisible();
  382 |       }
  383 | 
  384 |       // Reset
  385 |       await page.emulateMedia({ reducedMotion: "no-preference" });
  386 |     });
  387 |   });
  388 | 
  389 |   test.describe("Accessibility", () => {
  390 |     test("should have proper heading hierarchy", async ({ page }) => {
  391 |       await page.goto("/settings");
  392 | 
  393 |       const mainHeading = page.locator('role=heading[level="1"]');
  394 |       await expect(mainHeading.first()).toBeVisible();
  395 | 
  396 |       // Should have section headings
  397 |       const sectionHeadings = page.locator('role=heading[level="2"]');
  398 |       await expect(sectionHeadings.first()).toBeAttached();
  399 |     });
  400 | 
  401 |     test("should have accessible form controls", async ({ page }) => {
  402 |       await page.goto("/settings");
  403 | 
  404 |       // All inputs should have labels
  405 |       const inputs = page.locator("input, select, textarea");
  406 |       const count = await inputs.count();
  407 | 
  408 |       for (let i = 0; i < Math.min(count, 5); i++) {
  409 |         const input = inputs.nth(i);
  410 |         const hasLabel = await input.evaluate((el) => {
  411 |           const label =
  412 |             el.getAttribute("aria-label") ||
  413 |             el.getAttribute("aria-labelledby") ||
  414 |             el.closest("label") ||
  415 |             document.querySelector(`label[for="${el.id}"]`);
  416 |           return !!label;
  417 |         });
  418 |         expect(hasLabel).toBe(true);
  419 |       }
  420 |     });
  421 | 
  422 |     test("should announce setting changes", async ({ page }) => {
  423 |       await page.goto("/settings");
  424 | 
  425 |       // Change a setting
  426 |       const toggle = page.locator('[role="switch"], [type="checkbox"]').first();
  427 |       const hasToggle = await toggle.count();
  428 | 
  429 |       if (hasToggle > 0) {
```