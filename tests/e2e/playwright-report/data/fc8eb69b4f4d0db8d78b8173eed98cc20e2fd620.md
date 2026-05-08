# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: line-diagram.e2e.ts >> Line Diagram Screen >> Station Display >> should display all stations on the line
- Location: line-diagram.e2e.ts:46:5

# Error details

```
TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
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
  1   | /**
  2   |  * E2E tests for the Line Diagram screen.
  3   |  *
  4   |  * Tests cover:
  5   |  * - Line diagram rendering
  6   |  * - Station display on diagram
  7   |  * - Train position visualization
  8   |  * - Line selection
  9   |  * - Zoom/pan interactions
  10  |  * - Real-time updates
  11  |  */
  12  | 
  13  | import { expect, test } from "@playwright/test";
  14  | 
  15  | test.describe("Line Diagram Screen", () => {
  16  |   test.beforeEach(async ({ page }) => {
  17  |     // Navigate to a specific line diagram (e.g., line 1)
  18  |     await page.goto("/diagram/1");
  19  |   });
  20  | 
  21  |   test.describe("Diagram Loading", () => {
  22  |     test("should load line diagram successfully", async ({ page }) => {
  23  |       // Should see SVG diagram
  24  |       const diagram = page.locator("svg");
  25  |       await expect(diagram.first()).toBeVisible();
  26  |     });
  27  | 
  28  |     test("should show line name/identifier", async ({ page }) => {
  29  |       const lineHeading = page.locator("role=heading:has-text(/1 Train|Line 1|Broadway/i)");
  30  |       const hasHeading = await lineHeading.count();
  31  | 
  32  |       if (hasHeading > 0) {
  33  |         await expect(lineHeading).toBeVisible();
  34  |       }
  35  |     });
  36  | 
  37  |     test("should have back button", async ({ page }) => {
  38  |       const backButton = page.locator(
  39  |         'role=link[aria-label*="back" i], role=button[aria-label*="back" i]'
  40  |       );
  41  |       await expect(backButton.first()).toBeAttached();
  42  |     });
  43  |   });
  44  | 
  45  |   test.describe("Station Display", () => {
  46  |     test("should display all stations on the line", async ({ page }) => {
> 47  |       await page.waitForSelector("svg", { timeout: 5000 });
      |                  ^ TimeoutError: page.waitForSelector: Timeout 5000ms exceeded.
  48  | 
  49  |       // Look for station markers (circles or nodes)
  50  |       const stations = page.locator("circle, [role='button'][aria-label*='station' i]");
  51  |       const count = await stations.count();
  52  | 
  53  |       expect(count).toBeGreaterThan(0);
  54  |     });
  55  | 
  56  |     test("should show station names", async ({ page }) => {
  57  |       await page.waitForSelector("svg", { timeout: 5000 });
  58  | 
  59  |       // Look for text labels in SVG
  60  |       const labels = page.locator("svg text, [class*='label' i], [class*='station' i]");
  61  |       const hasLabels = await labels.count();
  62  | 
  63  |       if (hasLabels > 0) {
  64  |         await expect(labels.first()).toBeVisible();
  65  |       }
  66  |     });
  67  | 
  68  |     test("should highlight transfer stations", async ({ page }) => {
  69  |       await page.waitForSelector("svg", { timeout: 5000 });
  70  | 
  71  |       // Transfer stations might have different visual treatment
  72  |       const transferStations = page.locator("[class*='transfer' i], [data-transfer='true']");
  73  |       const hasTransfers = await transferStations.count();
  74  | 
  75  |       if (hasTransfers > 0) {
  76  |         await expect(transferStations.first()).toBeVisible();
  77  |       }
  78  |     });
  79  | 
  80  |     test("should show accessible stations indicator", async ({ page }) => {
  81  |       await page.waitForSelector("svg", { timeout: 5000 });
  82  | 
  83  |       const adaIndicator = page.locator(
  84  |         "[class*='ada' i], [class*='accessible' i], [aria-label*='accessible' i]"
  85  |       );
  86  |       const hasAda = await adaIndicator.count();
  87  | 
  88  |       if (hasAda > 0) {
  89  |         await expect(adaIndicator.first()).toBeAttached();
  90  |       }
  91  |     });
  92  |   });
  93  | 
  94  |   test.describe("Train Position Visualization", () => {
  95  |     test("should display train positions on the diagram", async ({ page }) => {
  96  |       await page.waitForSelector("svg", { timeout: 10000 });
  97  | 
  98  |       // Look for train markers
  99  |       const trains = page.locator("[class*='train' i], [data-train], circle[class*='active' i]");
  100 |       const hasTrains = await trains.count();
  101 | 
  102 |       // Trains might not always be visible
  103 |       if (hasTrains > 0) {
  104 |         await expect(trains.first()).toBeVisible();
  105 |       }
  106 |     });
  107 | 
  108 |     test("should show train direction indicators", async ({ page }) => {
  109 |       await page.waitForSelector("svg", { timeout: 10000 });
  110 | 
  111 |       // Look for direction indicators (arrows, distinct colors, etc.)
  112 |       const directionIndicators = page.locator(
  113 |         "[class*='direction' i], [class*='northbound' i], [class*='southbound' i]"
  114 |       );
  115 |       const hasDirection = await directionIndicators.count();
  116 | 
  117 |       if (hasDirection > 0) {
  118 |         await expect(directionIndicators.first()).toBeAttached();
  119 |       }
  120 |     });
  121 | 
  122 |     test("should indicate next train to destination", async ({ page }) => {
  123 |       await page.waitForSelector("svg", { timeout: 10000 });
  124 | 
  125 |       // Look for highlighted train (pulsing, larger, different color)
  126 |       const nextTrain = page.locator(
  127 |         "[class*='next' i], [class*='highlight' i], [class*='pulsing' i]"
  128 |       );
  129 |       const hasNext = await nextTrain.count();
  130 | 
  131 |       if (hasNext > 0) {
  132 |         await expect(nextTrain.first()).toBeVisible();
  133 |       }
  134 |     });
  135 | 
  136 |     test("should display train spacing at a glance", async ({ page }) => {
  137 |       await page.waitForSelector("svg", { timeout: 10000 });
  138 | 
  139 |       // Should show multiple trains to demonstrate spacing
  140 |       const trains = page.locator("[class*='train' i], [data-train]");
  141 |       const count = await trains.count();
  142 | 
  143 |       // Multiple trains should be visible when service is running
  144 |       if (count > 1) {
  145 |         // Check that trains are at different positions
  146 |         const firstTrain = trains.first();
  147 |         const lastTrain = trains.last();
```