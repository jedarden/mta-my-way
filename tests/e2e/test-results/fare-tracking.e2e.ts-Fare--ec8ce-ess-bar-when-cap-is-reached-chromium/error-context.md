# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fare-tracking.e2e.ts >> Fare Tracking >> Fare Cap States >> should show green progress bar when cap is reached
- Location: fare-tracking.e2e.ts:117:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/Free rides|12\\/12/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/Free rides|12\\/12/i')

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
  33  | 
  34  |       // Should see fare tracker section
  35  |       const fareTracker = page.locator("text=/OMNY Fare Cap|Fare Cap/i");
  36  |       await expect(fareTracker).toBeAttached();
  37  |     });
  38  | 
  39  |     test("should show weekly rides count", async ({ page }) => {
  40  |       await page.addInitScript(() => {
  41  |         const fareData = {
  42  |           weeklyRides: 8,
  43  |           monthlyRides: 32,
  44  |           currentFare: 2.9,
  45  |           unlimitedPassPrice: 132,
  46  |           lastReset: new Date().toISOString(),
  47  |         };
  48  |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  49  |       });
  50  | 
  51  |       await page.goto("/");
  52  | 
  53  |       // Should show rides count (8/12 or similar)
  54  |       const ridesText = page.locator("text=/\\d+\\/\\d+|rides/i");
  55  |       await expect(ridesText).toBeAttached();
  56  |     });
  57  | 
  58  |     test("should show progress bar toward fare cap", async ({ page }) => {
  59  |       await page.addInitScript(() => {
  60  |         const fareData = {
  61  |           weeklyRides: 8,
  62  |           monthlyRides: 32,
  63  |           currentFare: 2.9,
  64  |           unlimitedPassPrice: 132,
  65  |           lastReset: new Date().toISOString(),
  66  |         };
  67  |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  68  |       });
  69  | 
  70  |       await page.goto("/");
  71  | 
  72  |       // Should have progress bar element
  73  |       const progressBar = page.locator('[role="progressbar"]');
  74  |       await expect(progressBar).toBeAttached();
  75  |     });
  76  | 
  77  |     test("should show rides until free", async ({ page }) => {
  78  |       await page.addInitScript(() => {
  79  |         const fareData = {
  80  |           weeklyRides: 8,
  81  |           monthlyRides: 32,
  82  |           currentFare: 2.9,
  83  |           unlimitedPassPrice: 132,
  84  |           lastReset: new Date().toISOString(),
  85  |         };
  86  |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  87  |       });
  88  | 
  89  |       await page.goto("/");
  90  | 
  91  |       // Should show "X more until free"
  92  |       const untilFree = page.locator("text=/more until free|free rides/i");
  93  |       await expect(untilFree).toBeAttached();
  94  |     });
  95  | 
  96  |     test("should show weekly spend", async ({ page }) => {
  97  |       await page.addInitScript(() => {
  98  |         const fareData = {
  99  |           weeklyRides: 8,
  100 |           monthlyRides: 32,
  101 |           currentFare: 2.9,
  102 |           unlimitedPassPrice: 132,
  103 |           lastReset: new Date().toISOString(),
  104 |         };
  105 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  106 |       });
  107 | 
  108 |       await page.goto("/");
  109 | 
  110 |       // Should show weekly spend amount
  111 |       const weeklySpend = page.locator("text=/\\$\\d+\\.\\d+.*this week/i");
  112 |       await expect(weeklySpend).toBeAttached();
  113 |     });
  114 |   });
  115 | 
  116 |   test.describe("Fare Cap States", () => {
  117 |     test("should show green progress bar when cap is reached", async ({ page }) => {
  118 |       await page.addInitScript(() => {
  119 |         const fareData = {
  120 |           weeklyRides: 12,
  121 |           monthlyRides: 48,
  122 |           currentFare: 2.9,
  123 |           unlimitedPassPrice: 132,
  124 |           lastReset: new Date().toISOString(),
  125 |         };
  126 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  127 |       });
  128 | 
  129 |       await page.goto("/");
  130 | 
  131 |       // Should show "Free rides!" message
  132 |       const freeRides = page.locator("text=/Free rides|12\\/12/i");
> 133 |       await expect(freeRides).toBeAttached();
      |                               ^ Error: expect(locator).toBeAttached() failed
  134 |     });
  135 | 
  136 |     test("should show amber color when close to cap (10+ rides)", async ({ page }) => {
  137 |       await page.addInitScript(() => {
  138 |         const fareData = {
  139 |           weeklyRides: 10,
  140 |           monthlyRides: 40,
  141 |           currentFare: 2.9,
  142 |           unlimitedPassPrice: 132,
  143 |           lastReset: new Date().toISOString(),
  144 |         };
  145 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  146 |       });
  147 | 
  148 |       await page.goto("/");
  149 | 
  150 |       // Should show nudge message
  151 |       const nudge = page.locator("text=/Take.*more.*for free/i");
  152 |       await expect(nudge).toBeAttached();
  153 |     });
  154 | 
  155 |     test("should show default color when far from cap", async ({ page }) => {
  156 |       await page.addInitScript(() => {
  157 |         const fareData = {
  158 |           weeklyRides: 3,
  159 |           monthlyRides: 12,
  160 |           currentFare: 2.9,
  161 |           unlimitedPassPrice: 132,
  162 |           lastReset: new Date().toISOString(),
  163 |         };
  164 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  165 |       });
  166 | 
  167 |       await page.goto("/");
  168 | 
  169 |       // Should show regular progress
  170 |       const progressText = page.locator("text=/3\\/12|more until free/i");
  171 |       await expect(progressText).toBeAttached();
  172 |     });
  173 |   });
  174 | 
  175 |   test.describe("Monthly Comparison", () => {
  176 |     test("should show monthly rides count", async ({ page }) => {
  177 |       await page.addInitScript(() => {
  178 |         const fareData = {
  179 |           weeklyRides: 8,
  180 |           monthlyRides: 32,
  181 |           currentFare: 2.9,
  182 |           unlimitedPassPrice: 132,
  183 |           lastReset: new Date().toISOString(),
  184 |         };
  185 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  186 |       });
  187 | 
  188 |       await page.goto("/");
  189 | 
  190 |       // Should show monthly rides
  191 |       const monthlyRides = page.locator("text=/This month.*rides|32.*rides/i");
  192 |       await expect(monthlyRides).toBeAttached();
  193 |     });
  194 | 
  195 |     test("should show unlimited pass comparison when pay-per-ride is better", async ({ page }) => {
  196 |       await page.addInitScript(() => {
  197 |         const fareData = {
  198 |           weeklyRides: 8,
  199 |           monthlyRides: 32,
  200 |           currentFare: 2.9,
  201 |           unlimitedPassPrice: 132,
  202 |           lastReset: new Date().toISOString(),
  203 |         };
  204 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  205 |       });
  206 | 
  207 |       await page.goto("/");
  208 | 
  209 |       // Pay-per-ride: 32 * $2.90 = $92.80 vs $132 unlimited
  210 |       // Should show pay-per-ride saves
  211 |       const savingsText = page.locator("text=/saves|Pay-per-ride/i");
  212 |       await expect(savingsText).toBeAttached();
  213 |     });
  214 | 
  215 |     test("should show unlimited pass is better when applicable", async ({ page }) => {
  216 |       await page.addInitScript(() => {
  217 |         const fareData = {
  218 |           weeklyRides: 15,
  219 |           monthlyRides: 60,
  220 |           currentFare: 2.9,
  221 |           unlimitedPassPrice: 132,
  222 |           lastReset: new Date().toISOString(),
  223 |         };
  224 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  225 |       });
  226 | 
  227 |       await page.goto("/");
  228 | 
  229 |       // Pay-per-ride: 60 * $2.90 = $174 vs $132 unlimited
  230 |       // Should show unlimited saves
  231 |       const unlimitedText = page.locator("text=/Unlimited saves/i");
  232 |       await expect(unlimitedText).toBeAttached();
  233 |     });
```