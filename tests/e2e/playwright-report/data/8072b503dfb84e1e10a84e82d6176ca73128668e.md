# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-journeys.e2e.ts >> Navigation Journey >> should handle browser back button
- Location: user-journeys.e2e.ts:272:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('role=link[name="Search"]')

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
  176 |     // Should see "Your Stations" section
  177 |     await expect(page.locator('role=heading[name="Your Stations"]')).toBeVisible();
  178 | 
  179 |     // May or may not have favorites depending on test state
  180 |   });
  181 | 
  182 |   test("should navigate to favorite station and see arrivals", async ({ page }) => {
  183 |     await page.goto("/");
  184 | 
  185 |     // Look for any favorite cards
  186 |     const favoriteCards = page.locator("role=article").locator("role=link[name=/Go to/i]");
  187 |     const hasCards = await favoriteCards.count();
  188 | 
  189 |     if (hasCards > 0) {
  190 |       await favoriteCards.first().click();
  191 | 
  192 |       // Should navigate to station detail
  193 |       await expect(page).toHaveURL(/\/station\//);
  194 |     }
  195 |     // If no favorites, test passes (empty state is valid)
  196 |   });
  197 | 
  198 |   test("should refresh arrivals on home screen", async ({ page }) => {
  199 |     await page.goto("/");
  200 | 
  201 |     // Pull down to refresh (simulated with touch events)
  202 |     const container = page.locator("role=main").first();
  203 | 
  204 |     // Simulate pull-to-refresh gesture
  205 |     await container.evaluate((el) => {
  206 |       const touchStart = new TouchEvent("touchstart", {
  207 |         bubbles: true,
  208 |         cancelable: true,
  209 |         touches: [
  210 |           {
  211 |             clientY: 0,
  212 |             clientX: 100,
  213 |             identifier: 0,
  214 |             target: el,
  215 |             pageX: 100,
  216 |             pageY: 0,
  217 |             screenX: 100,
  218 |             screenY: 0,
  219 |             force: 0,
  220 |             radiusX: 0,
  221 |             radiusY: 0,
  222 |             rotationAngle: 0,
  223 |           },
  224 |         ],
  225 |       });
  226 |       el.dispatchEvent(touchStart);
  227 |     });
  228 | 
  229 |     // Verify refresh indicator or content update
  230 |     // (The exact behavior depends on timing and state)
  231 |   });
  232 | });
  233 | 
  234 | test.describe("Navigation Journey", () => {
  235 |   test("should navigate between all screens via bottom nav", async ({ page }) => {
  236 |     await page.goto("/");
  237 | 
  238 |     // Navigate to Search
  239 |     await page.click('role=link[name="Search"]');
  240 |     await expect(page).toHaveURL(/\/search/);
  241 | 
  242 |     // Navigate to Alerts
  243 |     await page.click('role=link[name="Alerts"]');
  244 |     await expect(page).toHaveURL(/\/alerts/);
  245 | 
  246 |     // Navigate to Map
  247 |     await page.click('role=link[name="Map"]');
  248 |     await expect(page).toHaveURL(/\/map/);
  249 | 
  250 |     // Navigate to Health
  251 |     await page.click('role=link[name="Health"]');
  252 |     await expect(page).toHaveURL(/\/health/);
  253 | 
  254 |     // Navigate back to Home
  255 |     await page.click('role=link[name="Home"]');
  256 |     await expect(page).toHaveURL("/");
  257 |   });
  258 | 
  259 |   test("should maintain scroll position when navigating back", async ({ page }) => {
  260 |     await page.goto("/station/725");
  261 | 
  262 |     // Scroll down
  263 |     await page.evaluate(() => window.scrollTo(0, 500));
  264 | 
  265 |     // Navigate back
  266 |     await page.click('role=link[name="Go back"]');
  267 | 
  268 |     // Should be on home
  269 |     await expect(page).toHaveURL("/");
  270 |   });
  271 | 
  272 |   test("should handle browser back button", async ({ page }) => {
  273 |     await page.goto("/");
  274 | 
  275 |     // Navigate to search
> 276 |     await page.click('role=link[name="Search"]');
      |                ^ Error: page.click: Test timeout of 30000ms exceeded.
  277 |     await expect(page).toHaveURL(/\/search/);
  278 | 
  279 |     // Use browser back
  280 |     await page.goBack();
  281 | 
  282 |     // Should be back on home
  283 |     await expect(page).toHaveURL("/");
  284 |   });
  285 | });
  286 | 
  287 | test.describe("Alerts Journey", () => {
  288 |   test.beforeEach(async ({ page }) => {
  289 |     await page.goto("/");
  290 |   });
  291 | 
  292 |   test("should navigate to alerts screen", async ({ page }) => {
  293 |     await page.click('role=link[name="Alerts"]');
  294 | 
  295 |     await expect(page).toHaveURL(/\/alerts/);
  296 |     await expect(page.locator('role=heading[name="Service Alerts"]')).toBeVisible();
  297 |   });
  298 | 
  299 |   test("should view service alerts by line", async ({ page }) => {
  300 |     await page.goto("/alerts");
  301 | 
  302 |     // Should see alert list or empty state
  303 |     const alertList = page.locator('role=region[name="Service Alerts"]');
  304 |     const hasAlerts = await alertList.count();
  305 | 
  306 |     if (hasAlerts > 0) {
  307 |       await expect(alertList).toBeVisible();
  308 |     }
  309 |     // Empty state is also valid
  310 |   });
  311 | 
  312 |   test("should filter alerts by severity", async ({ page }) => {
  313 |     await page.goto("/alerts");
  314 | 
  315 |     // Look for filter controls
  316 |     const filters = page.locator('role=button[name^="Filter"]');
  317 |     const hasFilters = await filters.count();
  318 | 
  319 |     if (hasFilters > 0) {
  320 |       await filters.first().click();
  321 |       // Verify filter is applied
  322 |     }
  323 |   });
  324 | });
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
```