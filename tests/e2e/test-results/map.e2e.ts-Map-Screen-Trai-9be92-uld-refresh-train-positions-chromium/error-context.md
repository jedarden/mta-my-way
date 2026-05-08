# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: map.e2e.ts >> Map Screen >> Train Positions >> should refresh train positions
- Location: map.e2e.ts:103:5

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
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
  4   |  * Tests cover:
  5   |  * - Map loading and rendering
  6   |  * - Station interaction
  7   |  * - Train position display
  8   |  * - Line filtering
  9   |  * - Map refresh functionality
  10  |  * - Mobile touch interactions
  11  |  */
  12  | 
  13  | import { expect, test } from "@playwright/test";
  14  | 
  15  | test.describe("Map Screen", () => {
  16  |   test.beforeEach(async ({ page }) => {
  17  |     await page.goto("/map");
  18  |   });
  19  | 
  20  |   test.describe("Map Loading", () => {
  21  |     test("should load map successfully", async ({ page }) => {
  22  |       // Should see map container
  23  |       const mapContainer = page.locator("svg").first();
  24  |       await expect(mapContainer).toBeVisible();
  25  | 
  26  |       // Should see map header
  27  |       await expect(page.locator('role=heading[name="Transit Map"]')).toBeVisible();
  28  |     });
  29  | 
  30  |     test("should show loading state initially", async ({ page }) => {
  31  |       // Map skeleton should be visible while loading
  32  |       const skeleton = page.locator('[aria-busy="true"]');
  33  |       const hasSkeleton = await skeleton.count();
  34  | 
  35  |       // Skeleton might be gone quickly, so we just verify the map loads
  36  |       await page.waitForSelector("svg", { timeout: 5000 });
  37  |     });
  38  | 
  39  |     test("should display station markers on map", async ({ page }) => {
  40  |       // Wait for map to load
  41  |       await page.waitForSelector("svg", { timeout: 5000 });
  42  | 
  43  |       // Should have station circles
  44  |       const stationCircles = page.locator("circle").or(page.locator('[role="button"]'));
  45  |       const count = await stationCircles.count();
  46  | 
  47  |       expect(count).toBeGreaterThan(0);
  48  |     });
  49  |   });
  50  | 
  51  |   test.describe("Station Interaction", () => {
  52  |     test("should open station details modal on station tap", async ({ page }) => {
  53  |       await page.waitForSelector("svg", { timeout: 5000 });
  54  | 
  55  |       // Find and tap a station marker
  56  |       const stationMarker = page.locator("circle").first();
  57  |       const hasMarker = await stationMarker.count();
  58  | 
  59  |       if (hasMarker > 0) {
  60  |         await stationMarker.click();
  61  | 
  62  |         // Station details modal should appear
  63  |         const modal = page.locator("role=dialog").or(page.locator('[role="dialog"]'));
  64  |         const hasModal = await modal.count();
  65  | 
  66  |         if (hasModal > 0) {
  67  |           await expect(modal.first()).toBeVisible();
  68  |         }
  69  |       }
  70  |     });
  71  | 
  72  |     test("should close station details modal", async ({ page }) => {
  73  |       await page.waitForSelector("svg", { timeout: 5000 });
  74  | 
  75  |       // Try to find a close button or back button
  76  |       const closeButton = page.locator(
  77  |         'role=button[aria-label*="Close" i], role=button[aria-label*="Back" i]'
  78  |       );
  79  |       const hasClose = await closeButton.count();
  80  | 
  81  |       if (hasClose > 0) {
  82  |         await closeButton.first().click();
  83  |       }
  84  |     });
  85  |   });
  86  | 
  87  |   test.describe("Train Positions", () => {
  88  |     test("should display train position indicators", async ({ page }) => {
  89  |       await page.waitForSelector("svg", { timeout: 10000 });
  90  | 
  91  |       // Look for train indicators (could be dots, circles, or other markers)
  92  |       const trainIndicators = page.locator(
  93  |         '[class*="train" i], [data-train], circle[class*="active" i]'
  94  |       );
  95  |       const hasTrains = await trainIndicators.count();
  96  | 
  97  |       // Trains may not be visible immediately or at all times
  98  |       if (hasTrains > 0) {
  99  |         await expect(trainIndicators.first()).toBeVisible();
  100 |       }
  101 |     });
  102 | 
  103 |     test("should refresh train positions", async ({ page }) => {
> 104 |       await page.waitForSelector("svg", { timeout: 10000 });
      |                  ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  105 | 
  106 |       // Find refresh button
  107 |       const refreshButton = page
  108 |         .locator('role=button[aria-label*="refresh" i]')
  109 |         .or(page.locator('role=button:has-text("Refresh")'));
  110 |       const hasRefresh = await refreshButton.count();
  111 | 
  112 |       if (hasRefresh > 0) {
  113 |         const initialContent = await page.content();
  114 | 
  115 |         await refreshButton.first().click();
  116 | 
  117 |         // Wait a moment for refresh
  118 |         await page.waitForTimeout(2000);
  119 | 
  120 |         // Content should still be loaded
  121 |         await expect(page.locator("svg")).toBeVisible();
  122 |       }
  123 |     });
  124 |   });
  125 | 
  126 |   test.describe("Line Filtering", () => {
  127 |     test("should show filter button", async ({ page }) => {
  128 |       const filterButton = page
  129 |         .locator('role=button:has-text("Filter")')
  130 |         .or(page.locator('role=button[aria-label*="filter" i]'));
  131 |       await expect(filterButton).toBeVisible();
  132 |     });
  133 | 
  134 |     test("should open line filter panel", async ({ page }) => {
  135 |       const filterButton = page
  136 |         .locator('role=button:has-text("Filter")')
  137 |         .or(page.locator('role=button[aria-label*="filter" i]'));
  138 | 
  139 |       await filterButton.click();
  140 | 
  141 |       // Should see filter panel with line buttons
  142 |       const lineButtons = page.locator(
  143 |         'role=button[aria-pressed="true"], role=button[aria-pressed="false"]'
  144 |       );
  145 |       await expect(lineButtons.first()).toBeVisible();
  146 |     });
  147 | 
  148 |     test("should filter by specific line", async ({ page }) => {
  149 |       const filterButton = page
  150 |         .locator('role=button:has-text("Filter")')
  151 |         .or(page.locator('role=button[aria-label*="filter" i]'));
  152 | 
  153 |       await filterButton.click();
  154 | 
  155 |       // Find a line button (e.g., "1", "A", "F")
  156 |       const lineButton = page
  157 |         .locator("role=button")
  158 |         .filter({ hasText: /^[1-9A-Z]$/ })
  159 |         .first();
  160 |       const hasLineButton = await lineButton.count();
  161 | 
  162 |       if (hasLineButton > 0) {
  163 |         await lineButton.click();
  164 | 
  165 |         // Filter indicator should update
  166 |         const filterCount = page
  167 |           .locator("role=button:has-text(/Filter\\s*\\d+/)")
  168 |           .or(page.locator('[class*="badge"], [class*="count"]'));
  169 |         const hasCount = await filterCount.count();
  170 | 
  171 |         if (hasCount > 0) {
  172 |           await expect(filterCount.first()).toBeVisible();
  173 |         }
  174 |       }
  175 |     });
  176 | 
  177 |     test("should clear all filters", async ({ page }) => {
  178 |       const filterButton = page
  179 |         .locator('role=button:has-text("Filter")')
  180 |         .or(page.locator('role=button[aria-label*="filter" i]'));
  181 | 
  182 |       await filterButton.click();
  183 | 
  184 |       // Look for "Clear" or "All" button
  185 |       const clearButton = page
  186 |         .locator('role=button:has-text("Clear")')
  187 |         .or(page.locator('role=button:has-text("All")'));
  188 |       const hasClear = await clearButton.count();
  189 | 
  190 |       if (hasClear > 0) {
  191 |         await clearButton.first().click();
  192 | 
  193 |         // Filters should be cleared
  194 |         const filterCount = page.locator("role=button:has-text(/Filter\\s*\\d+/)");
  195 |         const hasCount = await filterCount.count();
  196 | 
  197 |         if (hasCount > 0) {
  198 |           // Count badge should be gone or show 0
  199 |           expect(await filterCount.first().textContent()).not.toMatch(/\d+/);
  200 |         }
  201 |       }
  202 |     });
  203 | 
  204 |     test("should close filter panel", async ({ page }) => {
```