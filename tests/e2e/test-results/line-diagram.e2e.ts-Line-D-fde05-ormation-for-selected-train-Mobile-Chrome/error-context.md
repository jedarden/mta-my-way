# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: line-diagram.e2e.ts >> Line Diagram Screen >> Train Interaction >> should show trip information for selected train
- Location: line-diagram.e2e.ts:187:5

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
  148 | 
  149 |         const firstBox = await firstTrain.boundingBox();
  150 |         const lastBox = await lastTrain.boundingBox();
  151 | 
  152 |         expect(firstBox).toBeTruthy();
  153 |         expect(lastBox).toBeTruthy();
  154 | 
  155 |         if (firstBox && lastBox) {
  156 |           // Trains should be at different positions
  157 |           const positionsDiffer =
  158 |             Math.abs(firstBox.x - lastBox.x) > 10 || Math.abs(firstBox.y - lastBox.y) > 10;
  159 |           expect(positionsDiffer).toBe(true);
  160 |         }
  161 |       }
  162 |     });
  163 |   });
  164 | 
  165 |   test.describe("Train Interaction", () => {
  166 |     test("should show train details on tap", async ({ page }) => {
  167 |       await page.waitForSelector("svg", { timeout: 10000 });
  168 | 
  169 |       const train = page.locator("[class*='train' i], [data-train]").first();
  170 |       const hasTrain = await train.count();
  171 | 
  172 |       if (hasTrain > 0) {
  173 |         await train.click();
  174 | 
  175 |         // Should show details (modal, tooltip, or navigate)
  176 |         const details = page.locator(
  177 |           "[role='dialog'], [role='tooltip'], [class*='details' i], [class*='modal' i]"
  178 |         );
  179 |         const hasDetails = await details.count();
  180 | 
  181 |         if (hasDetails > 0) {
  182 |           await expect(details.first()).toBeVisible();
  183 |         }
  184 |       }
  185 |     });
  186 | 
  187 |     test("should show trip information for selected train", async ({ page }) => {
> 188 |       await page.waitForSelector("svg", { timeout: 10000 });
      |                  ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  189 | 
  190 |       const train = page.locator("[class*='train' i], [data-trip]").first();
  191 |       const hasTrain = await train.count();
  192 | 
  193 |       if (hasTrain > 0) {
  194 |         await train.click();
  195 | 
  196 |         // Look for trip details (destination, arrival time, etc.)
  197 |         const tripInfo = page.locator("text=/destination|arriving|trip/i");
  198 |         await expect(tripInfo).toBeAttached();
  199 |       }
  200 |     });
  201 |   });
  202 | 
  203 |   test.describe("Station Interaction", () => {
  204 |     test("should allow tapping stations to view details", async ({ page }) => {
  205 |       await page.waitForSelector("svg", { timeout: 5000 });
  206 | 
  207 |       const station = page.locator("circle, [role='button']").first();
  208 |       const hasStation = await station.count();
  209 | 
  210 |       if (hasStation > 0) {
  211 |         await station.click();
  212 | 
  213 |         // Should show station details or navigate
  214 |         const url = page.url();
  215 |         const navigated = url.includes("/station/");
  216 |         const modal = page.locator("[role='dialog']");
  217 |         const hasModal = await modal.count();
  218 | 
  219 |         expect(navigated || hasModal > 0).toBe(true);
  220 |       }
  221 |     });
  222 | 
  223 |     test("should show arrivals at tapped station", async ({ page }) => {
  224 |       await page.waitForSelector("svg", { timeout: 5000 });
  225 | 
  226 |       const station = page.locator("circle, [role='button']").first();
  227 |       const hasStation = await station.count();
  228 | 
  229 |       if (hasStation > 0) {
  230 |         await station.click();
  231 | 
  232 |         // Should see arrivals information
  233 |         const arrivals = page.locator("text=/arriv|min|depart/i");
  234 |         await expect(arrivals).toBeAttached();
  235 |       }
  236 |     });
  237 |   });
  238 | 
  239 |   test.describe("Line Selection", () => {
  240 |     test("should have line selector or menu", async ({ page }) => {
  241 |       await page.goto("/map"); // Map screen has line selector
  242 | 
  243 |       const lineSelector = page
  244 |         .locator('role=button:has-text("Filter")')
  245 |         .or(page.locator("[role='combobox'], [role='menu']"));
  246 |       const hasSelector = await lineSelector.count();
  247 | 
  248 |       if (hasSelector > 0) {
  249 |         await expect(lineSelector.first()).toBeVisible();
  250 |       }
  251 |     });
  252 | 
  253 |     test("should allow switching between lines", async ({ page }) => {
  254 |       await page.goto("/diagram/1");
  255 | 
  256 |       // Look for line switcher
  257 |       const lineSwitcher = page.locator('role=button:has-text(/A|C|E|2|3/), [role="menu"]').first();
  258 |       const hasSwitcher = await lineSwitcher.count();
  259 | 
  260 |       if (hasSwitcher > 0) {
  261 |         await lineSwitcher.click();
  262 | 
  263 |         // Select a different line
  264 |         const lineOption = page.locator("role=menuitem, role=option").first();
  265 |         const hasOption = await lineOption.count();
  266 | 
  267 |         if (hasOption > 0) {
  268 |           await lineOption.click();
  269 | 
  270 |           // Diagram should update
  271 |           const diagram = page.locator("svg");
  272 |           await expect(diagram.first()).toBeVisible();
  273 |         }
  274 |       }
  275 |     });
  276 |   });
  277 | 
  278 |   test.describe("Zoom and Pan", () => {
  279 |     test("should support pinch to zoom", async ({ page }) => {
  280 |       await page.waitForSelector("svg", { timeout: 5000 });
  281 | 
  282 |       const diagram = page.locator("svg").first();
  283 | 
  284 |       // Get initial size
  285 |       const initialBox = await diagram.boundingBox();
  286 |       expect(initialBox).toBeTruthy();
  287 | 
  288 |       if (initialBox) {
```