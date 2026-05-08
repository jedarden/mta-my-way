# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: subway-year.e2e.ts >> Stats / Subway Year Screen >> Empty State >> should show guidance message in empty state
- Location: subway-year.e2e.ts:80:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/Start tracking|Set up a commute/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/Start tracking|Set up a commute/i')

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
  2   |  * E2E tests for Stats / Subway Year Screen.
  3   |  *
  4   |  * Tests cover:
  5   |  * - Stats screen navigation
  6   |  * - Time window selection (month, quarter, year, all time)
  7   |  * - Subway Year card display
  8   |  * - Stats details sections
  9   |  * - Share functionality
  10  |  * - Empty state when no trips
  11  |  * - Carbon savings calculations
  12  |  * - Streak calculations
  13  |  * - Most used station/line
  14  |  * - Visual design of card
  15  |  */
  16  | 
  17  | import { expect, test } from "@playwright/test";
  18  | 
  19  | test.describe("Stats / Subway Year Screen", () => {
  20  |   test.describe("Navigation", () => {
  21  |     test("should navigate to stats screen from journal", async ({ page }) => {
  22  |       // Go to journal first
  23  |       await page.goto("/journal");
  24  | 
  25  |       // Look for stats link
  26  |       const statsLink = page.locator(
  27  |         'role=button:has-text("Subway Year"), role=link[href="/stats"]'
  28  |       );
  29  |       const hasLink = await statsLink.count();
  30  | 
  31  |       if (hasLink > 0) {
  32  |         await statsLink.click();
  33  |         await expect(page).toHaveURL("/stats");
  34  |       } else {
  35  |         // Navigate directly
  36  |         await page.goto("/stats");
  37  |         await expect(page).toHaveURL("/stats");
  38  |       }
  39  |     });
  40  | 
  41  |     test("should have back button to journal", async ({ page }) => {
  42  |       await page.goto("/stats");
  43  | 
  44  |       const backButton = page.locator('role=button:has-text("Back")');
  45  |       await expect(backButton).toBeVisible();
  46  | 
  47  |       await backButton.click();
  48  |       await expect(page).toHaveURL("/journal");
  49  |     });
  50  | 
  51  |     test("should display stats heading", async ({ page }) => {
  52  |       await page.goto("/stats");
  53  | 
  54  |       await expect(page.locator('role=heading[name="Your Subway Year"]')).toBeVisible();
  55  |     });
  56  | 
  57  |     test("should display description", async ({ page }) => {
  58  |       await page.goto("/stats");
  59  | 
  60  |       const description = page.locator("text=/personalized summary|subway commute/i");
  61  |       await expect(description).toBeAttached();
  62  |     });
  63  |   });
  64  | 
  65  |   test.describe("Empty State", () => {
  66  |     test.beforeEach(async ({ page }) => {
  67  |       // Clear journal data
  68  |       await page.addInitScript(() => {
  69  |         localStorage.removeItem("mta-journal");
  70  |       });
  71  |     });
  72  | 
  73  |     test("should show empty state when no trips recorded", async ({ page }) => {
  74  |       await page.goto("/stats");
  75  | 
  76  |       const emptyState = page.locator("text=/No trips recorded/i");
  77  |       await expect(emptyState).toBeVisible();
  78  |     });
  79  | 
  80  |     test("should show guidance message in empty state", async ({ page }) => {
  81  |       await page.goto("/stats");
  82  | 
  83  |       const guidance = page.locator("text=/Start tracking|Set up a commute/i");
> 84  |       await expect(guidance).toBeAttached();
      |                              ^ Error: expect(locator).toBeAttached() failed
  85  |     });
  86  | 
  87  |     test("should have link to set up commute", async ({ page }) => {
  88  |       await page.goto("/stats");
  89  | 
  90  |       const commuteLink = page.locator('role=button:has-text("Set up a commute")');
  91  |       await expect(commuteLink).toBeAttached();
  92  | 
  93  |       await commuteLink.click();
  94  |       await expect(page).toHaveURL("/commute");
  95  |     });
  96  |   });
  97  | 
  98  |   test.describe("Time Window Selection", () => {
  99  |     test.beforeEach(async ({ page }) => {
  100 |       // Set up some trip data
  101 |       await page.addInitScript(() => {
  102 |         const journalData = {
  103 |           "test-commute": {
  104 |             stats: {
  105 |               totalTrips: 50,
  106 |               totalMinutes: 1000,
  107 |               averageDuration: 20,
  108 |               medianDuration: 19,
  109 |             },
  110 |             records: Array.from({ length: 50 }, (_, i) => ({
  111 |               id: `trip-${i}`,
  112 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  113 |               origin: { stationId: "101", stationName: "South Ferry" },
  114 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  115 |               line: "1",
  116 |               actualDurationMinutes: 20,
  117 |               source: "tracked",
  118 |             })),
  119 |           },
  120 |         };
  121 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  122 |       });
  123 |     });
  124 | 
  125 |     test("should display time window selector", async ({ page }) => {
  126 |       await page.goto("/stats");
  127 | 
  128 |       const windows = ["This Month", "This Quarter", "This Year", "All Time"];
  129 | 
  130 |       for (const window of windows) {
  131 |         const button = page.locator(`role=button:has-text("${window}")`);
  132 |         await expect(button).toBeAttached();
  133 |       }
  134 |     });
  135 | 
  136 |     test("should allow switching time windows", async ({ page }) => {
  137 |       await page.goto("/stats");
  138 | 
  139 |       // Click on different windows
  140 |       const monthButton = page.locator('role=button:has-text("This Month")');
  141 |       await monthButton.click();
  142 | 
  143 |       // Should be selected
  144 |       const isSelected = await monthButton.evaluate((el) => {
  145 |         return (
  146 |           el.classList.contains("bg-mta-primary") || el.getAttribute("aria-pressed") === "true"
  147 |         );
  148 |       });
  149 | 
  150 |       if (isSelected) {
  151 |         await expect(isSelected).toBe(true);
  152 |       }
  153 | 
  154 |       // Try another window
  155 |       const yearButton = page.locator('role=button:has-text("This Year")');
  156 |       await yearButton.click();
  157 | 
  158 |       const yearSelected = await yearButton.evaluate((el) => {
  159 |         return (
  160 |           el.classList.contains("bg-mta-primary") || el.getAttribute("aria-pressed") === "true"
  161 |         );
  162 |       });
  163 | 
  164 |       if (yearSelected) {
  165 |         await expect(yearSelected).toBe(true);
  166 |       }
  167 |     });
  168 | 
  169 |     test("should update stats when time window changes", async ({ page }) => {
  170 |       await page.goto("/stats");
  171 | 
  172 |       // Get initial trip count
  173 |       const initialTrips = await page
  174 |         .locator("text=/Trips Taken/i")
  175 |         .locator("..")
  176 |         .locator("text=/\\d+/")
  177 |         .first()
  178 |         .textContent();
  179 | 
  180 |       // Switch to All Time
  181 |       await page.click('role=button:has-text("All Time")');
  182 | 
  183 |       // Wait for update
  184 |       await page.waitForTimeout(500);
```