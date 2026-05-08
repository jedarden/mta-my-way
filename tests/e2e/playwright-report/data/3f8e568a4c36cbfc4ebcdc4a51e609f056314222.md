# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-journeys.e2e.ts >> Favorites Management >> should refresh arrivals on home screen
- Location: user-journeys.e2e.ts:198:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.evaluate: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('role=main').first()

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
  105 |   });
  106 | 
  107 |   test("should add station to favorites from detail page", async ({ page }) => {
  108 |     // Navigate to a station
  109 |     await page.goto("/station/725");
  110 | 
  111 |     // Find and click the favorite button
  112 |     const favoriteButton = page.locator('role=button[aria-pressed="false"]').first();
  113 |     const hasFavoriteButton = await favoriteButton.count();
  114 | 
  115 |     if (hasFavoriteButton > 0) {
  116 |       await favoriteButton.click();
  117 | 
  118 |       // Button should now be pressed
  119 |       await expect(page.locator('role=button[aria-pressed="true"]')).toBeVisible();
  120 |     }
  121 |   });
  122 | 
  123 |   test("should navigate back to home from station detail", async ({ page }) => {
  124 |     await page.goto("/station/725");
  125 | 
  126 |     // Click back button
  127 |     await page.click('role=link[name="Go back"]');
  128 | 
  129 |     // Should be on home page
  130 |     await expect(page).toHaveURL("/");
  131 |   });
  132 | 
  133 |   test("should view station alerts if present", async ({ page }) => {
  134 |     await page.goto("/station/725");
  135 | 
  136 |     // Check if alert banner exists (may not always be present)
  137 |     const alertBanner = page.locator('role=region[name="Service Alerts"]');
  138 |     const hasAlerts = await alertBanner.count();
  139 | 
  140 |     if (hasAlerts > 0) {
  141 |       await expect(alertBanner).toBeVisible();
  142 |     }
  143 |     // If no alerts, that's also valid
  144 |   });
  145 | });
  146 | 
  147 | test.describe("Favorites Management", () => {
  148 |   test.beforeEach(async ({ page }) => {
  149 |     // Use storage state to bypass onboarding
  150 |     await page.goto("/");
  151 |   });
  152 | 
  153 |   test("should add a station to favorites from search", async ({ page }) => {
  154 |     await page.goto("/search");
  155 | 
  156 |     // Find a favorite toggle button on popular stations
  157 |     const favoriteButton = page.locator('role=button[aria-pressed="false"]').first();
  158 | 
  159 |     const hasFavoriteButton = await favoriteButton.count();
  160 | 
  161 |     if (hasFavoriteButton > 0) {
  162 |       const ariaLabelBefore = await favoriteButton.getAttribute("aria-label");
  163 | 
  164 |       await favoriteButton.click();
  165 | 
  166 |       // aria-label should change to indicate favorited
  167 |       const ariaLabelAfter = await favoriteButton.getAttribute("aria-label");
  168 |       expect(ariaLabelAfter).not.toBe(ariaLabelBefore);
  169 |       expect(ariaLabelAfter).toContain("Remove");
  170 |     }
  171 |   });
  172 | 
  173 |   test("should view favorites on home screen", async ({ page }) => {
  174 |     await page.goto("/");
  175 | 
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
> 205 |     await container.evaluate((el) => {
      |                     ^ Error: locator.evaluate: Test timeout of 30000ms exceeded.
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
  276 |     await page.click('role=link[name="Search"]');
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
```