# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: fare-tracking.e2e.ts >> Fare Tracking >> Monthly Comparison >> should show unlimited pass is better when applicable
- Location: fare-tracking.e2e.ts:215:5

# Error details

```
Error: expect(locator).toBeAttached() failed

Locator: locator('text=/Unlimited saves/i')
Expected: attached
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeAttached" with timeout 5000ms
  - waiting for locator('text=/Unlimited saves/i')

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
  132 |       const freeRides = page.locator("text=/Free rides|12\\/12/i");
  133 |       await expect(freeRides).toBeAttached();
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
> 232 |       await expect(unlimitedText).toBeAttached();
      |                                   ^ Error: expect(locator).toBeAttached() failed
  233 |     });
  234 | 
  235 |     test("should show comparison values", async ({ page }) => {
  236 |       await page.addInitScript(() => {
  237 |         const fareData = {
  238 |           weeklyRides: 8,
  239 |           monthlyRides: 32,
  240 |           currentFare: 2.9,
  241 |           unlimitedPassPrice: 132,
  242 |           lastReset: new Date().toISOString(),
  243 |         };
  244 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  245 |       });
  246 | 
  247 |       await page.goto("/");
  248 | 
  249 |       // Should show both pay-per-ride and unlimited amounts
  250 |       const payPerRide = page.locator("text=/Pay-per-ride:\\s*\\$\\d+/i");
  251 |       const unlimited = page.locator("text=/Unlimited:\\s*\\$\\d+/i");
  252 | 
  253 |       await expect(payPerRide).toBeAttached();
  254 |       await expect(unlimited).toBeAttached();
  255 |     });
  256 |   });
  257 | 
  258 |   test.describe("Nudge Message", () => {
  259 |     test("should show nudge at 10 rides", async ({ page }) => {
  260 |       await page.addInitScript(() => {
  261 |         const fareData = {
  262 |           weeklyRides: 10,
  263 |           monthlyRides: 40,
  264 |           currentFare: 2.9,
  265 |           unlimitedPassPrice: 132,
  266 |           lastReset: new Date().toISOString(),
  267 |         };
  268 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  269 |       });
  270 | 
  271 |       await page.goto("/");
  272 | 
  273 |       // Should show nudge banner
  274 |       const nudge = page.locator("text=/Take 1 more ride|1 more round trip/i");
  275 |       await expect(nudge).toBeAttached();
  276 |     });
  277 | 
  278 |     test("should show nudge at 11 rides", async ({ page }) => {
  279 |       await page.addInitScript(() => {
  280 |         const fareData = {
  281 |           weeklyRides: 11,
  282 |           monthlyRides: 44,
  283 |           currentFare: 2.9,
  284 |           unlimitedPassPrice: 132,
  285 |           lastReset: new Date().toISOString(),
  286 |         };
  287 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  288 |       });
  289 | 
  290 |       await page.goto("/");
  291 | 
  292 |       // Should show nudge banner
  293 |       const nudge = page.locator("text=/Take.*for free rides/i");
  294 |       await expect(nudge).toBeAttached();
  295 |     });
  296 | 
  297 |     test("should not show nudge when cap is reached", async ({ page }) => {
  298 |       await page.addInitScript(() => {
  299 |         const fareData = {
  300 |           weeklyRides: 12,
  301 |           monthlyRides: 48,
  302 |           currentFare: 2.9,
  303 |           unlimitedPassPrice: 132,
  304 |           lastReset: new Date().toISOString(),
  305 |         };
  306 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  307 |       });
  308 | 
  309 |       await page.goto("/");
  310 | 
  311 |       // Should not show nudge banner
  312 |       const nudge = page.locator("text=/Take 1 more ride/i");
  313 |       const hasNudge = await nudge.count();
  314 |       expect(hasNudge).toBe(0);
  315 |     });
  316 | 
  317 |     test("should not show nudge when far from cap", async ({ page }) => {
  318 |       await page.addInitScript(() => {
  319 |         const fareData = {
  320 |           weeklyRides: 5,
  321 |           monthlyRides: 20,
  322 |           currentFare: 2.9,
  323 |           unlimitedPassPrice: 132,
  324 |           lastReset: new Date().toISOString(),
  325 |         };
  326 |         localStorage.setItem("mta-fare", JSON.stringify(fareData));
  327 |       });
  328 | 
  329 |       await page.goto("/");
  330 | 
  331 |       // Should not show nudge banner
  332 |       const nudge = page.locator("text=/Take.*more.*for free/i");
```