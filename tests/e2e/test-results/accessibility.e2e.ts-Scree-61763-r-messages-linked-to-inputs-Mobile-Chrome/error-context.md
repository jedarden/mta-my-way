# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.e2e.ts >> Screen Reader Compatibility >> Form Inputs >> should have error messages linked to inputs
- Location: accessibility.e2e.ts:165:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.evaluate: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('role=searchbox')

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
  72  |     test("should allow tab navigation through interactive elements", async ({ page }) => {
  73  |       // Start at home
  74  |       await page.goto("/");
  75  | 
  76  |       // Tab through bottom nav items
  77  |       const navItems = page.locator("role=navigation").locator("role=link");
  78  |       const count = await navItems.count();
  79  | 
  80  |       for (let i = 0; i < count; i++) {
  81  |         await page.keyboard.press("Tab");
  82  |         const focused = await page.evaluate(() => document.activeElement?.tagName);
  83  |         expect(focused).toBe("A");
  84  |       }
  85  |     });
  86  | 
  87  |     test("should allow Enter/Space on cards for navigation", async ({ page }) => {
  88  |       await page.goto("/");
  89  | 
  90  |       // Focus on first card (if any exist)
  91  |       const firstCard = page.locator("role=article").first();
  92  |       const hasCards = (await firstCard.count()) > 0;
  93  | 
  94  |       if (hasCards) {
  95  |         await firstCard.focus();
  96  |         await page.keyboard.press("Enter");
  97  | 
  98  |         // Should navigate to station details
  99  |         await page.waitForURL(/\/station\//);
  100 |       }
  101 |     });
  102 | 
  103 |     test("should close modals with Escape key", async ({ page }) => {
  104 |       // This test assumes there's a way to open a modal
  105 |       // Since we're testing on the home page without user data,
  106 |       // we'll verify the Escape key behavior is registered
  107 | 
  108 |       await page.keyboard.press("Escape");
  109 |       // If a modal was open, it should be closed now
  110 |       // The exact assertion depends on the modal implementation
  111 |     });
  112 |   });
  113 | 
  114 |   test.describe("Focus Management", () => {
  115 |     test("should move focus to main on route change", async ({ page }) => {
  116 |       // Navigate to alerts
  117 |       await page.click('role=link[name="Alerts"]');
  118 | 
  119 |       // Check that main content is focused or focusable
  120 |       const main = page.locator("role=main");
  121 |       const tabIndex = await main.getAttribute("tabIndex");
  122 |       expect(tabIndex).toBe("-1");
  123 | 
  124 |       // Main element should be able to receive focus
  125 |       await main.focus();
  126 |       const focused = await page.evaluate(() => document.activeElement?.getAttribute("role"));
  127 |       expect(focused).toBe("main");
  128 |     });
  129 |   });
  130 | 
  131 |   test.describe("Interactive Elements", () => {
  132 |     test("should have accessible buttons with labels", async ({ page }) => {
  133 |       // Check alert notification button
  134 |       const alertButton = page.locator('role=button[name="View alerts"]');
  135 |       await expect(alertButton).toBeVisible();
  136 |     });
  137 | 
  138 |     test("should have aria-pressed on toggle buttons", async ({ page }) => {
  139 |       // Navigate to favorites section
  140 |       const favoritesLink = page.locator('role=link[name="Home"]');
  141 |       await favoritesLink.click();
  142 | 
  143 |       // Look for any favorite toggle buttons (if any favorites exist)
  144 |       const toggleButtons = page.locator("[aria-pressed]");
  145 |       const count = await toggleButtons.count();
  146 | 
  147 |       for (let i = 0; i < count; i++) {
  148 |         const pressed = await toggleButtons.nth(i).getAttribute("aria-pressed");
  149 |         expect(["true", "false"]).toContain(pressed);
  150 |       }
  151 |     });
  152 |   });
  153 | 
  154 |   test.describe("Form Inputs", () => {
  155 |     test("should have proper labels on form inputs", async ({ page }) => {
  156 |       // Navigate to search
  157 |       await page.click('role=link[name="Search"]');
  158 | 
  159 |       // Check search input
  160 |       const searchInput = page.locator('role=searchbox[name="Search stations"]');
  161 |       await expect(searchInput).toBeVisible();
  162 |       await expect(searchInput).toBeFocused();
  163 |     });
  164 | 
  165 |     test("should have error messages linked to inputs", async ({ page }) => {
  166 |       // This test would require triggering an error state
  167 |       // For now, we verify the structure is in place
  168 |       await page.goto("/search");
  169 | 
  170 |       // Check that help text exists for search
  171 |       const searchInput = page.locator("role=searchbox");
> 172 |       const hasDescription = await searchInput.evaluate((el) =>
      |                                                ^ Error: locator.evaluate: Test timeout of 30000ms exceeded.
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
  269 |       await expect(liveRegion).toBeAttached();
  270 | 
  271 |       // Live region should update with arrival information
  272 |       // (actual content depends on API response)
```