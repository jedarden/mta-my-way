# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-journeys.e2e.ts >> Station Detail Journey >> should view station arrivals
- Location: user-journeys.e2e.ts:93:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('role=heading[name=/Times Sq-42 St/i]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('role=heading[name=/Times Sq-42 St/i]')

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
  1   | /**
  2   |  * E2E tests for critical user journeys and full-stack workflows.
  3   |  *
  4   |  * Tests cover:
  5   |  * - Search and discovery workflow
  6   |  * - Station detail and arrivals viewing
  7   |  * - Favorites management
  8   |  * - Navigation between screens
  9   |  * - Alerts viewing
  10  |  * - Commute workflow
  11  |  */
  12  | 
  13  | import { expect, test } from "@playwright/test";
  14  | 
  15  | test.describe("Search Journey", () => {
  16  |   test.beforeEach(async ({ page }) => {
  17  |     await page.goto("/");
  18  |   });
  19  | 
  20  |   test("should navigate to search and see popular stations", async ({ page }) => {
  21  |     // Click search in bottom nav
  22  |     await page.click('role=link[name="Search"]');
  23  | 
  24  |     // Should be on search page
  25  |     await expect(page).toHaveURL(/\/search/);
  26  | 
  27  |     // Should see popular stations section
  28  |     await expect(page.locator("text=/popular stations/i")).toBeVisible();
  29  | 
  30  |     // Should see Times Square in popular stations
  31  |     await expect(page.locator("text=/Times Sq-42 St/i")).toBeVisible();
  32  |   });
  33  | 
  34  |   test("should search for a station and see results", async ({ page }) => {
  35  |     await page.goto("/search");
  36  | 
  37  |     // Type in search box
  38  |     const searchInput = page.locator('role=searchbox[name="Search stations"]');
  39  |     await searchInput.fill("Times");
  40  | 
  41  |     // Wait for results
  42  |     await page.waitForTimeout(250);
  43  | 
  44  |     // Should see Times Square in results
  45  |     await expect(page.locator("text=/Times Sq-42 St/i")).toBeVisible();
  46  | 
  47  |     // Should show line bullets
  48  |     await expect(page.locator('[data-line="1"]')).toBeVisible();
  49  |   });
  50  | 
  51  |   test("should click a search result and navigate to station detail", async ({ page }) => {
  52  |     await page.goto("/search");
  53  | 
  54  |     // Search for Times Square
  55  |     const searchInput = page.locator('role=searchbox[name="Search stations"]');
  56  |     await searchInput.fill("Times");
  57  |     await page.waitForTimeout(250);
  58  | 
  59  |     // Click on Times Square result
  60  |     await page.click("role=link[name=/Times Sq-42 St/i]");
  61  | 
  62  |     // Should navigate to station detail
  63  |     await expect(page).toHaveURL(/\/station\/725/);
  64  | 
  65  |     // Should see station name
  66  |     await expect(page.locator("role=heading[name=/Times Sq-42 St/i]")).toBeVisible();
  67  |   });
  68  | 
  69  |   test("should show empty state for no search results", async ({ page }) => {
  70  |     await page.goto("/search");
  71  | 
  72  |     // Type nonsense search
  73  |     const searchInput = page.locator('role=searchbox[name="Search stations"]');
  74  |     await searchInput.fill("xyznonexistentstation123");
  75  | 
  76  |     // Wait for results
  77  |     await page.waitForTimeout(250);
  78  | 
  79  |     // Should show empty state or no results
  80  |     const hasEmptyState = await page.locator("text=/no stations found/i").count();
  81  |     const hasPopular = await page.locator("text=/popular stations/i").count();
  82  | 
  83  |     // Either empty state or back to popular stations
  84  |     expect(hasEmptyState + hasPopular).toBeGreaterThan(0);
  85  |   });
  86  | });
  87  | 
  88  | test.describe("Station Detail Journey", () => {
  89  |   test.beforeEach(async ({ page }) => {
  90  |     await page.goto("/");
  91  |   });
  92  | 
  93  |   test("should view station arrivals", async ({ page }) => {
  94  |     // Navigate to Times Square
  95  |     await page.goto("/station/725");
  96  | 
  97  |     // Should see station name
> 98  |     await expect(page.locator("role=heading[name=/Times Sq-42 St/i]")).toBeVisible();
      |                                                                        ^ Error: expect(locator).toBeVisible() failed
  99  | 
  100 |     // Should see arrivals section
  101 |     await expect(page.locator('role=heading[name="Arrivals"]')).toBeVisible();
  102 | 
  103 |     // Should see refresh button
  104 |     await expect(page.locator('role=button[name="Refresh arrivals"]')).toBeVisible();
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
```