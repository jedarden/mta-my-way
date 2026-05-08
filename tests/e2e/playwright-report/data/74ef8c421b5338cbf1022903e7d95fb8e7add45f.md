# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.e2e.ts >> Screen Reader Compatibility >> Dynamic Content >> should announce new arrivals
- Location: accessibility.e2e.ts:263:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('[aria-live="polite"]')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('[aria-live="polite"]')

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
  169 | 
  170 |       // Check that help text exists for search
  171 |       const searchInput = page.locator("role=searchbox");
  172 |       const hasDescription = await searchInput.evaluate((el) =>
  173 |         el.getAttribute("aria-describedby")
  174 |       );
  175 | 
  176 |       // aria-describedby is optional for search, so we just check it doesn't break
  177 |       expect(searchInput).toBeAttached();
  178 |     });
  179 |   });
  180 | 
  181 |   test.describe("Loading States", () => {
  182 |     test("should announce loading states", async ({ page }) => {
  183 |       // Navigate to a screen that loads data
  184 |       await page.goto("/alerts");
  185 | 
  186 |       // Check for loading indicators
  187 |       const loadingElements = page.locator('[aria-busy="true"]');
  188 |       const hasLoading = (await loadingElements.count()) > 0;
  189 | 
  190 |       // Loading indicators should either be present or finished
  191 |       if (hasLoading) {
  192 |         await expect(loadingElements.first()).toBeAttached();
  193 |       }
  194 |     });
  195 | 
  196 |     test("should announce empty states", async ({ page }) => {
  197 |       // Navigate to search
  198 |       await page.goto("/search");
  199 | 
  200 |       // Type a search that will return no results
  201 |       const searchInput = page.locator("role=searchbox");
  202 |       await searchInput.fill("xyznonexistentstation123");
  203 | 
  204 |       // Wait for results
  205 |       await page.waitForTimeout(250);
  206 | 
  207 |       // Check for empty state announcement
  208 |       const emptyState = page.locator("role=status", { hasText: /no stations found/i });
  209 |       const hasEmptyState = (await emptyState.count()) > 0;
  210 | 
  211 |       if (hasEmptyState) {
  212 |         await expect(emptyState).toBeVisible();
  213 |       }
  214 |     });
  215 |   });
  216 | 
  217 |   test.describe("Color Contrast", () => {
  218 |     test("should have sufficient color contrast for text", async ({ page }) => {
  219 |       // Playwright can't directly test color contrast,
  220 |       // but we can verify that colors are defined in CSS
  221 | 
  222 |       // This test ensures the application has loaded styles
  223 |       const bgColor = await page.evaluate(() => {
  224 |         const styles = window.getComputedStyle(document.body);
  225 |         return styles.backgroundColor;
  226 |       });
  227 | 
  228 |       expect(bgColor).toBeTruthy();
  229 |     });
  230 |   });
  231 | 
  232 |   test.describe("Screen Reader Announcements", () => {
  233 |     test("should announce favorite count changes", async ({ page }) => {
  234 |       // This test would require interacting with favorites
  235 |       // For now, we verify the badge structure
  236 | 
  237 |       const alertBadge = page.locator('[aria-label*="alert"]');
  238 |       const hasBadge = (await alertBadge.count()) > 0;
  239 | 
  240 |       if (hasBadge) {
  241 |         const ariaLabel = await alertBadge.first().getAttribute("aria-label");
  242 |         expect(ariaLabel).toMatch(/\d+ alerts?/);
  243 |       }
  244 |     });
  245 | 
  246 |     test("should have aria-labels on icon-only buttons", async ({ page }) => {
  247 |       // Check that icon-only buttons have accessible labels
  248 |       const iconButtons = page.locator("button:has(svg:not([aria-label]))");
  249 |       const count = await iconButtons.count();
  250 | 
  251 |       // All icon buttons should have aria-label or aria-describedby
  252 |       for (let i = 0; i < count; i++) {
  253 |         const button = iconButtons.nth(i);
  254 |         const hasLabel = await button.evaluate(
  255 |           (el) => el.hasAttribute("aria-label") || el.hasAttribute("aria-describedby")
  256 |         );
  257 |         expect(hasLabel).toBe(true);
  258 |       }
  259 |     });
  260 |   });
  261 | 
  262 |   test.describe("Dynamic Content", () => {
  263 |     test("should announce new arrivals", async ({ page }) => {
  264 |       // Navigate to a station
  265 |       await page.goto("/station/001");
  266 | 
  267 |       // Check for live region that announces arrivals
  268 |       const liveRegion = page.locator('[aria-live="polite"]');
> 269 |       await expect(liveRegion).toBeAttached();
      |                                ^ Error: expect(locator).toBeAttached() failed
  270 | 
  271 |       // Live region should update with arrival information
  272 |       // (actual content depends on API response)
  273 |     });
  274 | 
  275 |     test("should announce service alerts", async ({ page }) => {
  276 |       await page.goto("/alerts");
  277 | 
  278 |       // Check for alert regions
  279 |       const alertRegion = page.locator("role=alert");
  280 |       const hasAlerts = (await alertRegion.count()) > 0;
  281 | 
  282 |       if (hasAlerts) {
  283 |         await expect(alertRegion.first()).toBeVisible();
  284 |       }
  285 |     });
  286 |   });
  287 | });
  288 | 
```