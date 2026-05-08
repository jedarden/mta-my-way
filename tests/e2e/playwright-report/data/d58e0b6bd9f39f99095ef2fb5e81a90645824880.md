# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: subway-year.e2e.ts >> Stats / Subway Year Screen >> Subway Year Card >> should display Subway Year card
- Location: subway-year.e2e.ts:224:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('.from-\\[\\#0039A6\\]')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('.from-\\[\\#0039A6\\]')

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
  185 | 
  186 |       // Get updated trip count
  187 |       const updatedTrips = await page
  188 |         .locator("text=/Trips Taken/i")
  189 |         .locator("..")
  190 |         .locator("text=/\\d+/")
  191 |         .first()
  192 |         .textContent();
  193 | 
  194 |       expect(updatedTrips).toBeTruthy();
  195 |     });
  196 |   });
  197 | 
  198 |   test.describe("Subway Year Card", () => {
  199 |     test.beforeEach(async ({ page }) => {
  200 |       await page.addInitScript(() => {
  201 |         const journalData = {
  202 |           "test-commute": {
  203 |             stats: {
  204 |               totalTrips: 100,
  205 |               totalMinutes: 2000,
  206 |               averageDuration: 20,
  207 |               medianDuration: 19,
  208 |             },
  209 |             records: Array.from({ length: 100 }, (_, i) => ({
  210 |               id: `trip-${i}`,
  211 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  212 |               origin: { stationId: "101", stationName: "South Ferry" },
  213 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  214 |               line: "1",
  215 |               actualDurationMinutes: 20,
  216 |               source: "tracked",
  217 |             })),
  218 |           },
  219 |         };
  220 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  221 |       });
  222 |     });
  223 | 
  224 |     test("should display Subway Year card", async ({ page }) => {
  225 |       await page.goto("/stats");
  226 | 
  227 |       // Should see the card with gradient background
  228 |       const card = page.locator(".from-\\[\\#0039A6\\]");
> 229 |       await expect(card).toBeAttached();
      |                          ^ Error: expect(locator).toBeAttached() failed
  230 |     });
  231 | 
  232 |     test("should show total trips", async ({ page }) => {
  233 |       await page.goto("/stats");
  234 | 
  235 |       const tripsElement = page.locator("text=/Trips Taken/i").locator("..");
  236 |       await expect(tripsElement).toBeAttached();
  237 | 
  238 |       const tripsCount = await page
  239 |         .locator("text=/Trips Taken/i")
  240 |         .locator("..")
  241 |         .locator("text=/\\d+/")
  242 |         .first()
  243 |         .textContent();
  244 |       expect(parseInt(tripsCount || "0")).toBeGreaterThan(0);
  245 |     });
  246 | 
  247 |     test("should show time underground", async ({ page }) => {
  248 |       await page.goto("/stats");
  249 | 
  250 |       const timeElement = page.locator("text=/Underground/i").locator("..");
  251 |       await expect(timeElement).toBeAttached();
  252 | 
  253 |       const timeValue = await timeElement
  254 |         .locator("text=/\\d+h\\s*\\d+m|\\d+m/")
  255 |         .first()
  256 |         .textContent();
  257 |       expect(timeValue).toBeTruthy();
  258 |     });
  259 | 
  260 |     test("should show distance traveled", async ({ page }) => {
  261 |       await page.goto("/stats");
  262 | 
  263 |       const distance = page.locator("text=/Distance|km|mi/i");
  264 |       await expect(distance).toBeAttached();
  265 |     });
  266 | 
  267 |     test("should show top station", async ({ page }) => {
  268 |       await page.goto("/stats");
  269 | 
  270 |       const topStation = page.locator("text=/Top Station|Most-Used Station/i");
  271 |       await expect(topStation).toBeAttached();
  272 |     });
  273 | 
  274 |     test("should show top line", async ({ page }) => {
  275 |       await page.goto("/stats");
  276 | 
  277 |       const topLine = page.locator("text=/Top Line|Most-Used Line/i");
  278 |       await expect(topLine).toBeAttached();
  279 |     });
  280 | 
  281 |     test("should show stations visited count", async ({ page }) => {
  282 |       await page.goto("/stats");
  283 | 
  284 |       const stationsVisited = page.locator("text=/Stations Visited/i");
  285 |       await expect(stationsVisited).toBeAttached();
  286 |     });
  287 | 
  288 |     test("should show delay days", async ({ page }) => {
  289 |       await page.goto("/stats");
  290 | 
  291 |       const delayDays = page.locator("text=/Delay Days/i");
  292 |       await expect(delayDays).toBeAttached();
  293 |     });
  294 | 
  295 |     test("should show streak information", async ({ page }) => {
  296 |       await page.goto("/stats");
  297 | 
  298 |       const streak = page.locator("text=/Longest Streak|Current Streak/i");
  299 |       await expect(streak).toBeAttached();
  300 |     });
  301 |   });
  302 | 
  303 |   test.describe("Carbon Savings Section", () => {
  304 |     test.beforeEach(async ({ page }) => {
  305 |       await page.addInitScript(() => {
  306 |         const journalData = {
  307 |           "test-commute": {
  308 |             stats: {
  309 |               totalTrips: 50,
  310 |               totalMinutes: 1000,
  311 |               averageDuration: 20,
  312 |               medianDuration: 19,
  313 |             },
  314 |             records: Array.from({ length: 50 }, (_, i) => ({
  315 |               id: `trip-${i}`,
  316 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  317 |               origin: { stationId: "101", stationName: "South Ferry" },
  318 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  319 |               line: "1",
  320 |               actualDurationMinutes: 20,
  321 |               source: "tracked",
  322 |             })),
  323 |           },
  324 |         };
  325 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  326 |       });
  327 |     });
  328 | 
  329 |     test("should show carbon savings", async ({ page }) => {
```