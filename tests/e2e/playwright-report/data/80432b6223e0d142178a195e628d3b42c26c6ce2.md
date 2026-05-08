# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: commute-workflow.e2e.ts >> Commute Workflow >> Commute List View >> should display commute list screen
- Location: commute-workflow.e2e.ts:27:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('role=heading[name="Commute Presets"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('role=heading[name="Commute Presets"]')

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
  2   |  * E2E tests for the Commute Workflow.
  3   |  *
  4   |  * Tests cover:
  5   |  * - Commute list view
  6   |  * - Commute detail view
  7   |  * - Creating new commutes
  8   |  * - Editing existing commutes
  9   |  * - Deleting commutes
  10  |  * - Pinning commutes
  11  |  * - Commute analysis display
  12  |  * - Route comparison
  13  |  * - Transfer details
  14  |  * - Walking comparison
  15  |  * - Alert banners for commute lines
  16  |  */
  17  | 
  18  | import { expect, test } from "@playwright/test";
  19  | 
  20  | test.describe("Commute Workflow", () => {
  21  |   test.beforeEach(async ({ page }) => {
  22  |     // Navigate to commute screen
  23  |     await page.goto("/commute");
  24  |   });
  25  | 
  26  |   test.describe("Commute List View", () => {
  27  |     test("should display commute list screen", async ({ page }) => {
  28  |       // Should see heading
> 29  |       await expect(page.locator('role=heading[name="Commute Presets"]')).toBeVisible();
      |                                                                          ^ Error: expect(locator).toBeVisible() failed
  30  |     });
  31  | 
  32  |     test("should show empty state when no commutes", async ({ page }) => {
  33  |       // Clear any existing commutes
  34  |       await page.evaluate(() => {
  35  |         const data = localStorage.getItem("mta-favorites");
  36  |         if (data) {
  37  |           const parsed = JSON.parse(data);
  38  |           parsed.commutes = [];
  39  |           localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  40  |         }
  41  |       });
  42  |       await page.reload();
  43  | 
  44  |       // Should see empty state
  45  |       const emptyState = page.locator("text=/No commutes|Add your first commute/i");
  46  |       await expect(emptyState).toBeAttached();
  47  |     });
  48  | 
  49  |     test("should have 'Plan a commute' call to action in empty state", async ({ page }) => {
  50  |       await page.evaluate(() => {
  51  |         const data = localStorage.getItem("mta-favorites");
  52  |         if (data) {
  53  |           const parsed = JSON.parse(data);
  54  |           parsed.commutes = [];
  55  |           localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  56  |         }
  57  |       });
  58  |       await page.reload();
  59  | 
  60  |       const addButton = page.locator('role=button:has-text("Add")');
  61  |       await expect(addButton).toBeAttached();
  62  |     });
  63  | 
  64  |     test("should display trip journal link", async ({ page }) => {
  65  |       await expect(page.locator('role=heading[name="Trip Journal"]')).toBeVisible();
  66  | 
  67  |       const journalButton = page.locator('role=button:has-text("View Trip History")');
  68  |       await expect(journalButton).toBeVisible();
  69  |     });
  70  | 
  71  |     test("should navigate to journal when button is clicked", async ({ page }) => {
  72  |       await page.click('role=button:has-text("View Trip History")');
  73  | 
  74  |       await expect(page).toHaveURL("/journal");
  75  |     });
  76  | 
  77  |     test("should show maximum commutes message when limit reached", async ({ page }) => {
  78  |       // Add max commutes (10) via localStorage
  79  |       await page.evaluate(() => {
  80  |         const commutes = Array.from({ length: 10 }, (_, i) => ({
  81  |           id: `commute-${i}`,
  82  |           name: `Commute ${i + 1}`,
  83  |           origin: { stationId: "101", stationName: "South Ferry" },
  84  |           destination: { stationId: "725", stationName: "Times Sq-42 St" },
  85  |           preferredLines: ["1"],
  86  |           enableTransferSuggestions: true,
  87  |           isPinned: false,
  88  |         }));
  89  |         const data = localStorage.getItem("mta-favorites");
  90  |         const parsed = data ? JSON.parse(data) : { stations: [], commutes: [] };
  91  |         parsed.commutes = commutes;
  92  |         localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  93  |       });
  94  |       await page.reload();
  95  | 
  96  |       // Should show max message
  97  |       const maxMessage = page.locator("text=/Maximum.*commutes|limit reached/i");
  98  |       await expect(maxMessage).toBeAttached();
  99  |     });
  100 |   });
  101 | 
  102 |   test.describe("Commute Creation", () => {
  103 |     test.beforeEach(async ({ page }) => {
  104 |       // Clear existing commutes
  105 |       await page.evaluate(() => {
  106 |         const data = localStorage.getItem("mta-favorites");
  107 |         if (data) {
  108 |           const parsed = JSON.parse(data);
  109 |           parsed.commutes = [];
  110 |           localStorage.setItem("mta-favorites", JSON.stringify(parsed));
  111 |         }
  112 |       });
  113 |       await page.goto("/commute");
  114 |     });
  115 | 
  116 |     test("should open commute editor when Add is clicked", async ({ page }) => {
  117 |       const addButton = page.locator('role=button:has-text("Add")');
  118 |       const hasAdd = await addButton.count();
  119 | 
  120 |       if (hasAdd > 0) {
  121 |         await addButton.click();
  122 | 
  123 |         // Editor modal should appear
  124 |         const modal = page.locator('[role="dialog"]');
  125 |         await expect(modal).toBeVisible();
  126 |       }
  127 |     });
  128 | 
  129 |     test("should allow selecting origin station", async ({ page }) => {
```