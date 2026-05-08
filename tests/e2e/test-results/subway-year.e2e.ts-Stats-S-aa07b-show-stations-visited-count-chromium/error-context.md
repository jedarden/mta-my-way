# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: subway-year.e2e.ts >> Stats / Subway Year Screen >> Subway Year Card >> should show stations visited count
- Location: subway-year.e2e.ts:281:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/Stations Visited/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/Stations Visited/i')

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
  229 |       await expect(card).toBeAttached();
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
> 285 |       await expect(stationsVisited).toBeAttached();
      |                                     ^ Error: expect(locator).toBeAttached() failed
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
  330 |       await page.goto("/stats");
  331 | 
  332 |       const carbonSavings = page.locator("text=/CO₂ Saved|Carbon Savings|kg of CO₂/i");
  333 |       await expect(carbonSavings).toBeAttached();
  334 |     });
  335 | 
  336 |     test("should show environmental equivalents", async ({ page }) => {
  337 |       await page.goto("/stats");
  338 | 
  339 |       // Should show trees equivalent
  340 |       const trees = page.locator("text=/trees|worth of trees/i");
  341 |       await expect(trees).toBeAttached();
  342 | 
  343 |       // Should show flights equivalent
  344 |       const flights = page.locator("text=/NYC↔LA|flights/i");
  345 |       await expect(flights).toBeAttached();
  346 | 
  347 |       // Should show car-free days
  348 |       const carFree = page.locator("text=/car-free|days/i");
  349 |       await expect(carFree).toBeAttached();
  350 |     });
  351 |   });
  352 | 
  353 |   test.describe("Stats Details", () => {
  354 |     test.beforeEach(async ({ page }) => {
  355 |       await page.addInitScript(() => {
  356 |         const journalData = {
  357 |           "test-commute": {
  358 |             stats: {
  359 |               totalTrips: 50,
  360 |               totalMinutes: 1000,
  361 |               averageDuration: 20,
  362 |               medianDuration: 19,
  363 |             },
  364 |             records: Array.from({ length: 50 }, (_, i) => ({
  365 |               id: `trip-${i}`,
  366 |               date: new Date(Date.now() - i * 86400000).toISOString().split("T")[0],
  367 |               origin: { stationId: "101", stationName: "South Ferry" },
  368 |               destination: { stationId: "725", stationName: "Times Sq-42 St" },
  369 |               line: "1",
  370 |               actualDurationMinutes: 20,
  371 |               source: "tracked",
  372 |             })),
  373 |           },
  374 |         };
  375 |         localStorage.setItem("mta-journal", JSON.stringify(journalData));
  376 |       });
  377 |     });
  378 | 
  379 |     test("should display overview section", async ({ page }) => {
  380 |       await page.goto("/stats");
  381 | 
  382 |       const overview = page.locator("text=/Overview|Details/i");
  383 |       await expect(overview).toBeAttached();
  384 |     });
  385 | 
```